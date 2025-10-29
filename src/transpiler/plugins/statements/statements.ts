import ts from "typescript"
import { TranspilerPlugin } from "../../base"
import type { Ast } from "@syuilo/aiscript"
import { dummyLoc } from "../../consts"

export class StatementsPlugin extends TranspilerPlugin {
    override tryConvertStatementAsStatements = (node: ts.Statement): (Ast.Expression | Ast.Statement)[] | undefined => {
        switch (true) {
            case ts.isReturnStatement(node):
                return [this.convertReturnStatement(node)]
            case ts.isBreakStatement(node):
                return [this.convertBreakStatement(node)]
            case ts.isContinueStatement(node):
                return [this.convertContinueStatement(node)]
            case ts.isBlock(node):
                return [this.convertBlockStatement(node)]
        }
    }

    private convertReturnStatement(node: ts.ReturnStatement): Ast.Return {
        const expr: Ast.Expression = node.expression
            ? this.converter.convertExpressionAsExpression(node.expression)
            : { type: "null", loc: dummyLoc };

        return {
            type: "return",
            expr,
            loc: dummyLoc
        };
    }

    private convertBreakStatement(_node: ts.BreakStatement): Ast.Break {
        return { type: "break", loc: dummyLoc };
    }

    private convertContinueStatement(_node: ts.ContinueStatement): Ast.Continue {
        return { type: "continue", loc: dummyLoc };
    }

    private convertBlockStatement(node: ts.Block): Ast.Block {
        const statements = node.statements.flatMap(x => this.converter.convertStatementAsStatements(x))
        return {
            type: "block",
            statements: statements,
            loc: dummyLoc
        };
    }
}