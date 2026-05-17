import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { coerceToBool } from "../../utils/typeValidation.js";
function isSimple(expr) {
    return (expr.type === "identifier" ||
        expr.type === "num" ||
        expr.type === "str" ||
        expr.type === "bool" ||
        expr.type === "null");
}
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
        const args = node.arguments.map((arg) => this.converter.convertExpressionAsExpression(arg));
        // a?.() — 呼び出し自体がオプショナル
        if (node.questionDotToken) {
            const target = this.converter.convertExpressionAsExpression(node.expression);
            return this.wrapOptionalCall(target, args);
        }
        // a?.b() — プロパティアクセスがオプショナル
        if (ts.isPropertyAccessExpression(node.expression) &&
            node.expression.questionDotToken) {
            const propNode = node.expression;
            const obj = this.converter.convertExpressionAsExpression(propNode.expression);
            const propName = propNode.name.text;
            // 名前空間アクセスはオプショナルチェーン不要
            if (obj.type === "identifier" &&
                this.converter.getNamespaces().includes(obj.name)) {
                return {
                    type: "call",
                    target: {
                        type: "identifier",
                        name: `${obj.name}:${propName}`,
                        loc: dummyLoc,
                    },
                    args,
                    loc: dummyLoc,
                };
            }
            const tmp = this.converter.getUniqueIdentifier();
            return {
                type: "block",
                statements: [
                    {
                        type: "def",
                        dest: tmp,
                        expr: obj,
                        mut: false,
                        attr: [],
                        loc: dummyLoc,
                    },
                    {
                        type: "if",
                        cond: {
                            type: "neq",
                            left: tmp,
                            right: { type: "null", loc: dummyLoc },
                            loc: dummyLoc,
                        },
                        // biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
                        then: {
                            type: "call",
                            target: {
                                type: "prop",
                                target: tmp,
                                name: propName,
                                loc: dummyLoc,
                            },
                            args,
                            loc: dummyLoc,
                        },
                        elseif: [],
                        else: { type: "null", loc: dummyLoc },
                        loc: dummyLoc,
                    },
                ],
                loc: dummyLoc,
            };
        }
        const target = this.converter.convertExpressionAsExpression(node.expression);
        return { type: "call", target, args, loc: dummyLoc };
    }
    // fn?.() → if (fn != null) fn() else null  (単純な式なら eval 不要)
    wrapOptionalCall(target, args) {
        const src = isSimple(target)
            ? target
            : this.converter.getUniqueIdentifier();
        const ifExpr = {
            type: "if",
            cond: {
                type: "neq",
                left: src,
                right: { type: "null", loc: dummyLoc },
                loc: dummyLoc,
            },
            // biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
            then: { type: "call", target: src, args, loc: dummyLoc },
            elseif: [],
            else: { type: "null", loc: dummyLoc },
            loc: dummyLoc,
        };
        if (src === target)
            return ifExpr;
        return {
            type: "block",
            statements: [
                {
                    type: "def",
                    dest: src,
                    expr: target,
                    mut: false,
                    attr: [],
                    loc: dummyLoc,
                },
                ifExpr,
            ],
            loc: dummyLoc,
        };
    }
    convertParenthesizedExpression(node) {
        return this.converter.convertExpressionAsExpression(node.expression);
    }
    convertConditionalExpression(node) {
        const cond = coerceToBool(node.condition, this.converter.convertExpressionAsExpression(node.condition), this.converter);
        const then = this.converter.convertExpressionAsExpression(node.whenTrue);
        const elseif = [];
        let elseClause;
        let current = node.whenFalse;
        while (current) {
            if (ts.isConditionalExpression(current)) {
                // else if
                const elifCond = coerceToBool(current.condition, this.converter.convertExpressionAsExpression(current.condition), this.converter);
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