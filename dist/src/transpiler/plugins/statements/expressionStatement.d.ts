import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class ExpressionStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (import("@syuilo/aiscript/node.js").Expression | import("@syuilo/aiscript/node.js").Statement)[] | undefined;
}
//# sourceMappingURL=expressionStatement.d.ts.map