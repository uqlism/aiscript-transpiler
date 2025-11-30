import type { Ast } from "@syuilo/aiscript";
import * as ts from "typescript";
import { reservedWords } from "./consts.js";

/**
 * TypeScript位置情報付きトランスパイラーエラー
 */
export class TranspilerError extends Error {
	constructor(
		message: string,
		public node: ts.Node,
		public sourceFile: ts.SourceFile,
	) {
		super(message);
		this.name = "TranspilerError";
	}

	getPosition() {
		const start = this.sourceFile.getLineAndCharacterOfPosition(
			this.node.getStart(),
		);
		const end = this.sourceFile.getLineAndCharacterOfPosition(
			this.node.getEnd(),
		);
		return {
			startLine: start.line + 1,
			startColumn: start.character + 1,
			endLine: end.line + 1,
			endColumn: end.character + 1,
		};
	}
}

export class Transpiler {
	#pluiginFactories: (new (
		converter: TranspilerContext,
	) => TranspilerPlugin)[];

	constructor() {
		this.#pluiginFactories = [];
	}

	addPlugin(
		pluginFactory: new (converter: TranspilerContext) => TranspilerPlugin,
	) {
		this.#pluiginFactories.push(pluginFactory);
	}

	/**
	 * TypeScript Programを受け取ってAiScript ASTに変換する
	 * 核となる変換処理のみを行う
	 */
	transpileProgram(
		program: ts.Program,
		entrySourceFile: ts.SourceFile,
		doTypeCheck = true,
	): Ast.Node[] {

		const context = new TranspilerContextImpl(entrySourceFile, doTypeCheck, program)
		this.#pluiginFactories.forEach(x => { context.addPlugin(x) });


		const result: Ast.Node[] = [];

		// Process all imported modules first
		for (const { id, source } of context.getImportedModules()) {
			// Create eval block for this module
			const moduleStatements: (Ast.Expression | Ast.Statement)[] = [];
			ts.forEachChild(source, (node) => {
				switch (true) {
					case node.kind === ts.SyntaxKind.EndOfFileToken:
						return;
					case ts.isStatement(node):
						moduleStatements.push(
							...context.convertStatementAsStatements(node),
						);
						return;
					default:
						throw new Error("unknown node");
				}
			});
			const exportVars = context.popExports()
			// If there are exports, add an export object at the end
			if (exportVars.size > 0) {
				const exportObj: Ast.Obj = {
					type: "obj",
					value: new Map(),
					loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
				};
				for (const exportName of exportVars) {
					exportObj.value.set(exportName, {
						type: "identifier",
						name: exportName,
						loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
					});
				}
				moduleStatements.push(exportObj);
			}

			// Add the module as an eval block
			if (moduleStatements.length > 0) {
				const moduleBlock: Ast.Block = {
					type: "block",
					statements: moduleStatements,
					loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
				};

				// Assign the module result to the module identifier
				const moduleAssignment: Ast.Definition = {
					type: "def",
					dest: id,
					expr: moduleBlock,
					mut: false,
					attr: [],
					loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
				};

				result.push(moduleAssignment);
			}
		}

		// Process the entry file
		ts.forEachChild(entrySourceFile, (node) => {
			switch (true) {
				case node.kind === ts.SyntaxKind.EndOfFileToken:
					return;
				case ts.isExpression(node):
					result.push(...context.convertExpressionAsStatements(node));
					return;
				case ts.isStatement(node):
					result.push(...context.convertStatementAsStatements(node));
					return;
				default:
					throw new Error("unknown node");
			}
		});
		return result;
	}
}

export type TranspilerContext = {
	convertExpressionAsExpression(expr: ts.Expression): Ast.Expression;
	convertExpressionAsStatements(
		expr: ts.Expression,
	): (Ast.Expression | Ast.Statement)[];
	convertStatementAsStatements(
		expr: ts.Statement,
	): (Ast.Expression | Ast.Statement)[];
	getUniqueIdentifier(): Ast.Identifier;
	validateVariableName(name: string, node: ts.Node): void;
	throwError(message: string, node: ts.Node): never;
	typeChecker: ts.TypeChecker;
	doTypeCheck: boolean;

	// モジュール関連
	getModuleRef(importPath: string): Ast.Identifier;
	addExport(name: string): void;
};

