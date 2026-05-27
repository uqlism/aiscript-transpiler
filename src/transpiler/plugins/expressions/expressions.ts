import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { coerceToBool } from "../../utils/typeValidation.js";

function isSimple(expr: Ast.Expression): boolean {
	return (
		expr.type === "identifier" ||
		expr.type === "num" ||
		expr.type === "str" ||
		expr.type === "bool" ||
		expr.type === "null"
	);
}

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
			case ts.isNonNullExpression(node):
				// TypeScript の非nullアサーション x! は AiScript では x のまま
				return this.converter.convertExpressionAsExpression(node.expression);
			case ts.isAsExpression(node):
				// TypeScript の型アサーション (x as T) はランタイム動作なし → 内側の式をそのまま変換
				return this.converter.convertExpressionAsExpression(node.expression);
			case ts.isSatisfiesExpression(node):
				// TypeScript の satisfies 演算子 (x satisfies T) もランタイム動作なし → 内側の式をそのまま変換
				return this.converter.convertExpressionAsExpression(node.expression);
			case ts.isVoidExpression(node):
				// void expr → 副作用のために expr を実行して null を返す
				return this.convertVoidExpression(node);
			case ts.isConditionalExpression(node):
				return this.convertConditionalExpression(node);
		}
	};

	override tryConvertExpressionAsStatements = (
		node: ts.Expression,
	): (Ast.Statement | Ast.Expression)[] | undefined => {
		// void f() を文として使う場合は副作用のために f() のみ実行し null を捨てる
		if (ts.isVoidExpression(node)) {
			const inner = this.converter.convertExpressionAsExpression(node.expression);
			return [inner];
		}
		// as / satisfies / ! は内側の式の statement 変換に委譲
		if (
			ts.isAsExpression(node) ||
			ts.isSatisfiesExpression(node) ||
			ts.isNonNullExpression(node)
		) {
			return this.converter.convertExpressionAsStatements(node.expression);
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

	private convertCallExpression(
		node: ts.CallExpression,
	): Ast.Call | Ast.If | Ast.Block {
		// スプレッド引数は AiScript が対応していないためエラー
		for (const arg of node.arguments) {
			if (ts.isSpreadElement(arg)) {
				this.converter.throwError(
					"スプレッド引数はサポートされていません。AiScriptには Function.prototype.apply に相当する機能がありません",
					arg,
				);
			}
		}
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

	// fn?.() → if (fn != null) fn() else null  (単純な式なら eval 不要)
	private wrapOptionalCall(
		target: Ast.Expression,
		args: Ast.Expression[],
	): Ast.If | Ast.Block {
		const src = isSimple(target)
			? target
			: this.converter.getUniqueIdentifier();
		const ifExpr: Ast.If = {
			type: "if",
			cond: {
				type: "neq",
				left: src,
				right: { type: "null", loc: dummyLoc },
				loc: dummyLoc,
			},
			// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
			then: { type: "call", target: src, args, loc: dummyLoc },
			elseif: [],
			else: { type: "null", loc: dummyLoc },
			loc: dummyLoc,
		};
		if (src === target) return ifExpr;
		return {
			type: "block",
			statements: [
				{
					type: "def",
					dest: src as Ast.Identifier,
					expr: target,
					mut: false,
					attr: [],
					loc: dummyLoc,
				},
				ifExpr,
			],
			loc: dummyLoc,
		};
	}

	private convertParenthesizedExpression(
		node: ts.ParenthesizedExpression,
	): Ast.Expression {
		return this.converter.convertExpressionAsExpression(node.expression);
	}

	private convertVoidExpression(
		node: ts.VoidExpression,
	): Ast.Null | Ast.Block {
		const expr = this.converter.convertExpressionAsExpression(node.expression);
		// 単純なリテラルや識別子なら副作用なし → null のみ返す
		if (isSimple(expr)) {
			return { type: "null", loc: dummyLoc };
		}
		// 副作用がある可能性のある式 → eval ブロックで評価してから null を返す
		return {
			type: "block",
			statements: [expr, { type: "null", loc: dummyLoc }],
			loc: dummyLoc,
		};
	}

	private convertConditionalExpression(node: ts.ConditionalExpression): Ast.If {
		const cond = coerceToBool(
			node.condition,
			this.converter.convertExpressionAsExpression(node.condition),
			this.converter,
		);
		const then = this.converter.convertExpressionAsExpression(node.whenTrue);

		const elseif: Ast.If["elseif"] = [];
		let elseClause: Ast.Expression | undefined;

		let current = node.whenFalse;
		while (current) {
			if (ts.isConditionalExpression(current)) {
				// else if
				const elifCond = coerceToBool(
					current.condition,
					this.converter.convertExpressionAsExpression(current.condition),
					this.converter,
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
