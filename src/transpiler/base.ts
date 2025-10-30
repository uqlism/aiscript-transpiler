import * as fs from "node:fs";
import * as path from "node:path";
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
	#uniqueIdCounter = 0;

	constructor() {
		this.#pluiginFactories = [];
	}

	/**
	 * グローバルなユニークID生成器
	 */
	#getUniqueIdentifier(): Ast.Identifier {
		this.#uniqueIdCounter++;
		const idStr = this.#uniqueIdCounter.toString(36).padStart(5, "0");
		const name = `__gen_${idStr}`;
		return {
			type: "identifier",
			name,
			loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
		};
	}
	addPlugin(
		pluginFactory: new (converter: TranspilerContext) => TranspilerPlugin,
	) {
		this.#pluiginFactories.push(pluginFactory);
	}

	/**
	 * ユーザープロジェクトのtsconfig.jsonからコンパイラオプションと型定義ファイルを読み込む
	 */
	private loadCompilerOptions(userProjectRoot: string): {
		compilerOptions: ts.CompilerOptions;
	} {
		let baseCompilerOptions: ts.CompilerOptions = {
			target: ts.ScriptTarget.Latest,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			allowSyntheticDefaultImports: true,
			esModuleInterop: true,
			skipLibCheck: true,
			noLib: true,
		};

		try {
			// ユーザープロジェクトのtsconfig.jsonを読み込み
			const tsconfigPath = path.join(userProjectRoot, "tsconfig.json");
			if (fs.existsSync(tsconfigPath)) {
				const tsconfigContent = fs.readFileSync(tsconfigPath, "utf8");
				const tsconfigJson = JSON.parse(tsconfigContent);

				// TypeScriptの公式APIを使用して安全にcompilerOptionsを変換
				if (tsconfigJson.compilerOptions) {
					const { options, errors } = ts.convertCompilerOptionsFromJson(
						tsconfigJson.compilerOptions,
						userProjectRoot,
					);

					if (errors.length > 0) {
						console.warn(
							"TypeScript compiler options conversion errors:",
							errors.map((e) => e.messageText),
						);
					}

					// ベースオプションとユーザーオプションをマージ
					baseCompilerOptions = {
						...baseCompilerOptions,
						...options,
						noLib: true, // 常にnoLib: trueにして制御下に置く
					};
				}
			}
		} catch (_e) {
			console.warn(
				"Failed to load user tsconfig.json, using default configuration",
			);
		}

		return { compilerOptions: baseCompilerOptions };
	}

	transpileFile(entryFilePath: string, userProjectRoot?: string): Ast.Node[] {
		// エントリファイルから複数ファイルを順次解決してトランスパイル
		const projectRoot = userProjectRoot || process.cwd();
		const resolvedModules = this.resolveModules(entryFilePath, projectRoot);

		const { compilerOptions } = this.loadCompilerOptions(projectRoot);
		const host = ts.createCompilerHost(compilerOptions);

		const allResults: Ast.Node[] = [];
		const processedFiles = new Set<string>();
		const modulePathToId = new Map<string, Ast.Identifier>();

		// 最初にすべてのモジュールのIDを事前に生成
		for (const modulePath of resolvedModules) {
			const moduleIdentifier = this.#getUniqueIdentifier();
			modulePathToId.set(modulePath, moduleIdentifier);
		}

		// モジュールを順次処理してevalブロックを作成
		for (const modulePath of resolvedModules) {
			if (processedFiles.has(modulePath)) continue;
			processedFiles.add(modulePath);

			const moduleResults = this.transpileModule(
				modulePath,
				compilerOptions,
				host,
				modulePathToId,
			);

			// モジュール結果をblockで囲む
			const evalBlock: Ast.Block = {
				type: "block",
				statements: moduleResults as (Ast.Statement | Ast.Expression)[],
				loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
			};

			const moduleIdentifier = modulePathToId.get(modulePath);
			if (!moduleIdentifier) {
				throw new Error(`Module identifier not found for path: ${modulePath}`);
			}

			// モジュール変数に代入 (let module_xxxxx = eval { ... })
			const moduleAssignment: Ast.Definition = {
				type: "def",
				dest: moduleIdentifier,
				expr: evalBlock,
				mut: false,
				attr: [],
				loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
			};

			allResults.push(moduleAssignment);
		}

		return allResults;
	}

	transpile(sourceCode: string, userProjectRoot?: string) {
		const sourceFile = ts.createSourceFile(
			"main.ts",
			sourceCode,
			ts.ScriptTarget.Latest,
			true,
		);

		// ユーザープロジェクトのルートディレクトリを取得
		// 指定されない場合は現在の作業ディレクトリを使用
		const projectRoot = userProjectRoot || process.cwd();

		// tsconfig.jsonからコンパイラオプションを読み込み
		const { compilerOptions } = this.loadCompilerOptions(projectRoot);

		// mian.ts以外のファイルはデフォルトの挙動をするCompilerHost
		const host = ts.createCompilerHost(compilerOptions);
		const getSourceFile = host.getSourceFile;
		host.getSourceFile = (fileName, ...args) =>
			fileName === "main.ts" ? sourceFile : getSourceFile(fileName, ...args);
		const fileExists = host.fileExists;
		host.fileExists = (fileName) =>
			fileName === "main.ts" || fileExists(fileName);

		const program = ts.createProgram(
			[
				"main.ts",
				...(compilerOptions.types?.map(
					(x) =>
						typeof require !== "undefined"
							? require?.resolve(x) /** Nodejs用 */
							: import.meta.resolve(x) /** Bun用 */,
				) ?? []),
			],
			compilerOptions,
			host,
		);
		const typeChecker = program.getTypeChecker();

		const plugins: TranspilerPlugin[] = [];
		const exports = new Set<string>();
		const context = {
			convertExpressionAsExpression(expr: ts.Expression): Ast.Expression {
				for (const plugin of plugins) {
					const result = plugin.tryConvertExpressionAsExpression?.(expr);
					if (result) return result;
				}
				throw new TranspilerError(
					`No plugin found for expression: ${ts.SyntaxKind[expr.kind]}`,
					expr,
					sourceFile,
				);
			},
			convertExpressionAsStatements(
				expr: ts.Expression,
			): (Ast.Expression | Ast.Statement)[] {
				for (const plugin of plugins) {
					const result1 = plugin.tryConvertExpressionAsStatements?.(expr);
					if (result1) return result1;
					const result2 = plugin.tryConvertExpressionAsExpression?.(expr);
					if (result2) return [result2];
				}
				throw new TranspilerError(
					`No plugin found for expression as statements: ${ts.SyntaxKind[expr.kind]}`,
					expr,
					sourceFile,
				);
			},
			convertStatementAsStatements(
				expr: ts.Statement,
			): (Ast.Expression | Ast.Statement)[] {
				for (const plugin of plugins) {
					const result = plugin.tryConvertStatementAsStatements?.(expr);
					if (result) return result;
				}
				throw new TranspilerError(
					`No plugin found for statement: ${ts.SyntaxKind[expr.kind]}`,
					expr,
					sourceFile,
				);
			},
			getUniqueIdentifier: (): Ast.Identifier => {
				return this.#getUniqueIdentifier();
			},
			validateVariableName: (name: string, node: ts.Node): void => {
				if (reservedWords.includes(name)) {
					throw new TranspilerError(
						"予約語を変数名にすることはできません",
						node,
						sourceFile,
					);
				}
			},
			throwError: (message: string, node: ts.Node): never => {
				throw new TranspilerError(message, node, sourceFile);
			},
			typeChecker,
			getModuleRef: (_importPath: string): Ast.Identifier => {
				throw new Error(
					"Module imports are not supported in single-file transpilation mode",
				);
			},
			addExport: (name: string): void => {
				exports.add(name);
			},
		};
		plugins.push(...this.#pluiginFactories.map((x) => new x(context)));

		const result: Ast.Node[] = [];
		ts.forEachChild(sourceFile, (node) => {
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

		// If there are exports, add an export object at the end
		if (exports.size > 0) {
			const exportObj: Ast.Obj = {
				type: "obj",
				value: new Map(),
				loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
			};

			for (const exportName of exports) {
				exportObj.value.set(exportName, {
					type: "identifier",
					name: exportName,
					loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
				});
			}

			result.push(exportObj);
		}

		return result;
	}

	/**
	 * エントリファイルから順次importを解決してモジュール一覧を取得
	 */
	private resolveModules(entryFilePath: string, projectRoot: string): string[] {
		const resolvedModules: string[] = [];
		const processedFiles = new Set<string>();

		const resolveImportsRecursively = (filePath: string) => {
			if (processedFiles.has(filePath)) return;
			processedFiles.add(filePath);

			try {
				const sourceCode = fs.readFileSync(filePath, "utf8");
				const sourceFile = ts.createSourceFile(
					filePath,
					sourceCode,
					ts.ScriptTarget.Latest,
					true,
				);

				// import文を順次処理
				ts.forEachChild(sourceFile, (node) => {
					if (
						ts.isImportDeclaration(node) &&
						ts.isStringLiteral(node.moduleSpecifier)
					) {
						const importPath = node.moduleSpecifier.text;
						const resolvedPath = this.resolveImportPath(
							importPath,
							filePath,
							projectRoot,
						);
						if (resolvedPath) {
							resolveImportsRecursively(resolvedPath);
						}
					}
				});

				// このファイルを解決済みリストに追加
				resolvedModules.push(filePath);
			} catch (error) {
				console.warn(`Failed to resolve module: ${filePath}`, error);
			}
		};

		resolveImportsRecursively(entryFilePath);
		return resolvedModules;
	}

	/**
	 * import pathを実際のファイルパスに解決
	 */
	private resolveImportPath(
		importPath: string,
		fromFile: string,
		_projectRoot: string,
	): string | null {

		if (importPath.startsWith("./") || importPath.startsWith("../")) {
			// 相対パス
			const baseDir = path.dirname(fromFile);
			const possiblePaths = [
				path.resolve(baseDir, `${importPath}.ts`),
				path.resolve(baseDir, `${importPath}.js`),
				path.resolve(baseDir, importPath, "index.ts"),
				path.resolve(baseDir, importPath, "index.js"),
			];

			for (const possiblePath of possiblePaths) {
				if (fs.existsSync(possiblePath)) {
					return possiblePath;
				}
			}
		}

		// 他のタイプのimportは今回はスキップ
		return null;
	}

	/**
	 * 単一モジュールをトランスパイル
	 */
	private transpileModule(
		filePath: string,
		compilerOptions: ts.CompilerOptions,
		host: ts.CompilerHost,
		modulePathToId: Map<string, Ast.Identifier>,
	): Ast.Node[] {
		const sourceCode = fs.readFileSync(filePath, "utf8");
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceCode,
			ts.ScriptTarget.Latest,
			true,
		);

		const program = ts.createProgram([filePath], compilerOptions, host);
		const typeChecker = program.getTypeChecker();
		const projectRoot = path.dirname(filePath);

		const plugins: TranspilerPlugin[] = [];
		const moduleRefs = new Map<string, Ast.Identifier>();
		const exports = new Set<string>();
		const context = {
			convertExpressionAsExpression(expr: ts.Expression): Ast.Expression {
				for (const plugin of plugins) {
					const result = plugin.tryConvertExpressionAsExpression?.(expr);
					if (result) return result;
				}
				throw new TranspilerError(
					`No plugin found for expression: ${ts.SyntaxKind[expr.kind]}`,
					expr,
					sourceFile,
				);
			},
			convertExpressionAsStatements(
				expr: ts.Expression,
			): (Ast.Expression | Ast.Statement)[] {
				for (const plugin of plugins) {
					const result1 = plugin.tryConvertExpressionAsStatements?.(expr);
					if (result1) return result1;
					const result2 = plugin.tryConvertExpressionAsExpression?.(expr);
					if (result2) return [result2];
				}
				throw new TranspilerError(
					`No plugin found for expression as statements: ${ts.SyntaxKind[expr.kind]}`,
					expr,
					sourceFile,
				);
			},
			convertStatementAsStatements(
				expr: ts.Statement,
			): (Ast.Expression | Ast.Statement)[] {
				for (const plugin of plugins) {
					const result = plugin.tryConvertStatementAsStatements?.(expr);
					if (result) return result;
				}
				throw new TranspilerError(
					`No plugin found for statement: ${ts.SyntaxKind[expr.kind]}`,
					expr,
					sourceFile,
				);
			},
			getUniqueIdentifier: (): Ast.Identifier => {
				return this.#getUniqueIdentifier();
			},
			validateVariableName: (name: string, node: ts.Node): void => {
				if (reservedWords.includes(name)) {
					throw new TranspilerError(
						"予約語を変数名にすることはできません",
						node,
						sourceFile,
					);
				}
			},
			throwError: (message: string, node: ts.Node): never => {
				throw new TranspilerError(message, node, sourceFile);
			},
			typeChecker,
			getModuleRef: (importPath: string): Ast.Identifier => {
				if (!moduleRefs.has(importPath)) {
					// importPathを実際のファイルパスに解決
					const resolvedPath = this.resolveImportPath(
						importPath,
						filePath,
						projectRoot,
					);
					if (resolvedPath && modulePathToId.has(resolvedPath)) {
						const moduleId = modulePathToId.get(resolvedPath);
						if (moduleId) {
							moduleRefs.set(importPath, moduleId);
						} else {
							throw new Error(
								`Module ID not found for resolved path: ${resolvedPath}`,
							);
						}
					} else {
						throw new Error(`Cannot resolve import path: ${importPath}`);
					}
				}
				const moduleRef = moduleRefs.get(importPath);
				if (!moduleRef) {
					throw new Error(`Module reference not found for ${importPath}`);
				}
				return moduleRef;
			},
			addExport: (name: string): void => {
				exports.add(name);
			},
		};
		plugins.push(...this.#pluiginFactories.map((x) => new x(context)));

		const result: Ast.Node[] = [];
		ts.forEachChild(sourceFile, (node) => {
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

		// If there are exports, add an export object at the end
		if (exports.size > 0) {
			const exportObj: Ast.Obj = {
				type: "obj",
				value: new Map(),
				loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
			};

			for (const exportName of exports) {
				exportObj.value.set(exportName, {
					type: "identifier",
					name: exportName,
					loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
				});
			}

			result.push(exportObj);
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

	// モジュール関連
	getModuleRef(importPath: string): Ast.Identifier;
	addExport(name: string): void;
};

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
