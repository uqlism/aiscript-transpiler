import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";

export class UnaryExpressionPlugin extends TranspilerPlugin {
	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		switch (true) {
			case ts.isPrefixUnaryExpression(node):
				return this.convertPrefixUnaryExpressionAsExpression(node);
			case ts.isPostfixUnaryExpression(node):
				return this.convertPostfixUnaryExpression(node);
		}
	};

	override tryConvertExpressionAsStatements = (
		node: ts.Expression,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		switch (true) {
			case ts.isPostfixUnaryExpression(node):
				return [this.convertPostfixUnaryExpressionAsStatement(node)];
			case ts.isPrefixUnaryExpression(node):
				return [this.convertPrefixUnaryExpressionAsStatement(node)];
		}
		return;
	};

	private convertPrefixUnaryExpressionAsExpression(
		node: ts.PrefixUnaryExpression,
	): Ast.Expression {
		// 型チェック
		this.validateUnaryOperationTypes(node);

		const expr = this.converter.convertExpressionAsExpression(node.operand);
		switch (node.operator) {
			case ts.SyntaxKind.PlusToken:
				if (expr.type === "num")
					return { type: "num", value: expr.value, loc: dummyLoc };
				return { type: "plus", expr, loc: dummyLoc };
			case ts.SyntaxKind.MinusToken:
				if (expr.type === "num")
					return { type: "num", value: -expr.value, loc: dummyLoc };
				return { type: "minus", expr, loc: dummyLoc };
			case ts.SyntaxKind.ExclamationToken:
				if (expr.type === "bool")
					return { type: "bool", value: !expr.value, loc: dummyLoc };
				return { type: "not", expr, loc: dummyLoc };
			case ts.SyntaxKind.PlusPlusToken:
				return {
					type: "block",
					statements: [
						{
							type: "addAssign",
							dest: expr,
							expr: { type: "num", value: 1, loc: dummyLoc },
							loc: dummyLoc,
						},
						expr,
					],
					loc: dummyLoc,
				};
			case ts.SyntaxKind.MinusMinusToken:
				return {
					type: "block",
					statements: [
						{
							type: "subAssign",
							dest: expr,
							expr: { type: "num", value: 1, loc: dummyLoc },
							loc: dummyLoc,
						},
						expr,
					],
					loc: dummyLoc,
				};

			default:
				this.converter.throwError(
					`サポートされていない単項演算子です: ${ts.SyntaxKind[node.operator]}`,
					node,
				);
		}
	}

	private convertPrefixUnaryExpressionAsStatement(
		node: ts.PrefixUnaryExpression,
	): Ast.Statement | Ast.Expression {
		// 型チェック
		this.validateUnaryOperationTypes(node);

		const expr = this.converter.convertExpressionAsExpression(node.operand);
		switch (node.operator) {
			case ts.SyntaxKind.PlusToken:
			case ts.SyntaxKind.MinusToken:
			case ts.SyntaxKind.ExclamationToken:
				return this.convertPrefixUnaryExpressionAsExpression(node);
			case ts.SyntaxKind.PlusPlusToken:
				return {
					type: "addAssign",
					dest: expr,
					expr: { type: "num", value: 1, loc: dummyLoc },
					loc: dummyLoc,
				};
			case ts.SyntaxKind.MinusMinusToken:
				return {
					type: "subAssign",
					dest: expr,
					expr: { type: "num", value: 1, loc: dummyLoc },
					loc: dummyLoc,
				};
			default:
				this.converter.throwError(
					`サポートされていない単項演算子です: ${ts.SyntaxKind[node.operator]}`,
					node,
				);
		}
	}

	private convertPostfixUnaryExpression(
		node: ts.PostfixUnaryExpression,
	): Ast.Expression {
		const expr = this.converter.convertExpressionAsExpression(node.operand);
		const temp = this.converter.getUniqueIdentifier();
		return {
			type: "block",
			statements: [
				{ type: "assign", dest: temp, expr, loc: dummyLoc },
				this.convertPostfixUnaryExpressionAsStatement(node),
				temp,
			],
			loc: dummyLoc,
		};
	}

	private convertPostfixUnaryExpressionAsStatement(
		node: ts.PostfixUnaryExpression,
	): Ast.Statement {
		// 型チェック - 後置演算子も数値型をチェック
		this.validatePostfixUnaryOperationTypes(node);

		const expr = this.converter.convertExpressionAsExpression(node.operand);
		switch (node.operator) {
			case ts.SyntaxKind.PlusPlusToken:
				// i++ → i += 1
				return {
					type: "addAssign",
					dest: expr,
					expr: { type: "num", value: 1, loc: dummyLoc },
					loc: dummyLoc,
				};
			case ts.SyntaxKind.MinusMinusToken:
				// i-- → i -= 1
				return {
					type: "subAssign",
					dest: expr,
					expr: { type: "num", value: 1, loc: dummyLoc },
					loc: dummyLoc,
				};
			default:
				this.converter.throwError(
					`サポートされていない後置単項演算子です: ${ts.SyntaxKind[node.operator]}`,
					node,
				);
		}
	}

	private validateUnaryOperationTypes(node: ts.PrefixUnaryExpression): void {
		switch (node.operator) {
			case ts.SyntaxKind.PlusToken:
			case ts.SyntaxKind.MinusToken:
				// +, - 演算子はNumber型が必要
				if (!this.isNumberLike(node.operand)) {
					const operandType = this.converter.typeChecker.getTypeAtLocation(
						node.operand,
					);
					this.converter.throwError(
						`単項算術演算子 '${ts.tokenToString(node.operator)}' のオペランドはNumber型である必要があります（現在の型: ${this.converter.typeChecker.typeToString(operandType)}）`,
						node.operand,
					);
				}
				break;
			case ts.SyntaxKind.ExclamationToken:
				// ! 演算子はBoolean型が必要
				if (!this.isBooleanLike(node.operand)) {
					const operandType = this.converter.typeChecker.getTypeAtLocation(
						node.operand,
					);
					this.converter.throwError(
						`論理否定演算子 '!' のオペランドはBoolean型である必要があります（現在の型: ${this.converter.typeChecker.typeToString(operandType)}）`,
						node.operand,
					);
				}
				break;
			case ts.SyntaxKind.PlusPlusToken:
			case ts.SyntaxKind.MinusMinusToken:
				// ++, -- 演算子はNumber型が必要
				if (!this.isNumberLike(node.operand)) {
					const operandType = this.converter.typeChecker.getTypeAtLocation(
						node.operand,
					);
					this.converter.throwError(
						`単項増減演算子 '${ts.tokenToString(node.operator)}' のオペランドはNumber型である必要があります（現在の型: ${this.converter.typeChecker.typeToString(operandType)}）`,
						node.operand,
					);
				}
				break;
		}
	}

	private validatePostfixUnaryOperationTypes(node: ts.PostfixUnaryExpression): void {
		switch (node.operator) {
			case ts.SyntaxKind.PlusPlusToken:
			case ts.SyntaxKind.MinusMinusToken:
				// ++, -- 演算子はNumber型が必要
				if (!this.isNumberLike(node.operand)) {
					const operandType = this.converter.typeChecker.getTypeAtLocation(
						node.operand,
					);
					this.converter.throwError(
						`後置増減演算子 '${ts.tokenToString(node.operator)}' のオペランドはNumber型である必要があります（現在の型: ${this.converter.typeChecker.typeToString(operandType)}）`,
						node.operand,
					);
				}
				break;
		}
	}

	private isNumberLike(expr: ts.Expression): boolean {
		return this.converter.typeChecker.isTypeAssignableTo(
			this.converter.typeChecker.getTypeAtLocation(expr),
			this.converter.typeChecker.getNumberType(),
		);
	}

	private isBooleanLike(expr: ts.Expression): boolean {
		return this.converter.typeChecker.isTypeAssignableTo(
			this.converter.typeChecker.getTypeAtLocation(expr),
			this.converter.typeChecker.getBooleanType(),
		);
	}
}
