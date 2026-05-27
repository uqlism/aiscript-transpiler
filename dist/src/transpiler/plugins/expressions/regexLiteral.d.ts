import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class RegExpPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertRegexLiteral;
    private convertNewRegExp;
}
//# sourceMappingURL=regexLiteral.d.ts.map