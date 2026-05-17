import type { Ast } from "@syuilo/aiscript";
/**
 * AiScript ASTをAiScriptコード文字列に変換するクラス
 */
export declare class AiScriptStringifier {
    private readonly indentStr;
    /**
     * AiScript ASTをAiScriptコード文字列に変換する
     */
    static stringify(nodes: Ast.Node[]): string;
    private stringifyNodes;
    private stringifyTopLevelNode;
    private getIndent;
    private stringifyNode;
    private stringifyExpression;
    /**
     * 演算子の子として式を文字列化する。
     * - isRight=false (左辺) : 自分の優先度 < 親の優先度 → ()
     * - isRight=true  (右辺) : 自分の優先度 ≤ 親の優先度 → () (左結合の意味論を保つため)
     */
    private childExpr;
    private stringifyStatement;
    private stringifyDefinition;
    private stringifyFn;
    private stringifyBlock;
    private stringifyArray;
    private stringifyObject;
    private stringifyTemplate;
    private stringifyCall;
    private stringifyIf;
    private stringifyMatch;
    private stringifyLoop;
    private stringifyEach;
    private stringifyAssign;
    private stringifyAddAssign;
    private stringifySubAssign;
    private stringifyReturn;
    private stringifyBreak;
    private stringifyContinue;
    private stringifyIdentifier;
    private stringifyNumber;
    private stringifyString;
    private stringifyBoolean;
    private stringifyNull;
    private stringifyProperty;
    private stringifyIndex;
    private stringifyNot;
    private stringifyPlus;
    private stringifyMinus;
    private stringifyAnd;
    private stringifyOr;
    private stringifyAdd;
    private stringifySub;
    private stringifyMul;
    private stringifyDiv;
    private stringifyRem;
    private stringifyPow;
    private stringifyEq;
    private stringifyNeq;
    private stringifyLt;
    private stringifyLteq;
    private stringifyGt;
    private stringifyGteq;
}
//# sourceMappingURL=stringifier.d.ts.map