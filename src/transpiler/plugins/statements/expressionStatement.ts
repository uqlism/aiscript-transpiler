import ts from "typescript"
import { TranspilerPlugin } from "../../base.js"

export class ExpressionStatementPlugin extends TranspilerPlugin {
    override tryConvertStatementAsStatements = (node: ts.Statement) => {
        if (ts.isExpressionStatement(node)) {
            return this.converter.convertExpressionAsStatements(node.expression)
        }
    }
}
