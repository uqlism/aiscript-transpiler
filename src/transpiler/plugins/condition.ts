import ts from "typescript"
import { TranspilerPlugin } from "../base.js"
import type { Ast } from "@syuilo/aiscript"
import { validateBooleanExpression } from "../utils/typeValidation.js"
import { dummyLoc } from "../consts.js"

export class ConditionPlugin extends TranspilerPlugin {
    override tryConvertStatementAsStatements = (node: ts.Statement): (Ast.Expression | Ast.Statement)[] | undefined => {
        if (ts.isIfStatement(node)) {
            return [this.convertIfStatement(node)]
        }
    }

    override tryConvertExpressionAsExpression = (node: ts.Expression): Ast.Expression | undefined => {
        if (ts.isConditionalExpression(node)) {
            return this.convertConditionalExpression(node)
        }
    }

    private convertConditionalExpression(node: ts.ConditionalExpression): Ast.If {
        validateBooleanExpression(node.condition, this.converter.typeChecker);
        const cond = this.converter.convertExpressionAsExpression(node.condition);
        const then = this.converter.convertExpressionAsExpression(node.whenTrue);

        const elseif: Ast.If["elseif"] = [];
        let elseClause: Ast.Expression | undefined;

        let current = node.whenFalse;
        while (current) {
            if (ts.isConditionalExpression(current)) {
                // else if
                validateBooleanExpression(current.condition, this.converter.typeChecker);
                const elifCond = this.converter.convertExpressionAsExpression(current.condition);
                const elifThen = this.converter.convertExpressionAsExpression(current.whenTrue);
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
        validateBooleanExpression(node.expression, this.converter.typeChecker);
        const cond = this.converter.convertExpressionAsExpression(node.expression);
        const then = this.convertStatementOrExpression(node.thenStatement);

        const elseif: Ast.If["elseif"] = [];
        let elseClause: Ast.Statement | Ast.Expression | undefined;

        let current = node.elseStatement;
        while (current) {
            if (ts.isIfStatement(current)) {
                // else if
                validateBooleanExpression(current.expression, this.converter.typeChecker);
                const elifCond = this.converter.convertExpressionAsExpression(current.expression);
                const elifThen = this.convertStatementOrExpression(current.thenStatement);
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
}
