import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
export class SwitchStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        if (ts.isSwitchStatement(node)) {
            return this.convertSwitchStatement(node);
        }
    };
    convertSwitchStatement(node) {
        const switchExpr = this.converter.convertExpressionAsExpression(node.expression);
        // switch式の値を一時変数に保存（複数回参照されるため）
        const tempVar = this.converter.getUniqueIdentifier();
        const tempVarDef = {
            type: "def",
            dest: tempVar,
            expr: switchExpr,
            mut: false,
            attr: [],
            loc: dummyLoc,
        };
        // if-elif文チェーンを構築
        let ifStatement;
        let defaultBody = [];
        for (const clause of node.caseBlock.clauses) {
            if (ts.isCaseClause(clause)) {
                const caseValue = this.converter.convertExpressionAsExpression(clause.expression);
                const caseBody = this.convertSwitchCaseBodyToStatements(clause.statements);
                // tempVar === caseValue の条件
                const condition = {
                    type: "eq",
                    left: tempVar,
                    right: caseValue,
                    loc: dummyLoc,
                };
                const thenBlock = {
                    type: "block",
                    statements: caseBody,
                    loc: dummyLoc,
                };
                if (!ifStatement) {
                    // 最初のif文
                    ifStatement = {
                        type: "if",
                        cond: condition,
                        // biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
                        then: thenBlock,
                        elseif: [],
                        else: undefined,
                        loc: dummyLoc,
                    };
                }
                else {
                    // elif文として追加
                    ifStatement.elseif.push({
                        cond: condition,
                        // biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
                        then: thenBlock,
                    });
                }
            }
            else if (ts.isDefaultClause(clause)) {
                defaultBody = this.convertSwitchCaseBodyToStatements(clause.statements);
            }
        }
        // default句がある場合はelse文として追加
        if (defaultBody.length > 0 && ifStatement) {
            ifStatement.else = {
                type: "block",
                statements: defaultBody,
                loc: dummyLoc,
            };
        }
        // 一時変数定義とif文を配列で返す
        if (ifStatement) {
            return [tempVarDef, ifStatement];
        }
        else {
            // case文がない場合（空のswitch）
            return [tempVarDef];
        }
    }
    createNull() {
        return { type: "null", loc: dummyLoc };
    }
    convertSwitchCaseBodyToStatements(statements) {
        if (statements.length === 0) {
            return [];
        }
        const convertedStatements = [];
        let hasBreakOrReturn = false;
        for (const statement of statements) {
            if (ts.isBreakStatement(statement)) {
                hasBreakOrReturn = true;
                break;
            }
            else if (ts.isReturnStatement(statement)) {
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
            }
            else {
                convertedStatements.push(...this.converter.convertStatementAsStatements(statement));
            }
        }
        if (!hasBreakOrReturn) {
            this.converter.throwError("case節の末尾にbreakまたはreturnが必要です", statements[statements.length - 1]);
        }
        return convertedStatements;
    }
}
//# sourceMappingURL=switchStatement.js.map