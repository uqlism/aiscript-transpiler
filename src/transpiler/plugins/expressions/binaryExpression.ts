import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertDestructuringPattern } from "../../utils/destructuring.js";
import {
	coerceToBool,
	hasStringComponent,
	isBooleanLikeType,
	isStringLike,
	validateNumberLike,
} from "../../utils/typeValidation.js";

function isSimple(expr: Ast.Expression): boolean {
	return (
		expr.type === "identifier" ||
		expr.type === "num" ||
		expr.type === "str" ||
		expr.type === "bool" ||
		expr.type === "null"
	);
}

export class BinaryExpressionPlugin extends TranspilerPlugin {
	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		if (ts.isBinaryExpression(node)) {
			return this.convertBinaryExpression(node);
		}
	};

	override tryConvertExpressionAsStatements = (node: ts.Expression) => {
		const unwrapped = this.unwrapParentheses(node);
		if (ts.isBinaryExpression(unwrapped)) {
			// 分割代入の場合
			if (
				unwrapped.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				(ts.isArrayLiteralExpression(unwrapped.left) ||
					ts.isObjectLiteralExpression(unwrapped.left))
			) {
				return this.convertDestructuringAssignment(unwrapped);
			} else if (
				unwrapped.operatorToken.kind ===
				ts.SyntaxKind.QuestionQuestionEqualsToken
			) {
				// ??= → a = a ?? b
				return this.convertNullishAssignment(unwrapped);
			} else if (
				[
					ts.SyntaxKind.EqualsToken,
					ts.SyntaxKind.PlusEqualsToken,
					ts.SyntaxKind.MinusEqualsToken,
					ts.SyntaxKind.AsteriskEqualsToken,
					ts.SyntaxKind.SlashEqualsToken,
					ts.SyntaxKind.PercentEqualsToken,
					ts.SyntaxKind.AsteriskAsteriskEqualsToken,
					ts.SyntaxKind.AmpersandAmpersandEqualsToken,
					ts.SyntaxKind.BarBarEqualsToken,
				].includes(unwrapped.operatorToken.kind)
			) {
				return this.convertBinaryAssignExpression(unwrapped);
			}
		}
	};

	private unwrapParentheses(node: ts.Expression): ts.Expression {
		while (ts.isParenthesizedExpression(node)) {
			node = node.expression;
		}
		return node;
	}

	private convertDestructuringAssignment(
		node: ts.BinaryExpression,
	): Ast.Statement[] {
		const rightExpr = this.converter.convertExpressionAsExpression(node.right);
		const leftPattern = convertDestructuringPattern(node.left);

		// AiScriptネイティブ分割代入として出力
		return [
			{
				type: "def",
				dest: leftPattern,
				expr: rightExpr,
				mut: false,
				attr: [],
				loc: dummyLoc,
			},
		];
	}

	private convertBinaryAssignExpression(
		node: ts.BinaryExpression,
	): (Ast.Statement | Ast.Expression)[] {
		const left = this.converter.convertExpressionAsExpression(node.left);
		const right = this.converter.convertExpressionAsExpression(node.right);

		switch (node.operatorToken.kind) {
			case ts.SyntaxKind.EqualsToken:
				return [{ type: "assign", dest: left, expr: right, loc: dummyLoc }];

			case ts.SyntaxKind.PlusEqualsToken: {
				// 文字列連結 += のポリフィル
				// 判定: 左辺型に文字列成分があれば tmpl 代入にポリフィル
				//   isStringLike: string に代入可能（union 非対応）
				//   hasStringComponent: union type で文字列成分を持つ場合も対応
				if (this.converter.doTypeCheck) {
					const leftType = this.converter.typeChecker.getTypeAtLocation(
						node.left,
					);
					if (
						isStringLike(node.left, this.converter.typeChecker) ||
						hasStringComponent(leftType)
					) {
						return [
							{
								type: "assign",
								dest: left,
								expr: { type: "tmpl", tmpl: [left, right], loc: dummyLoc },
								loc: dummyLoc,
							},
						];
					}
				}
				// 数値加算代入の型チェック
				validateNumberLike(
					node.left,
					this.converter,
					`算術代入演算子 '${node.operatorToken.getText()}' の左オペランドはNumber型である必要があります`,
				);
				validateNumberLike(
					node.right,
					this.converter,
					`算術代入演算子 '${node.operatorToken.getText()}' の右オペランドはNumber型である必要があります`,
				);
				return [{ type: "addAssign", dest: left, expr: right, loc: dummyLoc }];
			}

			case ts.SyntaxKind.MinusEqualsToken:
				validateNumberLike(
					node.left,
					this.converter,
					`算術代入演算子 '${node.operatorToken.getText()}' の左オペランドはNumber型である必要があります`,
				);
				validateNumberLike(
					node.right,
					this.converter,
					`算術代入演算子 '${node.operatorToken.getText()}' の右オペランドはNumber型である必要があります`,
				);
				return [{ type: "subAssign", dest: left, expr: right, loc: dummyLoc }];

			case ts.SyntaxKind.AsteriskEqualsToken:
				validateNumberLike(node.left, this.converter);
				validateNumberLike(node.right, this.converter);
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "mul", left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];

			case ts.SyntaxKind.SlashEqualsToken:
				validateNumberLike(node.left, this.converter);
				validateNumberLike(node.right, this.converter);
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "div", left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];

			case ts.SyntaxKind.PercentEqualsToken:
				validateNumberLike(node.left, this.converter);
				validateNumberLike(node.right, this.converter);
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "rem", left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];

			case ts.SyntaxKind.AsteriskAsteriskEqualsToken:
				validateNumberLike(node.left, this.converter);
				validateNumberLike(node.right, this.converter);
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "pow", left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];

			case ts.SyntaxKind.BarBarEqualsToken:
				// x ||= y → if (!coerceToBool(x)) x = y
				return [
					{
						type: "if",
						cond: {
							type: "not",
							expr: coerceToBool(node.left, left, this.converter),
							loc: dummyLoc,
						},
						// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
						then: { type: "assign", dest: left, expr: right, loc: dummyLoc },
						elseif: [],
						loc: dummyLoc,
					},
				];

			case ts.SyntaxKind.AmpersandAmpersandEqualsToken:
				// x &&= y → if (coerceToBool(x)) x = y
				return [
					{
						type: "if",
						cond: coerceToBool(node.left, left, this.converter),
						// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
						then: { type: "assign", dest: left, expr: right, loc: dummyLoc },
						elseif: [],
						loc: dummyLoc,
					},
				];

			default:
				this.converter.throwError(
					`サポートされていない二項演算子です: ${ts.SyntaxKind[node.operatorToken.kind]}`,
					node,
				);
		}
	}

	// a ?? b → if (a != null) a else b  (単純な式なら eval 不要)
	private convertNullishCoalescing(
		node: ts.BinaryExpression,
	): Ast.If | Ast.Block {
		const left = this.converter.convertExpressionAsExpression(node.left);
		const right = this.converter.convertExpressionAsExpression(node.right);
		const src = isSimple(left) ? left : this.converter.getUniqueIdentifier();
		const ifExpr: Ast.If = {
			type: "if",
			cond: {
				type: "neq",
				left: src,
				right: { type: "null", loc: dummyLoc },
				loc: dummyLoc,
			},
			// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
			then: src,
			elseif: [],
			else: right,
			loc: dummyLoc,
		};
		if (src === left) return ifExpr;
		return {
			type: "block",
			statements: [
				{
					type: "def",
					dest: src as Ast.Identifier,
					expr: left,
					mut: false,
					attr: [],
					loc: dummyLoc,
				},
				ifExpr,
			],
			loc: dummyLoc,
		};
	}

	// a ??= b → if (a == null) a = b
	private convertNullishAssignment(
		node: ts.BinaryExpression,
	): (Ast.Statement | Ast.Expression)[] {
		const left = this.converter.convertExpressionAsExpression(node.left);
		const right = this.converter.convertExpressionAsExpression(node.right);
		const ifExpr: Ast.If = {
			type: "if",
			cond: {
				type: "eq",
				left,
				right: { type: "null", loc: dummyLoc },
				loc: dummyLoc,
			},
			// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
			then: { type: "assign", dest: left, expr: right, loc: dummyLoc },
			elseif: [],
			loc: dummyLoc,
		};
		return [ifExpr];
	}

	/**
	 * a || b の変換。
	 * - 両辺が boolean 型 → AiScript ネイティブ `or` ノード（短絡評価あり・高速）
	 * - それ以外 → if-else ポリフィルで元の値を保持: `if (coerceToBool(a)) a else b`
	 * - doTypeCheck = false → ネイティブ `or`（boolean 前提、型チェック不要なコード向け）
	 */
	private convertLogicalOr(
		node: ts.BinaryExpression,
	): Ast.If | Ast.Block | Ast.Or {
		const left = this.converter.convertExpressionAsExpression(node.left);
		const right = this.converter.convertExpressionAsExpression(node.right);

		// 型チェックなし、または両辺が boolean → ネイティブ or（AiScript の短絡評価を活用）
		if (!this.converter.doTypeCheck) {
			return { type: "or", left, right, loc: dummyLoc };
		}
		const { typeChecker } = this.converter;
		if (
			isBooleanLikeType(
				typeChecker.getTypeAtLocation(node.left),
				typeChecker,
			) &&
			isBooleanLikeType(typeChecker.getTypeAtLocation(node.right), typeChecker)
		) {
			return { type: "or", left, right, loc: dummyLoc };
		}

		// 非 boolean → if-else で値を保持
		const src = isSimple(left) ? left : this.converter.getUniqueIdentifier();
		const cond = coerceToBool(node.left, src, this.converter);
		const ifExpr: Ast.If = {
			type: "if",
			cond,
			// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
			then: src,
			elseif: [],
			else: right,
			loc: dummyLoc,
		};
		if (src === left) return ifExpr;
		return {
			type: "block",
			statements: [
				{
					type: "def",
					dest: src as Ast.Identifier,
					expr: left,
					mut: false,
					attr: [],
					loc: dummyLoc,
				},
				ifExpr,
			],
			loc: dummyLoc,
		};
	}

	/**
	 * a && b の変換。
	 * - 両辺が boolean 型 → AiScript ネイティブ `and` ノード（短絡評価あり・高速）
	 * - それ以外 → if-else ポリフィルで元の値を保持: `if (coerceToBool(a)) b else a`
	 * - doTypeCheck = false → ネイティブ `and`（boolean 前提、型チェック不要なコード向け）
	 */
	private convertLogicalAnd(
		node: ts.BinaryExpression,
	): Ast.If | Ast.Block | Ast.And {
		const left = this.converter.convertExpressionAsExpression(node.left);
		const right = this.converter.convertExpressionAsExpression(node.right);

		// 型チェックなし、または両辺が boolean → ネイティブ and
		if (!this.converter.doTypeCheck) {
			return { type: "and", left, right, loc: dummyLoc };
		}
		const { typeChecker } = this.converter;
		if (
			isBooleanLikeType(
				typeChecker.getTypeAtLocation(node.left),
				typeChecker,
			) &&
			isBooleanLikeType(typeChecker.getTypeAtLocation(node.right), typeChecker)
		) {
			return { type: "and", left, right, loc: dummyLoc };
		}

		// 非 boolean → if-else で値を保持
		const src = isSimple(left) ? left : this.converter.getUniqueIdentifier();
		const cond = coerceToBool(node.left, src, this.converter);
		const ifExpr: Ast.If = {
			type: "if",
			cond,
			// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
			then: right,
			elseif: [],
			else: src,
			loc: dummyLoc,
		};
		if (src === left) return ifExpr;
		return {
			type: "block",
			statements: [
				{
					type: "def",
					dest: src as Ast.Identifier,
					expr: left,
					mut: false,
					attr: [],
					loc: dummyLoc,
				},
				ifExpr,
			],
			loc: dummyLoc,
		};
	}

	/**
	 * 文字列比較のポリフィル。AiScript の lt/gt は数値専用なので Str:lt を使う。
	 * Str:lt(a, b) は a < b なら -1、等しければ 0、a > b なら 1 を返す。
	 *
	 *   a < b  → Str:lt(a, b) < 0
	 *   a <= b → Str:lt(a, b) <= 0
	 *   a > b  → Str:lt(a, b) > 0
	 *   a >= b → Str:lt(a, b) >= 0
	 */
	private buildStringCompare(
		left: Ast.Expression,
		right: Ast.Expression,
		op: "lt" | "lteq" | "gt" | "gteq",
	): Ast.Expression {
		const strLtCall: Ast.Call = {
			type: "call",
			target: { type: "identifier", name: "Str:lt", loc: dummyLoc },
			args: [left, right],
			loc: dummyLoc,
		};
		const zero: Ast.Num = { type: "num", value: 0, loc: dummyLoc };
		return { type: op, left: strLtCall, right: zero, loc: dummyLoc };
	}

	private convertBinaryExpression(node: ts.BinaryExpression): Ast.Expression {
		// 遅延評価が必要な演算子は先に処理
		switch (node.operatorToken.kind) {
			case ts.SyntaxKind.QuestionQuestionToken:
				return this.convertNullishCoalescing(node);
			case ts.SyntaxKind.BarBarToken:
				return this.convertLogicalOr(node);
			case ts.SyntaxKind.AmpersandAmpersandToken:
				return this.convertLogicalAnd(node);
		}

		const left = this.converter.convertExpressionAsExpression(node.left);
		const right = this.converter.convertExpressionAsExpression(node.right);

		// 二項演算子
		switch (node.operatorToken.kind) {
			case ts.SyntaxKind.PlusToken: {
				// 文字列連結かどうかを判定して tmpl にポリフィル
				// 判定順序:
				//   1. 結果型が string (any/unknown 除く) → tmpl  例: string+number, string+string
				//   2. オペランドのどちらかに文字列成分 → tmpl  例: (string|number)+X, X+(string|number)
				//      ※ TypeScript が union type の + 結果を any と推論する場合に対応
				//   3. それ以外 → add (数値加算・型チェックあり)
				if (this.converter.doTypeCheck) {
					const { typeChecker } = this.converter;
					const resultType = typeChecker.getTypeAtLocation(node);

					// 判定1: 結果型が string
					if (
						!(resultType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
						typeChecker.isTypeAssignableTo(
							resultType,
							typeChecker.getStringType(),
						)
					) {
						return { type: "tmpl", tmpl: [left, right], loc: dummyLoc };
					}

					// 判定2: オペランドに文字列成分 (union type 対応)
					if (
						hasStringComponent(typeChecker.getTypeAtLocation(node.left)) ||
						hasStringComponent(typeChecker.getTypeAtLocation(node.right))
					) {
						return { type: "tmpl", tmpl: [left, right], loc: dummyLoc };
					}
				}
				// 数値加算の型チェック
				validateNumberLike(
					node.left,
					this.converter,
					`算術演算子 '+' の左オペランドはNumber型またはString型である必要があります`,
				);
				validateNumberLike(
					node.right,
					this.converter,
					`算術演算子 '+' の右オペランドはNumber型またはString型である必要があります`,
				);
				return { type: "add", left, right, loc: dummyLoc };
			}
			case ts.SyntaxKind.MinusToken:
				validateNumberLike(
					node.left,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の左オペランドはNumber型である必要があります`,
				);
				validateNumberLike(
					node.right,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の右オペランドはNumber型である必要があります`,
				);
				return { type: "sub", left, right, loc: dummyLoc };
			case ts.SyntaxKind.AsteriskToken:
				validateNumberLike(
					node.left,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の左オペランドはNumber型である必要があります`,
				);
				validateNumberLike(
					node.right,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の右オペランドはNumber型である必要があります`,
				);
				return { type: "mul", left, right, loc: dummyLoc };
			case ts.SyntaxKind.SlashToken:
				validateNumberLike(
					node.left,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の左オペランドはNumber型である必要があります`,
				);
				validateNumberLike(
					node.right,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の右オペランドはNumber型である必要があります`,
				);
				return { type: "div", left, right, loc: dummyLoc };
			case ts.SyntaxKind.PercentToken:
				validateNumberLike(
					node.left,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の左オペランドはNumber型である必要があります`,
				);
				validateNumberLike(
					node.right,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の右オペランドはNumber型である必要があります`,
				);
				return { type: "rem", left, right, loc: dummyLoc };
			case ts.SyntaxKind.AsteriskAsteriskToken:
				validateNumberLike(
					node.left,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の左オペランドはNumber型である必要があります`,
				);
				validateNumberLike(
					node.right,
					this.converter,
					`算術演算子 '${node.operatorToken.getText()}' の右オペランドはNumber型である必要があります`,
				);
				return { type: "pow", left, right, loc: dummyLoc };
			case ts.SyntaxKind.EqualsEqualsToken:
			case ts.SyntaxKind.EqualsEqualsEqualsToken:
				return { type: "eq", left, right, loc: dummyLoc };
			case ts.SyntaxKind.ExclamationEqualsToken:
			case ts.SyntaxKind.ExclamationEqualsEqualsToken:
				return { type: "neq", left, right, loc: dummyLoc };
			case ts.SyntaxKind.LessThanToken:
				// 文字列比較は AiScript の lt が非対応なので Str:lt でポリフィル
				// "a" < "b" → Str:lt(a, b) < 0
				if (
					this.converter.doTypeCheck &&
					isStringLike(node.left, this.converter.typeChecker)
				) {
					return this.buildStringCompare(left, right, "lt");
				}
				return { type: "lt", left, right, loc: dummyLoc };
			case ts.SyntaxKind.LessThanEqualsToken:
				// "a" <= "b" → Str:lt(a, b) <= 0
				if (
					this.converter.doTypeCheck &&
					isStringLike(node.left, this.converter.typeChecker)
				) {
					return this.buildStringCompare(left, right, "lteq");
				}
				return { type: "lteq", left, right, loc: dummyLoc };
			case ts.SyntaxKind.GreaterThanToken:
				// "a" > "b" → Str:lt(a, b) > 0
				if (
					this.converter.doTypeCheck &&
					isStringLike(node.left, this.converter.typeChecker)
				) {
					return this.buildStringCompare(left, right, "gt");
				}
				return { type: "gt", left, right, loc: dummyLoc };
			case ts.SyntaxKind.GreaterThanEqualsToken:
				// "a" >= "b" → Str:lt(a, b) >= 0
				if (
					this.converter.doTypeCheck &&
					isStringLike(node.left, this.converter.typeChecker)
				) {
					return this.buildStringCompare(left, right, "gteq");
				}
				return { type: "gteq", left, right, loc: dummyLoc };
			case ts.SyntaxKind.InKeyword:
				// key in obj → Obj:keys(obj).incl(key)
				return {
					type: "call",
					target: {
						type: "prop",
						target: {
							type: "call",
							target: { type: "identifier", name: "Obj:keys", loc: dummyLoc },
							args: [right],
							loc: dummyLoc,
						},
						name: "incl",
						loc: dummyLoc,
					},
					args: [left],
					loc: dummyLoc,
				};
			default:
				this.converter.throwError(
					`サポートされていない二項演算子です: ${ts.SyntaxKind[node.operatorToken.kind]}`,
					node,
				);
		}
	}
}
