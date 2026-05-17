import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";

export class StatementsPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		switch (true) {
			case ts.isReturnStatement(node):
				return [this.convertReturnStatement(node)];
			case ts.isBreakStatement(node):
				return [this.convertBreakStatement(node)];
			case ts.isContinueStatement(node):
				return [this.convertContinueStatement(node)];
			case ts.isBlock(node):
				return [this.convertBlockStatement(node)];
			case ts.isThrowStatement(node):
				return [this.convertThrowStatement(node)];
		}
	};

	private convertReturnStatement(node: ts.ReturnStatement): Ast.Return {
		const expr: Ast.Expression = node.expression
			? this.converter.convertExpressionAsExpression(node.expression)
			: { type: "null", loc: dummyLoc };

		return {
			type: "return",
			expr,
			loc: dummyLoc,
		};
	}

	private convertBreakStatement(_node: ts.BreakStatement): Ast.Break {
		return { type: "break", loc: dummyLoc };
	}

	private convertContinueStatement(_node: ts.ContinueStatement): Ast.Continue {
		return { type: "continue", loc: dummyLoc };
	}

	// throw expr → Core:abort(msg)
	// throw new Error("msg") / throw "msg" / throw someVar に対応
	private convertThrowStatement(node: ts.ThrowStatement): Ast.Expression {
		const expr = node.expression;
		let msgExpr: Ast.Expression;

		if (ts.isNewExpression(expr) && ts.isIdentifier(expr.expression)) {
			// throw new Error("msg") → message プロパティまたは第一引数を使う
			const firstArg = expr.arguments?.[0];
			msgExpr = firstArg
				? this.converter.convertExpressionAsExpression(firstArg)
				: { type: "str", value: expr.expression.text, loc: dummyLoc };
		} else {
			msgExpr = this.converter.convertExpressionAsExpression(expr);
		}

		return {
			type: "call",
			target: { type: "identifier", name: "Core:abort", loc: dummyLoc },
			args: [msgExpr],
			loc: dummyLoc,
		};
	}

	private convertBlockStatement(node: ts.Block): Ast.Block {
		const statements = node.statements.flatMap((x) =>
			this.converter.convertStatementAsStatements(x),
		);
		return {
			type: "block",
			statements: statements,
			loc: dummyLoc,
		};
	}
}
