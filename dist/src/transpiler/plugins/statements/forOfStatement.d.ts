import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class ForOfStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    private convertForOfStatement;
}
//# sourceMappingURL=forOfStatement.d.ts.map