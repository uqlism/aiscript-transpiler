import * as path from "node:path";
import type { Ast } from "@syuilo/aiscript";
import * as ts from "typescript";
import { reservedWords } from "./consts.js";

/** モジュールオブジェクトの変数名 */
const MODULES_VAR = "__modules";
/** 正規表現コンパイル関数名 */
export const REGEX_COMPILE_FN = "__re_compile";
const emptyLoc = { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } };

export type RegexHoist = { id: Ast.Identifier; pattern: string; flags: string };

function buildRegexHoistDefs(hoists: RegexHoist[]): Ast.Definition[] {
	return hoists.map(({ id, pattern, flags }) => ({
		type: "def" as const,
		dest: id,
		expr: {
			type: "call" as const,
			target: { type: "identifier" as const, name: REGEX_COMPILE_FN, loc: emptyLoc },
			args: [
				{ type: "str" as const, value: pattern, loc: emptyLoc },
				{ type: "str" as const, value: flags, loc: emptyLoc },
			],
			loc: emptyLoc,
		},
		mut: false,
		attr: [],
		loc: emptyLoc,
	}));
}

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
	 * @param regexLibNodes 正規表現が使われた場合に先頭に挿入するライブラリノード列
	 */
	transpileProgram(
		program: ts.Program,
		entrySourceFile: ts.SourceFile,
		doTypeCheck = true,
		regexLibNodes?: Ast.Node[],
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
		const nonEntryModules = sortedModules.filter(
			(m) => m.modulePath !== undefined,
		);

		const result: Ast.Node[] = [];
		let anyRegexUsed = false;

		// モジュールが存在する場合は __modules オブジェクトを宣言する
		if (nonEntryModules.length > 0) {
			result.push({
				type: "def",
				dest: { type: "identifier", name: MODULES_VAR, loc: emptyLoc },
				expr: { type: "obj", value: new Map(), loc: emptyLoc },
				mut: true, // var (mutable) — 後でインデックス代入するため
				attr: [],
				loc: emptyLoc,
			} satisfies Ast.Definition);
		}

		// Process modules in dependency order (dependencies first)
		for (const { source, modulePath } of sortedModules) {
			if (!modulePath) continue; // エントリファイルはスキップ

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
			// モジュール内の正規表現リテラルをホイスト
			const modRegexHoists = context.popRegexHoists();
			if (modRegexHoists.length > 0) {
				anyRegexUsed = true;
				moduleStatements.unshift(...buildRegexHoistDefs(modRegexHoists));
			}

			const exportVars = context.popExports();
			const reExportAlls = context.popReExportAlls();

			// エクスポートオブジェクトを生成して末尾に追加
			if (exportVars.size > 0 || reExportAlls.length > 0) {
				const localExportObj: Ast.Obj = {
					type: "obj",
					value: new Map(),
					loc: emptyLoc,
				};
				for (const exportName of exportVars) {
					localExportObj.value.set(exportName, {
						type: "identifier",
						name: exportName,
						loc: emptyLoc,
					});
				}

				// export * from './other' がある場合は Obj:merge で連結
				let exportExpr: Ast.Expression = localExportObj;
				for (const sourceRef of reExportAlls) {
					exportExpr = {
						type: "call",
						target: { type: "identifier", name: "Obj:merge", loc: emptyLoc },
						args: [exportExpr, sourceRef],
						loc: emptyLoc,
					};
				}
				moduleStatements.push(exportExpr);
			}

			// __modules["relative/path"] = eval { ... }
			if (moduleStatements.length > 0) {
				result.push({
					type: "assign",
					dest: {
						type: "index",
						target: { type: "identifier", name: MODULES_VAR, loc: emptyLoc },
						index: { type: "str", value: modulePath, loc: emptyLoc },
						loc: emptyLoc,
					},
					expr: { type: "block", statements: moduleStatements, loc: emptyLoc },
					loc: emptyLoc,
				} satisfies Ast.Assign);
			}
		}

		// Process the entry file
		const entryNodes: Ast.Node[] = [];
		ts.forEachChild(entrySourceFile, (node) => {
			switch (true) {
				case node.kind === ts.SyntaxKind.EndOfFileToken:
					return;
				case ts.isExpression(node):
					entryNodes.push(...context.convertExpressionAsStatements(node));
					return;
				case ts.isStatement(node):
					entryNodes.push(...context.convertStatementAsStatements(node));
					return;
				default:
					throw new Error("unknown node");
			}
		});

		// エントリファイルの正規表現リテラルをホイスト
		const entryRegexHoists = context.popRegexHoists();
		if (entryRegexHoists.length > 0) {
			anyRegexUsed = true;
			result.push(...buildRegexHoistDefs(entryRegexHoists));
		}
		result.push(...entryNodes);

		// 正規表現が使われていたらライブラリを先頭に挿入
		if (anyRegexUsed && regexLibNodes && regexLibNodes.length > 0) {
			result.unshift(...regexLibNodes);
		}

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
	getModuleRef(importPath: string): Ast.Expression;
	addExport(name: string): void;
	/** export * from './other' 用: 丸ごと再エクスポートするモジュール参照を登録 */
	addReExportAll(moduleRef: Ast.Expression): void;

	// 正規表現リテラルのホイスト
	registerRegexLiteral(pattern: string, flags: string): Ast.Identifier;
	popRegexHoists(): RegexHoist[];
};

