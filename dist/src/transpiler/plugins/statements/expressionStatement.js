import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export class ExpressionStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        if (ts.isExpressionStatement(node)) {
            return this.converter.convertExpressionAsStatements(node.expression);
        }
    };
}
//# sourceMappingURL=expressionStatement.js.map