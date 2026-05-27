import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class PropertyAccessPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertPropertyAccessExpression;
    private convertElementAccessExpression;
    /**
     * 要素アクセスのインデックス式を AiScript 用に変換する。
     * オブジェクト型に数値インデックスでアクセスする場合（RegExpMatchResult[0] 等）は
     * 数値リテラルを文字列リテラルに変換し、それ以外は変換済み式をそのまま返す。
     */
    private buildIndex;
    /** ターゲット式をnullチェック付きif式でラップする。
     *  単純な式（識別子・リテラル）なら eval ブロック不要で if のみを返す。*/
    private wrapOptional;
}
//# sourceMappingURL=property-access.d.ts.map