class TranspilerContextImpl implements TranspilerContext {
	#plugins: TranspilerPlugin[];
	#entrySourceFile: ts.SourceFile;
	#uniqueIdCounter = 0;
	#program: ts.Program;
	#exportVars: Set<string>;
	#reExportAlls: Ast.Expression[];
	#sortedModules: {
		source: ts.SourceFile;
		fileName: string;
		/** エントリからの相対パス（拡張子なし）。エントリファイル自身は undefined */
		modulePath?: string;
	}[];
	#namespaces: string[];
	#regexLiterals: Map<string, RegexHoist>;
	#regexCounter = 0;
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
		this.#reExportAlls = [];
		this.#namespaces = namespaces;
		this.#regexLiterals = new Map();

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
	getModuleRef(importPath: string): Ast.Expression {
		// TypeScriptのコンパイラAPIを使用してモジュール解決
		const resolution = ts.resolveModuleName(
			importPath,
			this.#entrySourceFile.fileName,
			this.#program.getCompilerOptions(),
			ts.sys,
		);

		const findModule = (fileName: string) =>
			this.#sortedModules.find((m) => m.fileName === fileName);

		let mod = resolution.resolvedModule?.resolvedFileName
			? findModule(resolution.resolvedModule.resolvedFileName)
			: undefined;

		if (!mod && "failedLookupLocations" in resolution) {
			for (const loc of resolution.failedLookupLocations as string[]) {
				mod = findModule(loc);
				if (mod) break;
			}
		}

		if (!mod?.modulePath) {
			throw new Error(`Module not found for import path: ${importPath}`);
		}

		// __modules["relative/path"] というインデックスアクセス式を返す
		return {
			type: "index",
			target: { type: "identifier", name: MODULES_VAR, loc: emptyLoc },
			index: { type: "str", value: mod.modulePath, loc: emptyLoc },
			loc: emptyLoc,
		};
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
	addReExportAll(moduleRef: Ast.Expression): void {
		this.#reExportAlls.push(moduleRef);
	}
	popReExportAlls(): Ast.Expression[] {
		const result = this.#reExportAlls;
		this.#reExportAlls = [];
		return result;
	}
	registerRegexLiteral(pattern: string, flags: string): Ast.Identifier {
		const key = `${pattern}\0${flags}`;
		const existing = this.#regexLiterals.get(key);
		if (existing) return existing.id;
		const id: Ast.Identifier = {
			type: "identifier",
			name: `__re${this.#regexCounter++}`,
			loc: emptyLoc,
		};
		this.#regexLiterals.set(key, { id, pattern, flags });
		return id;
	}
	popRegexHoists(): RegexHoist[] {
		const result = [...this.#regexLiterals.values()];
		this.#regexLiterals = new Map();
		this.#regexCounter = 0;
		return result;
	}
	/** エントリファイル以外のモジュールを返す */
	*getImportedModules() {
		for (const module of this.#sortedModules) {
			if (module.modulePath !== undefined) {
				yield { source: module.source, modulePath: module.modulePath };
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
				sourceFile.fileName.includes("lib.") ||
				sourceFile.isDeclarationFile // .d.ts は型定義のみで実行コードなし
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

		// エントリファイルのディレクトリ（モジュールの相対パス計算に使用）
		const entryDir = path.dirname(this.#entrySourceFile.fileName);

		const result: {
			source: ts.SourceFile;
			fileName: string;
			modulePath?: string;
		}[] = [];
		for (const fileName of sortedFiles) {
			const sourceFile = this.#program.getSourceFile(fileName);
			if (!sourceFile) {
				throw new Error(`Source file not found: ${fileName}`);
			}

			// エントリ以外のモジュールは相対パス（拡張子なし）をキーとして使う
			const modulePath =
				sourceFile !== this.#entrySourceFile
					? path.relative(entryDir, fileName).replace(/\.tsx?$/, "")
					: undefined;
			result.push({ source: sourceFile, fileName, modulePath });
		}

		return result;
	}

	getSortedModules(): {
		source: ts.SourceFile;
		fileName: string;
		modulePath?: string;
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
