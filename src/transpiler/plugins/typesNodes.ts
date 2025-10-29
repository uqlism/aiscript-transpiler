import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../base.js";

/** TSの型にしか影響しない表現を無視 */
export class TypeNodesPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		switch (true) {
			case ts.isTypeAliasDeclaration(node):
				return [];
			case ts.isInterfaceDeclaration(node):
				return [];
		}
	};

	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		switch (true) {
			case ts.isAsExpression(node):
				return this.convertAsExpression(node);
			case ts.isSatisfiesExpression(node):
				return this.convertSatisfiesExpression(node);
		}
	};

	private convertAsExpression(node: ts.AsExpression): Ast.Expression {
		return this.converter.convertExpressionAsExpression(node.expression);
	}

	private convertSatisfiesExpression(
		node: ts.SatisfiesExpression,
	): Ast.Expression {
		return this.converter.convertExpressionAsExpression(node.expression);
	}
}
