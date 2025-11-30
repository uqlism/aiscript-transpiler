import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";

export class SwitchStatementPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		if (ts.isSwitchStatement(node)) {
			return this.convertSwitchStatement(node);
		}
	};

	private convertSwitchStatement(
		node: ts.SwitchStatement,
	): (Ast.Statement | Ast.Expression)[] {
		const switchExpr = this.converter.convertExpressionAsExpression(
			node.expression,
		);

		// match文のケースと default を構築
		const cases: Array<{ cond: Ast.Expression; body: Ast.Block }> = [];
		let defaultBody: Ast.Block | undefined;

		for (const clause of node.caseBlock.clauses) {
			if (ts.isCaseClause(clause)) {
				const caseValue = this.converter.convertExpressionAsExpression(
					clause.expression,
				);
				const caseStatements = this.convertSwitchCaseBodyToStatements(
					clause.statements,
				);

				// ケースボディを常にブロックにする
				const caseBody: Ast.Block = {
					type: "block",
					statements: caseStatements,
					loc: dummyLoc,
				};

				cases.push({
					cond: caseValue,
					body: caseBody,
				});
			} else if (ts.isDefaultClause(clause)) {
				const defaultStatements = this.convertSwitchCaseBodyToStatements(clause.statements);
				defaultBody = {
					type: "block",
					statements: defaultStatements,
					loc: dummyLoc,
				};
			}
		}

		// AiScript match文として生成
		const matchStatement: Ast.Match = {
			type: "match",
			about: switchExpr,
			qs: cases.map(caseItem => ({
				q: caseItem.cond,
				a: caseItem.body,
			})),
			default: defaultBody,
			loc: dummyLoc,
		};

		return [matchStatement];
	}

	private createNull(): Ast.Null {
		return { type: "null", loc: dummyLoc };
	}

	private convertSwitchCaseBodyToStatements(
		statements: ts.NodeArray<ts.Statement>,
	): (Ast.Statement | Ast.Expression)[] {
		if (statements.length === 0) {
			return [];
		}

		const convertedStatements: (Ast.Statement | Ast.Expression)[] = [];
		let hasBreakOrReturn = false;

		for (const statement of statements) {
			if (ts.isBreakStatement(statement)) {
				hasBreakOrReturn = true;
				break;
			} else if (ts.isReturnStatement(statement)) {
				hasBreakOrReturn = true;
				const expr = statement.expression
					? this.converter.convertExpressionAsExpression(statement.expression)
					: this.createNull();
				convertedStatements.push({
					type: "return",
					expr,
					loc: dummyLoc,
				});
				break;
			} else {
				convertedStatements.push(
					...this.converter.convertStatementAsStatements(statement),
				);
			}
		}

		if (!hasBreakOrReturn) {
			this.converter.throwError(
				"case節の末尾にbreakまたはreturnが必要です",
				statements[statements.length - 1] as any,
			);
		}

		return convertedStatements;
	}
}
