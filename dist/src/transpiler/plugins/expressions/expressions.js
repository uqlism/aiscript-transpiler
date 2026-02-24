import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { validateBooleanExpression } from "../../utils/typeValidation.js";
export class ExpressionsPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression = (node) => {
        switch (true) {
            case ts.isIdentifier(node):
                return this.convertIdentifier(node);
            case node.kind === ts.SyntaxKind.ThisKeyword:
                return this.convertThisKeyword(node);
            case ts.isCallExpression(node):
                return this.convertCallExpression(node);
            case ts.isParenthesizedExpression(node):
                return this.convertParenthesizedExpression(node);
            case ts.isConditionalExpression(node):
                return this.convertConditionalExpression(node);
        }
    };
    convertIdentifier(node) {
        if (node.text === "undefined")
            return { type: "null", loc: dummyLoc };
        return { type: "identifier", name: node.text, loc: dummyLoc };
    }
    convertThisKeyword(node) {
        // クラス内かどうかをチェック
        if (!this.isInsideClass(node)) {
            this.converter.throwError("thisキーワードは使用できません。AiScriptにはthisの概念がありません", node);
        }
        // クラス内の this は __this に変換
        return { type: "identifier", name: "__this", loc: dummyLoc };
    }
    isInsideClass(node) {
        let current = node.parent;
        while (current) {
            // クラス宣言またはクラス式の中にいる場合は許可
            if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
                return true;
            }
            // オブジェクトリテラルに到達した場合は禁止
            if (ts.isObjectLiteralExpression(current)) {
                return false;
            }
            current = current.parent;
        }
        return false;
    }
    convertCallExpression(node) {
        const target = this.converter.convertExpressionAsExpression(node.expression);
        const args = node.arguments.map((arg) => this.converter.convertExpressionAsExpression(arg));
        return {
            type: "call",
            target,
            args,
            loc: dummyLoc,
        };
    }
    convertParenthesizedExpression(node) {
        return this.converter.convertExpressionAsExpression(node.expression);
    }
    convertConditionalExpression(node) {
        validateBooleanExpression(node.condition, this.converter);
        const cond = this.converter.convertExpressionAsExpression(node.condition);
        const then = this.converter.convertExpressionAsExpression(node.whenTrue);
        const elseif = [];
        let elseClause;
        let current = node.whenFalse;
        while (current) {
            if (ts.isConditionalExpression(current)) {
                // else if
                validateBooleanExpression(current.condition, this.converter);
                const elifCond = this.converter.convertExpressionAsExpression(current.condition);
                const elifThen = this.converter.convertExpressionAsExpression(current.whenTrue);
                // biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
                elseif.push({ cond: elifCond, then: elifThen });
                current = current.whenFalse;
            }
            else {
                // else
                elseClause = this.converter.convertExpressionAsExpression(current);
                break;
            }
        }
        return {
            type: "if",
            cond,
            then,
            elseif,
            else: elseClause,
            loc: dummyLoc,
        };
    }
}
//# sourceMappingURL=expressions.js.map