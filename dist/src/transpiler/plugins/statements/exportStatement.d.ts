import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class ExportStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    private convertExportDeclaration;
}
//# sourceMappingURL=exportStatement.d.ts.map