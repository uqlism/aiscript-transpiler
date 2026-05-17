import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { coerceToBool, validateNumberLike, } from "../../utils/typeValidation.js";
export class UnaryExpressionPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression = (node) => {
        switch (true) {
            case ts.isPrefixUnaryExpression(node):
                return this.convertPrefixUnaryExpressionAsExpression(node);
            case ts.isPostfixUnaryExpression(node):
                return this.convertPostfixUnaryExpressionAsExpression(node);
        }
    };
    tryConvertExpressionAsStatements = (node) => {
        switch (true) {
            case ts.isPrefixUnaryExpression(node):
                return [this.convertPrefixUnaryExpressionAsStatement(node)];
            case ts.isPostfixUnaryExpression(node):
                return [this.convertPostfixUnaryExpressionAsStatement(node)];
        }
        return;
    };
    convertPrefixUnaryExpressionAsExpression(node) {
        // 型チェック
        this.validateUnaryOperationTypes(node);
        const expr = this.converter.convertExpressionAsExpression(node.operand);
        switch (node.operator) {
            case ts.SyntaxKind.PlusToken:
                if (expr.type === "num")
                    return { type: "num", value: expr.value, loc: dummyLoc };
                return { type: "plus", expr, loc: dummyLoc };
            case ts.SyntaxKind.MinusToken:
                if (expr.type === "num")
                    return { type: "num", value: -expr.value, loc: dummyLoc };
                return { type: "minus", expr, loc: dummyLoc };
            case ts.SyntaxKind.ExclamationToken: {
                const boolExpr = coerceToBool(node.operand, expr, this.converter);
                if (boolExpr.type === "bool")
                    return { type: "bool", value: !boolExpr.value, loc: dummyLoc };
                return { type: "not", expr: boolExpr, loc: dummyLoc };
            }
            case ts.SyntaxKind.PlusPlusToken:
                return {
                    type: "block",
                    statements: [
                        {
                            type: "addAssign",
                            dest: expr,
                            expr: { type: "num", value: 1, loc: dummyLoc },
                            loc: dummyLoc,
                        },
                        expr,
                    ],
                    loc: dummyLoc,
                };
            case ts.SyntaxKind.MinusMinusToken:
                return {
                    type: "block",
                    statements: [
                        {
                            type: "subAssign",
                            dest: expr,
                            expr: { type: "num", value: 1, loc: dummyLoc },
                            loc: dummyLoc,
                        },
                        expr,
                    ],
                    loc: dummyLoc,
                };
            default:
                this.converter.throwError(`サポートされていない単項演算子です: ${ts.SyntaxKind[node.operator]}`, node);
        }
    }
    convertPrefixUnaryExpressionAsStatement(node) {
        // 型チェック
        this.validateUnaryOperationTypes(node);
        const expr = this.converter.convertExpressionAsExpression(node.operand);
        switch (node.operator) {
            case ts.SyntaxKind.PlusToken:
            case ts.SyntaxKind.MinusToken:
            case ts.SyntaxKind.ExclamationToken:
                return this.convertPrefixUnaryExpressionAsExpression(node);
            case ts.SyntaxKind.PlusPlusToken:
                return {
                    type: "addAssign",
                    dest: expr,
                    expr: { type: "num", value: 1, loc: dummyLoc },
                    loc: dummyLoc,
                };
            case ts.SyntaxKind.MinusMinusToken:
                return {
                    type: "subAssign",
                    dest: expr,
                    expr: { type: "num", value: 1, loc: dummyLoc },
                    loc: dummyLoc,
                };
            default:
                return this.convertPrefixUnaryExpressionAsExpression(node);
        }
    }
    convertPostfixUnaryExpressionAsExpression(node) {
        const expr = this.converter.convertExpressionAsExpression(node.operand);
        const temp = this.converter.getUniqueIdentifier();
        // 型チェック - 後置演算子も数値型をチェック
        this.validatePostfixUnaryOperationTypes(node);
        switch (node.operator) {
            case ts.SyntaxKind.PlusPlusToken:
                // i++ → i += 1
                return {
                    type: "block",
                    statements: [
                        {
                            type: "def",
                            dest: temp,
                            expr,
                            mut: false,
                            attr: [],
                            loc: dummyLoc,
                        },
                        {
                            type: "addAssign",
                            dest: expr,
                            expr: { type: "num", value: 1, loc: dummyLoc },
                            loc: dummyLoc,
                        },
                        temp,
                    ],
                    loc: dummyLoc,
                };
            case ts.SyntaxKind.MinusMinusToken:
                // i-- → i -= 1
                return {
                    type: "block",
                    statements: [
                        {
                            type: "def",
                            dest: temp,
                            expr,
                            mut: false,
                            attr: [],
                            loc: dummyLoc,
                        },
                        {
                            type: "subAssign",
                            dest: expr,
                            expr: { type: "num", value: 1, loc: dummyLoc },
                            loc: dummyLoc,
                        },
                        temp,
                    ],
                    loc: dummyLoc,
                };
            default:
                this.converter.throwError(`サポートされていない後置単項演算子です: ${ts.SyntaxKind[node.operator]}`, node);
        }
    }
    convertPostfixUnaryExpressionAsStatement(node) {
        // 型チェック - 後置演算子も数値型をチェック
        this.validatePostfixUnaryOperationTypes(node);
        const expr = this.converter.convertExpressionAsExpression(node.operand);
        switch (node.operator) {
            case ts.SyntaxKind.PlusPlusToken:
                // i++ → i += 1
                return {
                    type: "addAssign",
                    dest: expr,
                    expr: { type: "num", value: 1, loc: dummyLoc },
                    loc: dummyLoc,
                };
            case ts.SyntaxKind.MinusMinusToken:
                // i-- → i -= 1
                return {
                    type: "subAssign",
                    dest: expr,
                    expr: { type: "num", value: 1, loc: dummyLoc },
                    loc: dummyLoc,
                };
            default:
                this.converter.throwError(`サポートされていない後置単項演算子です: ${ts.SyntaxKind[node.operator]}`, node);
        }
    }
    validateUnaryOperationTypes(node) {
        switch (node.operator) {
            case ts.SyntaxKind.PlusToken:
            case ts.SyntaxKind.MinusToken:
                // +, - 演算子はNumber型が必要
                validateNumberLike(node.operand, this.converter, `単項算術演算子 '${ts.tokenToString(node.operator)}' のオペランドはNumber型である必要があります`);
                break;
            case ts.SyntaxKind.ExclamationToken:
                // ! 演算子は coerceToBool で変換時に処理するためここでは検証しない
                break;
            case ts.SyntaxKind.PlusPlusToken:
            case ts.SyntaxKind.MinusMinusToken:
                // ++, -- 演算子はNumber型が必要
                validateNumberLike(node.operand, this.converter, `単項増減演算子 '${ts.tokenToString(node.operator)}' のオペランドはNumber型である必要があります`);
                break;
        }
    }
    validatePostfixUnaryOperationTypes(node) {
        switch (node.operator) {
            case ts.SyntaxKind.PlusPlusToken:
            case ts.SyntaxKind.MinusMinusToken:
                // ++, -- 演算子はNumber型が必要
                validateNumberLike(node.operand, this.converter, `後置増減演算子 '${ts.tokenToString(node.operator)}' のオペランドはNumber型である必要があります`);
                break;
        }
    }
}
//# sourceMappingURL=unaryExpression.js.map