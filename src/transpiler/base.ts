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
	#namespaces: string[];

	constructor(namespaces: string[] = []) {
		this.#pluiginFactories = [];
		this.#namespaces = namespaces;
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
		const context = new TranspilerContextImpl(
			entrySourceFile,
			doTypeCheck,
			program,
			this.#namespaces,
		);
		this.#pluiginFactories.forEach((x) => {
			context.addPlugin(x);
		});

		// Get modules sorted by dependency order (includes circular dependency check)
		const sortedModules = context.getSortedModules();

		const result: Ast.Node[] = [];

		// Process modules in dependency order (dependencies first)
		for (const { source, id } of sortedModules) {
			if (source === entrySourceFile || !id) {
				continue; // Skip entry file and modules without ID
			}
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
			const exportVars = context.popExports();
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

	getNamespaces(): string[];

	// モジュール関連
	getModuleRef(importPath: string): Ast.Identifier;
	addExport(name: string): void;
};

class TranspilerContextImpl implements TranspilerContext {
	#plugins: TranspilerPlugin[];
	#entrySourceFile: ts.SourceFile;
	#uniqueIdCounter = 0;
	#program: ts.Program;
	#exportVars: Set<string>;
	#sortedModules: {
		source: ts.SourceFile;
		fileName: string;
		id?: Ast.Identifier;
	}[];
	#namespaces: string[];
	constructor(
		entrySourceFile: ts.SourceFile,
		doTypeCheck: boolean,
		program: ts.Program,
		namespaces: string[],
	) {
		this.#entrySourceFile = entrySourceFile;
		this.#program = program;
		this.#plugins = [];
		this.typeChecker = program.getTypeChecker();
		this.doTypeCheck = doTypeCheck;
		this.#uniqueIdCounter = 0;
		this.#exportVars = new Set<string>();
		this.#namespaces = namespaces;

		// Build sorted modules with dependency order and circular dependency check
		this.#sortedModules = this.buildSortedModules();
	}
	addPlugin(
		pluginFactory: new (converter: TranspilerContext) => TranspilerPlugin,
	) {
		this.#plugins.push(new pluginFactory(this));
	}
	convertExpressionAsExpression(expr: ts.Expression): Ast.Expression {
		for (const plugin of this.#plugins) {
			const result = plugin.tryConvertExpressionAsExpression?.(expr);
			if (result !== undefined) {
				return result;
			}
		}
		throw new TranspilerError(
			"Expression not supported",
			expr,
			this.#entrySourceFile,
		);
	}
	convertExpressionAsStatements(
		expr: ts.Expression,
	): (Ast.Expression | Ast.Statement)[] {
		for (const plugin of this.#plugins) {
			const result = plugin.tryConvertExpressionAsStatements?.(expr);
			if (result !== undefined) {
				return result;
			}
		}
		return [this.convertExpressionAsExpression(expr)];
	}
	convertStatementAsStatements(
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] {
		for (const plugin of this.#plugins) {
			const result = plugin.tryConvertStatementAsStatements?.(node);
			if (result !== undefined) {
				return result;
			}
		}
		throw new TranspilerError(
			`Statement not supported ${node.getText()}`,
			node,
			this.#entrySourceFile,
		);
	}
	getUniqueIdentifier(): Ast.Identifier {
		this.#uniqueIdCounter++;
		const idStr = this.#uniqueIdCounter.toString(36).padStart(5, "0");
		const name = `__${idStr}`;
		return {
			type: "identifier",
			name,
			loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
		};
	}
	validateVariableName(name: string, node: ts.Node): void {
		if (reservedWords.includes(name)) {
			this.throwError("予約語を変数名にすることはできません", node);
		}
		if (name.startsWith("__")) {
			this.throwError("__から始まる変数名は使用できません", node);
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
			const module = this.#sortedModules.find(
				(m) => m.fileName === resolvedPath,
			);
			if (module?.id) return module.id;
		}

		if ("failedLookupLocations" in resolution) {
			for (const lookupPath of resolution.failedLookupLocations as string[]) {
				const module = this.#sortedModules.find(
					(m) => m.fileName === lookupPath,
				);
				if (module?.id) return module.id;
			}
		}
		throw new Error(`Module not found for import path: ${importPath}`);
	}
	getNamespaces(): string[] {
		return this.#namespaces;
	}
	addExport(name: string): void {
		this.#exportVars.add(name);
	}
	popExports(): Set<string> {
		const result = this.#exportVars;
		this.#exportVars = new Set<string>();
		return result;
	}
	/** エントリファイル以外のファイルをidとともに返す */
	*getImportedModules() {
		for (const module of this.#sortedModules) {
			if (module.source !== this.#entrySourceFile && module.id) {
				yield { source: module.source, id: module.id };
			}
		}
	}

	/**
	 * 依存関係を解析し、循環参照をチェックしつつ、依存関係順にソートされたモジュールリストを構築する
	 * 子モジュールから親モジュール順 (subSubModule, subModule, entryModule)
	 */
	buildSortedModules(): {
		source: ts.SourceFile;
		fileName: string;
		id?: Ast.Identifier;
	}[] {
		const dependencyGraph = new Map<string, Set<string>>();

		const sourceFiles = this.#program.getSourceFiles().filter((sourceFile) => {
			if (
				sourceFile.fileName.includes("node_modules") ||
				sourceFile.fileName.includes("lib.")
			) {
				return false;
			}
			return true;
		});

		const allFiles = new Set(sourceFiles.map((x) => x.fileName));

		// build dependency graph
		for (const sourceFile of sourceFiles) {
			const dependencies = new Set<string>();

			ts.forEachChild(sourceFile, (node) => {
				if (
					ts.isImportDeclaration(node) &&
					node.moduleSpecifier &&
					ts.isStringLiteral(node.moduleSpecifier)
				) {
					const importPath = node.moduleSpecifier.text;

					// Resolve the import path
					const resolution = ts.resolveModuleName(
						importPath,
						sourceFile.fileName,
						this.#program.getCompilerOptions(),
						ts.sys,
					);

					if (resolution.resolvedModule?.resolvedFileName) {
						dependencies.add(resolution.resolvedModule.resolvedFileName);
					} else if ("failedLookupLocations" in resolution) {
						// Try failed lookup locations for test environment
						for (const lookupPath of resolution.failedLookupLocations as string[]) {
							if (allFiles.has(lookupPath)) {
								dependencies.add(lookupPath);
								break;
							}
						}
					} else {
						throw new Error(
							`Module not found: ${importPath} from ${sourceFile.fileName}`,
						);
					}
				}
			});
			dependencyGraph.set(sourceFile.fileName, dependencies);
		}

		// Topological sort with cycle detection
		const visited = new Set<string>();
		const recursionStack = new Set<string>();
		const sortedFiles: string[] = [];

		const dfs = (fileName: string, path: string[] = []): void => {
			if (recursionStack.has(fileName)) {
				// Found circular dependency
				const cycleStart = path.indexOf(fileName);
				const cycle = path.slice(cycleStart).concat([fileName]);
				throw new Error(`循環参照が検出されました: ${cycle.join(" -> ")}`);
			}

			if (visited.has(fileName)) {
				return;
			}

			visited.add(fileName);
			recursionStack.add(fileName);

			const dependencies = dependencyGraph.get(fileName);
			if (!dependencies) {
				throw new Error(`File not found in dependency graph: ${fileName}`);
			}
			for (const dependency of dependencies) {
				dfs(dependency, [...path, fileName]);
			}

			recursionStack.delete(fileName);
			sortedFiles.push(fileName);
		};

		// Sort all files
		for (const fileName of allFiles) {
			if (!visited.has(fileName)) {
				dfs(fileName);
			}
		}

		// Convert to result format and generate IDs in sorted order
		const result: {
			source: ts.SourceFile;
			fileName: string;
			id?: Ast.Identifier;
		}[] = [];
		for (const fileName of sortedFiles) {
			const sourceFile = this.#program.getSourceFile(fileName);
			if (!sourceFile) {
				throw new Error(`Source file not found: ${fileName}`);
			}

			// Generate unique ID for non-entry modules in sorted order
			const moduleId =
				sourceFile !== this.#entrySourceFile
					? this.getUniqueIdentifier()
					: undefined;
			result.push({ source: sourceFile, fileName, id: moduleId });
		}

		return result;
	}

	getSortedModules(): {
		source: ts.SourceFile;
		fileName: string;
		id?: Ast.Identifier;
	}[] {
		return this.#sortedModules;
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
