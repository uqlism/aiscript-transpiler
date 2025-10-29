import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class StatementsPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    private convertReturnStatement;
    private convertBreakStatement;
    private convertContinueStatement;
    private convertBlockStatement;
}
//# sourceMappingURL=statements.d.ts.map