class TranspilerContextImpl implements TranspilerContext {
	#plugins: TranspilerPlugin[];
	#entrySourceFile: ts.SourceFile;
	#uniqueIdCounter = 0;
	#program: ts.Program;
	#modulePathToId: Map<string, Ast.Identifier>;
	#exportVars: Set<string>;
	constructor(
		entrySourceFile: ts.SourceFile,
		doTypeCheck: boolean,
		program: ts.Program,
	) {
		this.#entrySourceFile = entrySourceFile
		this.#program = program
		this.#plugins = []
		this.typeChecker = program.getTypeChecker()
		this.doTypeCheck = doTypeCheck
		this.#uniqueIdCounter = 0

		this.#modulePathToId = new Map<string, Ast.Identifier>();
		this.#exportVars = new Set<string>();

		for (const sourceFile of program.getSourceFiles()) {
			// TypeScript組み込みライブラリファイルをスキップ
			if (
				sourceFile.fileName.includes("node_modules") ||
				sourceFile.fileName.includes("lib.")
			) {
				continue;
			}
			// エントリファイル以外をモジュールとして登録
			if (sourceFile.fileName !== entrySourceFile.fileName) {
				const moduleId = this.getUniqueIdentifier();
				this.#modulePathToId.set(sourceFile.fileName, moduleId);
			}
		}
	}
	addPlugin(pluginFactory: new (converter: TranspilerContext) => TranspilerPlugin) {
		this.#plugins.push(new pluginFactory(this));
	}
	convertExpressionAsExpression(expr: ts.Expression): Ast.Expression {
		for (const plugin of this.#plugins) {
			const result = plugin.tryConvertExpressionAsExpression?.(expr);
			if (result !== undefined) {
				return result;
			}
		}
		throw new TranspilerError("Expression not supported", expr, this.#entrySourceFile,);
	}
	convertExpressionAsStatements(expr: ts.Expression): (Ast.Expression | Ast.Statement)[] {
		for (const plugin of this.#plugins) {
			const result = plugin.tryConvertExpressionAsStatements?.(expr);
			if (result !== undefined) {
				return result;
			}
		}
		return [this.convertExpressionAsExpression(expr)];
	}
	convertStatementAsStatements(node: ts.Statement): (Ast.Expression | Ast.Statement)[] {
		for (const plugin of this.#plugins) {
			const result = plugin.tryConvertStatementAsStatements?.(node);
			if (result !== undefined) {
				return result;
			}
		}
		throw new TranspilerError(`Statement not supported ${node.getText()}`, node, this.#entrySourceFile,);
	}
	getUniqueIdentifier(): Ast.Identifier {
		this.#uniqueIdCounter++;
		const idStr = this.#uniqueIdCounter.toString(36).padStart(5, "0");
		const name = `__gen_${idStr}`;
		return { type: "identifier", name, loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } }, };
	}
	validateVariableName(name: string, node: ts.Node): void {
		if (reservedWords.includes(name)) {
			this.throwError("予約語を変数名にすることはできません", node)
		}
	}
	throwError(message: string, node: ts.Node): never {
		throw new TranspilerError(message, node, node.getSourceFile());
	}
	typeChecker: ts.TypeChecker;
	doTypeCheck: boolean;
	getModuleRef(importPath: string): Ast.Identifier {
		// TypeScriptのコンパイラAPIを使用してモジュール解決
		const resolution = ts.resolveModuleName(
			importPath,
			this.#entrySourceFile.fileName,
			this.#program.getCompilerOptions(),
			ts.sys,
		);

		if (resolution.resolvedModule?.resolvedFileName) {
			const resolvedPath = resolution.resolvedModule.resolvedFileName;
			const moduleId = this.#modulePathToId.get(resolvedPath);
			if (moduleId) return moduleId;
		}

		if ("failedLookupLocations" in resolution) {
			for (const i of resolution.failedLookupLocations as string[]) {
				const moduleId = this.#modulePathToId.get(i);
				if (moduleId) return moduleId;
			}
		}
		throw new Error(`Module not found for import path: ${importPath}`);
	}
	addExport(name: string): void {
		this.#exportVars.add(name);
	}
	popExports(): Set<string> {
		const result = this.#exportVars
		this.#exportVars = new Set<string>();
		return result
	}
	/** エントリファイル以外のファイルをidとともに返す */
	* getImportedModules() {
		for (const [modulePath, moduleId] of this.#modulePathToId) {
			const moduleSourceFile = this.#program.getSourceFile(modulePath);
			if (!moduleSourceFile) {
				throw new Error(`Module source file not found: ${modulePath}`);
			}
			yield { source: moduleSourceFile, id: moduleId }
		}
	}
}

export class TranspilerPlugin {
	protected converter: TranspilerContext;
	constructor(converter: TranspilerContext) {
		this.converter = converter;
	}
	tryConvertExpressionAsExpression?: (
		node: ts.Expression,
	) => Ast.Expression | undefined;
	tryConvertExpressionAsStatements?: (
		node: ts.Expression,
	) => (Ast.Expression | Ast.Statement)[] | undefined;
	tryConvertStatementAsStatements?: (
		node: ts.Statement,
	) => (Ast.Expression | Ast.Statement)[] | undefined;
}
