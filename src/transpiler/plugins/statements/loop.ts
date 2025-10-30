import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { validateBooleanExpression } from "../../utils/typeValidation.js";

export class LoopStatementsPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		switch (true) {
			case ts.isForStatement(node):
				return [this.convertForStatement(node)];
			case ts.isWhileStatement(node):
				return [this.convertWhileStatement(node)];
			case ts.isDoStatement(node):
				return [this.convertDoWhileStatement(node)];
		}
	};

	private convertStatementToStatements(
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] {
		if (ts.isBlock(node)) {
			// ブロック文の場合は中身を展開
			return node.statements.flatMap((stmt) =>
				this.converter.convertStatementAsStatements(stmt),
			);
		} else {
			// ブロック文以外は直接変換
			return this.converter.convertStatementAsStatements(node);
		}
	}

	private convertForStatement(node: ts.ForStatement): Ast.Block | Ast.Loop {
		const evalBody: (Ast.Statement | Ast.Expression)[] = [];

		// 初期化部分を追加
		if (node.initializer) {
			if (ts.isVariableDeclarationList(node.initializer)) {
				// VariableDeclarationListを個別に処理
				for (const declaration of node.initializer.declarations) {
					if (!declaration.initializer) {
						this.converter.throwError(
							"変数宣言には初期値が必要です",
							declaration,
						);
					}

					const isMutable = Boolean(node.initializer.flags & ts.NodeFlags.Let);
					const nameNode = declaration.name;

					if (ts.isIdentifier(nameNode)) {
						const expr = this.converter.convertExpressionAsExpression(
							declaration.initializer,
						);
						evalBody.push({
							type: "def",
							dest: { type: "identifier", name: nameNode.text, loc: dummyLoc },
							expr,
							mut: isMutable,
							attr: [],
							loc: dummyLoc,
						});
					} else {
						this.converter.throwError(
							"for文では分割代入は現在サポートされていません",
							nameNode as ts.Node,
						);
					}
				}
			} else {
				const initExpr = this.converter.convertExpressionAsExpression(
					node.initializer,
				);
				evalBody.push(initExpr);
			}
		}

		// ループ本体の構築
		const loopBody: (Ast.Statement | Ast.Expression)[] = [];

		// 条件チェック（条件がfalseならbreak）
		if (node.condition) {
			validateBooleanExpression(node.condition, this.converter);
			const condition = this.converter.convertExpressionAsExpression(
				node.condition,
			);
			const ifStatement: Ast.If = {
				type: "if",
				cond: {
					type: "not",
					expr: condition,
					loc: dummyLoc,
				},
				// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
				then: {
					type: "break",
					loc: dummyLoc,
				},
				elseif: [],
				loc: dummyLoc,
			};
			loopBody.push(ifStatement);
		}

		// for文の本体を追加
		if (node.statement) {
			loopBody.push(...this.convertStatementToStatements(node.statement));
		}

		// インクリメント部分を追加
		if (node.incrementor) {
			const incrementExpr = this.converter.convertExpressionAsStatements(
				node.incrementor,
			);
			loopBody.push(...incrementExpr);
		}

		const loopStatement: Ast.Loop = {
			type: "loop",
			statements: loopBody,
			loc: dummyLoc,
		};

		evalBody.push(loopStatement);

		return evalBody.length === 1
			? loopStatement
			: { type: "block", statements: evalBody, loc: dummyLoc };
	}

	private convertWhileStatement(node: ts.WhileStatement): Ast.Loop {
		validateBooleanExpression(node.expression, this.converter);
		const condition = this.converter.convertExpressionAsExpression(
			node.expression,
		);
		const body = node.statement
			? this.convertStatementToStatements(node.statement)
			: [];

		const loopBody: (Ast.Statement | Ast.Expression)[] = [];

		if (condition.type === "bool" && condition.value === true) {
			// 無限ループ while(true)
		} else {
			// 条件チェック（条件がfalseならbreak）を追加
			const ifStatement: Ast.If = {
				type: "if",
				cond: { type: "not", expr: condition, loc: dummyLoc },
				// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
				then: { type: "break", loc: dummyLoc },
				elseif: [],
				loc: dummyLoc,
			};
			loopBody.push(ifStatement);
		}

		// 元のwhile文のbodyを追加
		loopBody.push(...body);

		// loop文を構築
		return {
			type: "loop",
			statements: loopBody,
			loc: dummyLoc,
		};
	}

	private convertDoWhileStatement(node: ts.DoStatement): Ast.Loop {
		validateBooleanExpression(node.expression, this.converter);
		const condition = this.converter.convertExpressionAsExpression(
			node.expression,
		);
		const body = this.convertStatementToStatements(node.statement);

		const loopBody: (Ast.Statement | Ast.Expression)[] = [];

		// 最初にbodyを実行
		loopBody.push(...body);

		if (condition.type === "bool" && condition.value === true) {
			// 無限ループ
		} else {
			// 条件チェック（条件がfalseならbreak）
			const ifStatement: Ast.If = {
				type: "if",
				cond: { type: "not", expr: condition, loc: dummyLoc },
				// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
				then: { type: "break", loc: dummyLoc },
				elseif: [],
				loc: dummyLoc,
			};
			loopBody.push(ifStatement);
		}

		return {
			type: "loop",
			statements: loopBody,
			loc: dummyLoc,
		};
	}
}
