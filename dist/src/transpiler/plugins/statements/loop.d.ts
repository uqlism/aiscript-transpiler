import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class LoopStatementsPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    private convertStatementToStatements;
    private convertForStatement;
    private convertWhileStatement;
    private convertDoWhileStatement;
}
//# sourceMappingURL=loop.d.ts.map