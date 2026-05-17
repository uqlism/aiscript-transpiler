import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class PropertyAccessPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertPropertyAccessExpression;
    private convertElementAccessExpression;
    /** ターゲット式をnullチェック付きブロックでラップする */
    private wrapOptional;
}
//# sourceMappingURL=property-access.d.ts.map