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

	constructor() {
		this.#pluiginFactories = [];
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
		let uniqueIdCounter = 0;
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
				uniqueIdCounter++;
				const idStr = uniqueIdCounter.toString(36).padStart(5, "0");
				const name = `_temp_${idStr}`;
				return {
					type: "identifier",
					name,
					loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
				};
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
