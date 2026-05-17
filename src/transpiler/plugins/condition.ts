import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
import { dummyLoc } from "../consts.js";
import { coerceToBool } from "../utils/typeValidation.js";

export class ConditionPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		if (ts.isIfStatement(node)) {
			return [this.convertIfStatement(node)];
		}
	};

	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		if (ts.isConditionalExpression(node)) {
			return this.convertConditionalExpression(node);
		}
	};

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

		return { type: "if", cond, then, elseif, else: elseClause, loc: dummyLoc };
	}

	private convertIfStatement(node: ts.IfStatement): Ast.If {
		const cond = coerceToBool(
			node.expression,
			this.converter.convertExpressionAsExpression(node.expression),
			this.converter,
		);
		const then = this.convertStatementOrExpression(node.thenStatement);

		const elseif: Ast.If["elseif"] = [];
		let elseClause: Ast.Statement | Ast.Expression | undefined;

		let current = node.elseStatement;
		while (current) {
			if (ts.isIfStatement(current)) {
				// else if
				const elifCond = coerceToBool(
					current.expression,
					this.converter.convertExpressionAsExpression(current.expression),
					this.converter,
				);
				const elifThen = this.convertStatementOrExpression(
					current.thenStatement,
				);
				// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
				elseif.push({ cond: elifCond, then: elifThen });
				current = current.elseStatement;
			} else {
				// else
				elseClause = this.convertStatementOrExpression(current);
				break;
			}
		}

		return { type: "if", cond, then, elseif, else: elseClause, loc: dummyLoc };
	}

	private convertStatementOrExpression(
		node: ts.Statement,
	): Ast.Statement | Ast.Expression {
		const exprs = this.converter.convertStatementAsStatements(node);
		switch (exprs.length) {
			case 0:
				return { type: "null", loc: dummyLoc };
			case 1:
				return exprs[0] as Ast.Statement | Ast.Expression;
			default:
				return { type: "block", statements: exprs, loc: dummyLoc };
		}
	}
}
