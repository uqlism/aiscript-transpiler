import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
import { dummyLoc } from "../consts.js";
import { coerceToBool } from "../utils/typeValidation.js";
export class ConditionPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        if (ts.isIfStatement(node)) {
            return [this.convertIfStatement(node)];
        }
    };
    tryConvertExpressionAsExpression = (node) => {
        if (ts.isConditionalExpression(node)) {
            return this.convertConditionalExpression(node);
        }
    };
    convertConditionalExpression(node) {
        const cond = coerceToBool(node.condition, this.converter.convertExpressionAsExpression(node.condition), this.converter);
        const then = this.converter.convertExpressionAsExpression(node.whenTrue);
        const elseif = [];
        let elseClause;
        let current = node.whenFalse;
        while (current) {
            if (ts.isConditionalExpression(current)) {
                // else if
                const elifCond = coerceToBool(current.condition, this.converter.convertExpressionAsExpression(current.condition), this.converter);
                const elifThen = this.converter.convertExpressionAsExpression(current.whenTrue);
                // biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
                elseif.push({ cond: elifCond, then: elifThen });
                current = current.whenFalse;
            }
            else {
                // else
                elseClause = this.converter.convertExpressionAsExpression(current);
                break;
            }
        }
        return { type: "if", cond, then, elseif, else: elseClause, loc: dummyLoc };
    }
    convertIfStatement(node) {
        const cond = coerceToBool(node.expression, this.converter.convertExpressionAsExpression(node.expression), this.converter);
        const then = this.convertStatementOrExpression(node.thenStatement);
        const elseif = [];
        let elseClause;
        let current = node.elseStatement;
        while (current) {
            if (ts.isIfStatement(current)) {
                // else if
                const elifCond = coerceToBool(current.expression, this.converter.convertExpressionAsExpression(current.expression), this.converter);
                const elifThen = this.convertStatementOrExpression(current.thenStatement);
                // biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
                elseif.push({ cond: elifCond, then: elifThen });
                current = current.elseStatement;
            }
            else {
                // else
                elseClause = this.convertStatementOrExpression(current);
                break;
            }
        }
        return { type: "if", cond, then, elseif, else: elseClause, loc: dummyLoc };
    }
    convertStatementOrExpression(node) {
        const exprs = this.converter.convertStatementAsStatements(node);
        switch (exprs.length) {
            case 0:
                return { type: "null", loc: dummyLoc };
            case 1:
                return exprs[0];
            default:
                return { type: "block", statements: exprs, loc: dummyLoc };
        }
    }
}
//# sourceMappingURL=condition.js.map