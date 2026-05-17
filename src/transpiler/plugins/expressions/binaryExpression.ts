import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertDestructuringPattern } from "../../utils/destructuring.js";
import {
	validateBooleanLike,
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
				].includes(unwrapped.operatorToken.kind)
			) {
				// 通常の代入
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
	): Ast.Statement[] {
		const left = this.converter.convertExpressionAsExpression(node.left);
		const right = this.converter.convertExpressionAsExpression(node.right);

		// 代入演算の型チェック
		this.validateAssignmentOperationTypes(node);

		// 代入演算子
		switch (node.operatorToken.kind) {
			case ts.SyntaxKind.EqualsToken:
				return [{ type: "assign", dest: left, expr: right, loc: dummyLoc }];
			case ts.SyntaxKind.PlusEqualsToken:
				return [{ type: "addAssign", dest: left, expr: right, loc: dummyLoc }];
			case ts.SyntaxKind.MinusEqualsToken:
				return [{ type: "subAssign", dest: left, expr: right, loc: dummyLoc }];
			case ts.SyntaxKind.ExclamationEqualsToken:
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "add", left: left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];
			case ts.SyntaxKind.AsteriskEqualsToken:
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "mul", left: left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];
			case ts.SyntaxKind.SlashEqualsToken:
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "div", left: left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];
			case ts.SyntaxKind.PercentEqualsToken:
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "rem", left: left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];
			case ts.SyntaxKind.AsteriskAsteriskEqualsToken:
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "pow", left: left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];
			case ts.SyntaxKind.AmpersandAmpersandEqualsToken:
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "and", left: left, right, loc: dummyLoc },
						loc: dummyLoc,
					},
				];
			case ts.SyntaxKind.BarBarEqualsToken:
				return [
					{
						type: "assign",
						dest: left,
						expr: { type: "or", left: left, right, loc: dummyLoc },
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

	private convertBinaryExpression(node: ts.BinaryExpression): Ast.Expression {
		// ?? は右辺の遅延評価が必要なので先に処理
		if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
			return this.convertNullishCoalescing(node);
		}

		const left = this.converter.convertExpressionAsExpression(node.left);
		const right = this.converter.convertExpressionAsExpression(node.right);

		// 型チェック
		this.validateBinaryOperationTypes(node);

		// 二項演算子
		switch (node.operatorToken.kind) {
			case ts.SyntaxKind.PlusToken:
				return { type: "add", left, right, loc: dummyLoc };
			case ts.SyntaxKind.MinusToken:
				return { type: "sub", left, right, loc: dummyLoc };
			case ts.SyntaxKind.AsteriskToken:
				return { type: "mul", left, right, loc: dummyLoc };
			case ts.SyntaxKind.SlashToken:
				return { type: "div", left, right, loc: dummyLoc };
			case ts.SyntaxKind.PercentToken:
				return { type: "rem", left, right, loc: dummyLoc };
			case ts.SyntaxKind.AsteriskAsteriskToken:
				return { type: "pow", left, right, loc: dummyLoc };
			case ts.SyntaxKind.EqualsEqualsToken:
			case ts.SyntaxKind.EqualsEqualsEqualsToken:
				return { type: "eq", left, right, loc: dummyLoc };
			case ts.SyntaxKind.ExclamationEqualsToken:
			case ts.SyntaxKind.ExclamationEqualsEqualsToken:
				return { type: "neq", left, right, loc: dummyLoc };
			case ts.SyntaxKind.LessThanToken:
				return { type: "lt", left, right, loc: dummyLoc };
			case ts.SyntaxKind.LessThanEqualsToken:
				return { type: "lteq", left, right, loc: dummyLoc };
			case ts.SyntaxKind.GreaterThanToken:
				return { type: "gt", left, right, loc: dummyLoc };
			case ts.SyntaxKind.GreaterThanEqualsToken:
				return { type: "gteq", left, right, loc: dummyLoc };
			case ts.SyntaxKind.AmpersandAmpersandToken:
				return { type: "and", left, right, loc: dummyLoc };
			case ts.SyntaxKind.BarBarToken:
				return { type: "or", left, right, loc: dummyLoc };
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

	private validateBinaryOperationTypes(node: ts.BinaryExpression): void {
		// 算術演算子（Number型が必要）
		const arithmeticOperators = [
			ts.SyntaxKind.PlusToken,
			ts.SyntaxKind.MinusToken,
			ts.SyntaxKind.AsteriskToken,
			ts.SyntaxKind.SlashToken,
			ts.SyntaxKind.PercentToken,
			ts.SyntaxKind.AsteriskAsteriskToken,
		];

		// 論理演算子（Boolean型が必要）
		const logicalOperators = [
			ts.SyntaxKind.AmpersandAmpersandToken,
			ts.SyntaxKind.BarBarToken,
		];

		if (arithmeticOperators.includes(node.operatorToken.kind)) {
			// 算術演算の場合、両オペランドがNumber型である必要がある
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
		} else if (logicalOperators.includes(node.operatorToken.kind)) {
			// 論理演算の場合、両オペランドがBoolean型である必要がある
			validateBooleanLike(
				node.left,
				this.converter,
				`論理演算子 '${node.operatorToken.getText()}' の左オペランドはBoolean型である必要があります`,
			);
			validateBooleanLike(
				node.right,
				this.converter,
				`論理演算子 '${node.operatorToken.getText()}' の右オペランドはBoolean型である必要があります`,
			);
		}
	}

	private validateAssignmentOperationTypes(node: ts.BinaryExpression): void {
		// 算術代入演算子（Number型が必要）
		const arithmeticAssignmentOperators = [
			ts.SyntaxKind.PlusEqualsToken,
			ts.SyntaxKind.MinusEqualsToken,
			ts.SyntaxKind.AsteriskEqualsToken,
			ts.SyntaxKind.SlashEqualsToken,
			ts.SyntaxKind.PercentEqualsToken,
			ts.SyntaxKind.AsteriskAsteriskEqualsToken,
		];

		// 論理代入演算子（Boolean型が必要）
		const logicalAssignmentOperators = [
			ts.SyntaxKind.AmpersandAmpersandEqualsToken,
			ts.SyntaxKind.BarBarEqualsToken,
		];

		if (arithmeticAssignmentOperators.includes(node.operatorToken.kind)) {
			// 算術代入演算の場合、両オペランドがNumber型である必要がある
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
		} else if (logicalAssignmentOperators.includes(node.operatorToken.kind)) {
			// 論理代入演算の場合、両オペランドがBoolean型である必要がある
			validateBooleanLike(
				node.left,
				this.converter,
				`論理代入演算子 '${node.operatorToken.getText()}' の左オペランドはBoolean型である必要があります`,
			);
			validateBooleanLike(
				node.right,
				this.converter,
				`論理代入演算子 '${node.operatorToken.getText()}' の右オペランドはBoolean型である必要があります`,
			);
		}
	}
}
