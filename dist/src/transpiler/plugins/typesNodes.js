import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
/** TSの型にしか影響しない表現を無視 */
export class TypeNodesPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        switch (true) {
            case ts.isTypeAliasDeclaration(node):
                return [];
            case ts.isInterfaceDeclaration(node):
                return [];
        }
    };
    tryConvertExpressionAsExpression = (node) => {
        switch (true) {
            case ts.isAsExpression(node):
                return this.convertAsExpression(node);
            case ts.isSatisfiesExpression(node):
                return this.convertSatisfiesExpression(node);
        }
    };
    convertAsExpression(node) {
        return this.converter.convertExpressionAsExpression(node.expression);
    }
    convertSatisfiesExpression(node) {
        return this.converter.convertExpressionAsExpression(node.expression);
    }
}
//# sourceMappingURL=typesNodes.js.map