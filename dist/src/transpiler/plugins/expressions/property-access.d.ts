import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class PropertyAccessPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertPropertyAccessExpression;
    private convertElementAccessExpression;
    /** ターゲット式をnullチェック付きif式でラップする。
     *  単純な式（識別子・リテラル）なら eval ブロック不要で if のみを返す。*/
    private wrapOptional;
}
//# sourceMappingURL=property-access.d.ts.map