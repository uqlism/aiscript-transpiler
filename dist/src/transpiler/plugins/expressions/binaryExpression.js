import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertArrayAssignment, convertObjectAssignment, } from "../../utils/destructuring.js";
export class BinaryExpressionPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression = (node) => {
        if (ts.isBinaryExpression(node)) {
            return this.convertBinaryExpression(node);
        }
    };
    tryConvertExpressionAsStatements = (node) => {
        const unwrapped = this.unwrapParentheses(node);
        if (ts.isBinaryExpression(unwrapped)) {
            // 分割代入の場合
            if (unwrapped.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                (ts.isArrayLiteralExpression(unwrapped.left) ||
                    ts.isObjectLiteralExpression(unwrapped.left))) {
                return this.convertDestructuringAssignment(unwrapped);
            }
            else if ([
                ts.SyntaxKind.EqualsToken,
                ts.SyntaxKind.PlusEqualsToken,
                ts.SyntaxKind.MinusEqualsToken,
            ].includes(unwrapped.operatorToken.kind)) {
                // 通常の代入
                return this.convertBinaryAssignExpression(unwrapped);
            }
        }
    };
    unwrapParentheses(node) {
        while (ts.isParenthesizedExpression(node)) {
            node = node.expression;
        }
        return node;
    }
    convertDestructuringAssignment(node) {
        const rightExpr = this.converter.convertExpressionAsExpression(node.right);
        // 右辺が複雑な式の場合は一時変数に保存
        let sourceExpr;
        const statements = [];
        if (rightExpr.type === "identifier") {
            sourceExpr = rightExpr;
        }
        else {
            const tempVar = this.converter.getUniqueIdentifier();
            statements.push({
                type: "def",
                dest: tempVar,
                expr: rightExpr,
                mut: false,
                attr: [],
                loc: dummyLoc,
            });
            sourceExpr = tempVar;
        }
        // 分割代入を展開（代入文なので assign モードを使用）
        if (ts.isArrayLiteralExpression(node.left)) {
            statements.push(...convertArrayAssignment(node.left, sourceExpr, this.converter));
        }
        else if (ts.isObjectLiteralExpression(node.left)) {
            statements.push(...convertObjectAssignment(node.left, sourceExpr, this.converter));
        }
        else {
            this.converter.throwError("Assertion", node);
        }
        return statements;
    }
    convertBinaryAssignExpression(node) {
        const left = this.converter.convertExpressionAsExpression(node.left);
        const right = this.converter.convertExpressionAsExpression(node.right);
        // 代入演算子
        switch (node.operatorToken.kind) {
            case ts.SyntaxKind.EqualsToken:
                return [{ type: "assign", dest: left, expr: right, loc: dummyLoc }];
            case ts.SyntaxKind.PlusEqualsToken:
                return [{ type: "addAssign", dest: left, expr: right, loc: dummyLoc }];
            case ts.SyntaxKind.MinusEqualsToken:
                return [{ type: "subAssign", dest: left, expr: right, loc: dummyLoc }];
            case ts.SyntaxKind.ExclamationEqualsToken:
                return [
                    {
                        type: "assign",
                        dest: left,
                        expr: { type: "add", left: left, right, loc: dummyLoc },
                        loc: dummyLoc,
                    },
                ];
            case ts.SyntaxKind.AsteriskEqualsToken:
                return [
                    {
                        type: "assign",
                        dest: left,
                        expr: { type: "mul", left: left, right, loc: dummyLoc },
                        loc: dummyLoc,
                    },
                ];
            case ts.SyntaxKind.SlashEqualsToken:
                return [
                    {
                        type: "assign",
                        dest: left,
                        expr: { type: "div", left: left, right, loc: dummyLoc },
                        loc: dummyLoc,
                    },
                ];
            case ts.SyntaxKind.PercentEqualsToken:
                return [
                    {
                        type: "assign",
                        dest: left,
                        expr: { type: "rem", left: left, right, loc: dummyLoc },
                        loc: dummyLoc,
                    },
                ];
            case ts.SyntaxKind.AsteriskAsteriskEqualsToken:
                return [
                    {
                        type: "assign",
                        dest: left,
                        expr: { type: "pow", left: left, right, loc: dummyLoc },
                        loc: dummyLoc,
                    },
                ];
            case ts.SyntaxKind.AmpersandAmpersandEqualsToken:
                return [
                    {
                        type: "assign",
                        dest: left,
                        expr: { type: "and", left: left, right, loc: dummyLoc },
                        loc: dummyLoc,
                    },
                ];
            case ts.SyntaxKind.BarBarEqualsToken:
                return [
                    {
                        type: "assign",
                        dest: left,
                        expr: { type: "or", left: left, right, loc: dummyLoc },
                        loc: dummyLoc,
                    },
                ];
            default:
                this.converter.throwError(`サポートされていない二項演算子です: ${ts.SyntaxKind[node.operatorToken.kind]}`, node);
        }
    }
    convertBinaryExpression(node) {
        const left = this.converter.convertExpressionAsExpression(node.left);
        const right = this.converter.convertExpressionAsExpression(node.right);
        // 二項演算子
        switch (node.operatorToken.kind) {
            case ts.SyntaxKind.PlusToken:
                return { type: "add", left, right, loc: dummyLoc };
            case ts.SyntaxKind.MinusToken:
                return { type: "sub", left, right, loc: dummyLoc };
            case ts.SyntaxKind.AsteriskToken:
                return { type: "mul", left, right, loc: dummyLoc };
            case ts.SyntaxKind.SlashToken:
                return { type: "div", left, right, loc: dummyLoc };
            case ts.SyntaxKind.PercentToken:
                return { type: "rem", left, right, loc: dummyLoc };
            case ts.SyntaxKind.AsteriskAsteriskToken:
                return { type: "pow", left, right, loc: dummyLoc };
            case ts.SyntaxKind.EqualsEqualsToken:
            case ts.SyntaxKind.EqualsEqualsEqualsToken:
                return { type: "eq", left, right, loc: dummyLoc };
            case ts.SyntaxKind.ExclamationEqualsToken:
            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
                return { type: "neq", left, right, loc: dummyLoc };
            case ts.SyntaxKind.LessThanToken:
                return { type: "lt", left, right, loc: dummyLoc };
            case ts.SyntaxKind.LessThanEqualsToken:
                return { type: "lteq", left, right, loc: dummyLoc };
            case ts.SyntaxKind.GreaterThanToken:
                return { type: "gt", left, right, loc: dummyLoc };
            case ts.SyntaxKind.GreaterThanEqualsToken:
                return { type: "gteq", left, right, loc: dummyLoc };
            case ts.SyntaxKind.AmpersandAmpersandToken:
                return { type: "and", left, right, loc: dummyLoc };
            case ts.SyntaxKind.BarBarToken:
                return { type: "or", left, right, loc: dummyLoc };
            default:
                this.converter.throwError(`サポートされていない二項演算子です: ${ts.SyntaxKind[node.operatorToken.kind]}`, node);
        }
    }
}
//# sourceMappingURL=binaryExpression.js.map