import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
export class StatementsPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        switch (true) {
            case ts.isReturnStatement(node):
                return [this.convertReturnStatement(node)];
            case ts.isBreakStatement(node):
                return [this.convertBreakStatement(node)];
            case ts.isContinueStatement(node):
                return [this.convertContinueStatement(node)];
            case ts.isBlock(node):
                return [this.convertBlockStatement(node)];
        }
    };
    convertReturnStatement(node) {
        const expr = node.expression
            ? this.converter.convertExpressionAsExpression(node.expression)
            : { type: "null", loc: dummyLoc };
        return {
            type: "return",
            expr,
            loc: dummyLoc,
        };
    }
    convertBreakStatement(_node) {
        return { type: "break", loc: dummyLoc };
    }
    convertContinueStatement(_node) {
        return { type: "continue", loc: dummyLoc };
    }
    convertBlockStatement(node) {
        const statements = node.statements.flatMap((x) => this.converter.convertStatementAsStatements(x));
        return {
            type: "block",
            statements: statements,
            loc: dummyLoc,
        };
    }
}
//# sourceMappingURL=statements.js.map