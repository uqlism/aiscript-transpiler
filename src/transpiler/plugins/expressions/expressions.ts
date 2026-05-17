import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { validateBooleanExpression } from "../../utils/typeValidation.js";

export class ExpressionsPlugin extends TranspilerPlugin {
	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		switch (true) {
			case ts.isIdentifier(node):
				return this.convertIdentifier(node);
			case node.kind === ts.SyntaxKind.ThisKeyword:
				return this.convertThisKeyword(node);
			case ts.isCallExpression(node):
				return this.convertCallExpression(node);
			case ts.isParenthesizedExpression(node):
				return this.convertParenthesizedExpression(node);
			case ts.isConditionalExpression(node):
				return this.convertConditionalExpression(node);
		}
	};

	private convertIdentifier(node: ts.Identifier): Ast.Identifier | Ast.Null {
		if (node.text === "undefined") return { type: "null", loc: dummyLoc };
		return { type: "identifier", name: node.text, loc: dummyLoc };
	}

	private convertThisKeyword(node: ts.Node): Ast.Identifier {
		// クラス内かどうかをチェック
		if (!this.isInsideClass(node)) {
			this.converter.throwError(
				"thisキーワードは使用できません。AiScriptにはthisの概念がありません",
				node,
			);
		}
		// クラス内の this は __this に変換
		return { type: "identifier", name: "__this", loc: dummyLoc };
	}

	private isInsideClass(node: ts.Node): boolean {
		let current: ts.Node | undefined = node.parent;
		while (current) {
			// クラス宣言またはクラス式の中にいる場合は許可
			if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
				return true;
			}
			// オブジェクトリテラルに到達した場合は禁止
			if (ts.isObjectLiteralExpression(current)) {
				return false;
			}
			current = current.parent;
		}
		return false;
	}

	private convertCallExpression(node: ts.CallExpression): Ast.Call | Ast.Block {
		const args = node.arguments.map((arg) =>
			this.converter.convertExpressionAsExpression(arg),
		);

		// a?.() — 呼び出し自体がオプショナル
		if (node.questionDotToken) {
			const target = this.converter.convertExpressionAsExpression(
				node.expression,
			);
			return this.wrapOptionalCall(target, args);
		}

		// a?.b() — プロパティアクセスがオプショナル
		if (
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.questionDotToken
		) {
			const propNode = node.expression;
			const obj = this.converter.convertExpressionAsExpression(
				propNode.expression,
			);
			const propName = propNode.name.text;
			// 名前空間アクセスはオプショナルチェーン不要
			if (
				obj.type === "identifier" &&
				this.converter.getNamespaces().includes(obj.name)
			) {
				return {
					type: "call",
					target: {
						type: "identifier",
						name: `${obj.name}:${propName}`,
						loc: dummyLoc,
					},
					args,
					loc: dummyLoc,
				};
			}
			const tmp = this.converter.getUniqueIdentifier();
			return {
				type: "block",
				statements: [
					{
						type: "def",
						dest: tmp,
						expr: obj,
						mut: false,
						attr: [],
						loc: dummyLoc,
					},
					{
						type: "if",
						cond: {
							type: "neq",
							left: tmp,
							right: { type: "null", loc: dummyLoc },
							loc: dummyLoc,
						},
						// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
						then: {
							type: "call",
							target: {
								type: "prop",
								target: tmp,
								name: propName,
								loc: dummyLoc,
							},
							args,
							loc: dummyLoc,
						},
						elseif: [],
						else: { type: "null", loc: dummyLoc },
						loc: dummyLoc,
					},
				],
				loc: dummyLoc,
			};
		}

		const target = this.converter.convertExpressionAsExpression(
			node.expression,
		);
		return { type: "call", target, args, loc: dummyLoc };
	}

	// fn?.() → eval { let __tmp = fn; if (__tmp != null) __tmp() else null }
	private wrapOptionalCall(
		target: Ast.Expression,
		args: Ast.Expression[],
	): Ast.Block {
		const tmp = this.converter.getUniqueIdentifier();
		return {
			type: "block",
			statements: [
				{
					type: "def",
					dest: tmp,
					expr: target,
					mut: false,
					attr: [],
					loc: dummyLoc,
				},
				{
					type: "if",
					cond: {
						type: "neq",
						left: tmp,
						right: { type: "null", loc: dummyLoc },
						loc: dummyLoc,
					},
					// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
					then: { type: "call", target: tmp, args, loc: dummyLoc },
					elseif: [],
					else: { type: "null", loc: dummyLoc },
					loc: dummyLoc,
				},
			],
			loc: dummyLoc,
		};
	}

	private convertParenthesizedExpression(
		node: ts.ParenthesizedExpression,
	): Ast.Expression {
		return this.converter.convertExpressionAsExpression(node.expression);
	}

	private convertConditionalExpression(node: ts.ConditionalExpression): Ast.If {
		validateBooleanExpression(node.condition, this.converter);
		const cond = this.converter.convertExpressionAsExpression(node.condition);
		const then = this.converter.convertExpressionAsExpression(node.whenTrue);

		const elseif: Ast.If["elseif"] = [];
		let elseClause: Ast.Expression | undefined;

		let current = node.whenFalse;
		while (current) {
			if (ts.isConditionalExpression(current)) {
				// else if
				validateBooleanExpression(current.condition, this.converter);
				const elifCond = this.converter.convertExpressionAsExpression(
					current.condition,
				);
				const elifThen = this.converter.convertExpressionAsExpression(
					current.whenTrue,
				);
				// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
				elseif.push({ cond: elifCond, then: elifThen });
				current = current.whenFalse;
			} else {
				// else
				elseClause = this.converter.convertExpressionAsExpression(current);
				break;
			}
		}

		return {
			type: "if",
			cond,
			then,
			elseif,
			else: elseClause,
			loc: dummyLoc,
		};
	}
}
