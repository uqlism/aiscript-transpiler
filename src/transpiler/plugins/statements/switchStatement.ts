import ts from "typescript"
import { TranspilerPlugin } from "../../base"
import type { Ast } from "@syuilo/aiscript"
import { dummyLoc } from "../../consts"

export class SwitchStatementPlugin extends TranspilerPlugin {
    override tryConvertStatementAsStatements = (node: ts.Statement): (Ast.Expression | Ast.Statement)[] | undefined => {
        if (ts.isSwitchStatement(node)) {
            return this.convertSwitchStatement(node)
        }
    }


    private convertStatementOrExpression(node: ts.Statement): Ast.Statement | Ast.Expression {
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

    private convertSwitchStatement(node: ts.SwitchStatement): (Ast.Statement | Ast.Expression)[] {
        const switchExpr = this.converter.convertExpressionAsExpression(node.expression);

        // switch式の値を一時変数に保存（複数回参照されるため）
        const tempVar = this.converter.getUniqueIdentifier();
        const tempVarDef: Ast.Definition = {
            type: "def",
            dest: tempVar,
            expr: switchExpr,
            mut: false,
            attr: [],
            loc: dummyLoc
        };

        // if-elif文チェーンを構築
        let ifStatement: Ast.If | undefined = undefined;
        let defaultBody: (Ast.Statement | Ast.Expression)[] = [];

        for (const clause of node.caseBlock.clauses) {
            if (ts.isCaseClause(clause)) {
                const caseValue = this.converter.convertExpressionAsExpression(clause.expression);
                const caseBody = this.convertSwitchCaseBodyToStatements(clause.statements);

                // tempVar === caseValue の条件
                const condition: Ast.Eq = {
                    type: "eq",
                    left: tempVar,
                    right: caseValue,
                    loc: dummyLoc
                };

                const thenBlock: Ast.Block = {
                    type: "block",
                    statements: caseBody,
                    loc: dummyLoc
                };

                if (!ifStatement) {
                    // 最初のif文
                    ifStatement = {
                        type: "if",
                        cond: condition,
                        then: thenBlock,
                        elseif: [],
                        else: undefined,
                        loc: dummyLoc
                    };
                } else {
                    // elif文として追加
                    ifStatement.elseif.push({
                        cond: condition,
                        then: thenBlock
                    });
                }
            } else if (ts.isDefaultClause(clause)) {
                defaultBody = this.convertSwitchCaseBodyToStatements(clause.statements);
            }
        }

        // default句がある場合はelse文として追加
        if (defaultBody.length > 0 && ifStatement) {
            ifStatement.else = {
                type: "block",
                statements: defaultBody,
                loc: dummyLoc
            };
        }

        // 一時変数定義とif文を配列で返す
        if (ifStatement) {
            return [tempVarDef, ifStatement];
        } else {
            // case文がない場合（空のswitch）
            return [tempVarDef];
        }
    }

    private createNull(): Ast.Null {
        return { type: "null", loc: dummyLoc };
    }


    private convertSwitchCaseBodyToStatements(statements: ts.NodeArray<ts.Statement>): (Ast.Statement | Ast.Expression)[] {
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
                    loc: dummyLoc
                });
                break;
            } else {
                convertedStatements.push(...this.converter.convertStatementAsStatements(statement));
            }
        }

        if (!hasBreakOrReturn) {
            this.converter.throwError("case節の末尾にbreakまたはreturnが必要です", statements[statements.length - 1] as any);
        }

        return convertedStatements;
    }

}