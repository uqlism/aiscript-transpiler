import ts from "typescript";
import { dummyLoc } from "../consts.js";
/**
 * 分割代入を展開してAiScript のdef|assign文の配列に変換する
 */
export function convertDestructuringAssignment(nameNode, sourceExpr, isMutable, helper) {
    const stmts = [];
    function pushStmt(targetName, expr) {
        stmts.push({
            type: "def",
            expr,
            dest: { type: "identifier", name: targetName, loc: dummyLoc },
            mut: isMutable,
            attr: [],
            loc: dummyLoc,
        });
    }
    // デフォルト値付きのアクセスをラップするヘルパー
    // elem.initializer があれば eval { let __tmp = src; if (__tmp != null) __tmp else default }
    function withDefault(src, defaultInit) {
        const tmp = helper.getUniqueIdentifier();
        const defaultVal = helper.convertExpressionAsExpression(defaultInit);
        return {
            type: "block",
            statements: [
                { type: "def", dest: tmp, expr: src, mut: false, attr: [], loc: dummyLoc },
                {
                    type: "if",
                    cond: { type: "neq", left: tmp, right: { type: "null", loc: dummyLoc }, loc: dummyLoc },
                    then: tmp,
                    elseif: [],
                    else: defaultVal,
                    loc: dummyLoc,
                },
            ],
            loc: dummyLoc,
        };
    }
    if (ts.isObjectBindingPattern(nameNode)) {
        // オブジェクト分割代入: { x, y } = obj; { x: a, y: b } = obj;
        nameNode.elements.forEach((element) => {
            if (!ts.isBindingElement(element))
                return;
            if (element.propertyName && ts.isIdentifier(element.propertyName)) {
                // {x: a} 形式
                const sourceKey = element.propertyName.text;
                let propExpr = { type: "prop", target: sourceExpr, name: sourceKey, loc: dummyLoc };
                if (element.initializer)
                    propExpr = withDefault(propExpr, element.initializer);
                if (ts.isIdentifier(element.name)) {
                    const targetName = element.name.text;
                    helper.validateVariableName(targetName, element.name);
                    pushStmt(targetName, propExpr);
                }
                else if (ts.isObjectBindingPattern(element.name) ||
                    ts.isArrayBindingPattern(element.name)) {
                    // ネストした分割代入: {x: {a, b}} または {x: [a, b]}
                    stmts.push(...convertDestructuringAssignment(element.name, propExpr, isMutable, helper));
                }
                else {
                    helper.throwError("サポートされていない分割代入パターンです", element.name);
                }
            }
            else if (ts.isIdentifier(element.name)) {
                // {x} 形式
                const sourceKey = element.name.text;
                const targetName = element.name.text;
                helper.validateVariableName(targetName, element.name);
                let propExpr = { type: "prop", target: sourceExpr, name: sourceKey, loc: dummyLoc };
                if (element.initializer)
                    propExpr = withDefault(propExpr, element.initializer);
                pushStmt(targetName, propExpr);
            }
            else if (ts.isObjectBindingPattern(element.name) ||
                ts.isArrayBindingPattern(element.name)) {
                helper.throwError("ショートハンドプロパティでのネストした分割代入はサポートされていません", element.name);
            }
            else {
                helper.throwError("サポートされていないオブジェクト分割代入パターンです", element.name);
            }
        });
    }
    else if (ts.isArrayBindingPattern(nameNode)) {
        // 配列分割代入: [a, b] = array;
        let nonRestCount = 0;
        for (const element of nameNode.elements) {
            if (ts.isBindingElement(element) && element.dotDotDotToken)
                break;
            nonRestCount++;
        }
        nameNode.elements.forEach((element, index) => {
            if (!ts.isBindingElement(element))
                return;
            if (element.dotDotDotToken) {
                // rest 要素: [a, ...rest] → rest = arr.slice(index, arr.len)
                if (ts.isIdentifier(element.name)) {
                    const targetName = element.name.text;
                    helper.validateVariableName(targetName, element.name);
                    pushStmt(targetName, {
                        type: "call",
                        target: { type: "prop", target: sourceExpr, name: "slice", loc: dummyLoc },
                        args: [
                            { type: "num", value: index, loc: dummyLoc },
                            { type: "prop", target: sourceExpr, name: "len", loc: dummyLoc },
                        ],
                        loc: dummyLoc,
                    });
                }
                else {
                    helper.throwError("rest要素の分割代入パターンはサポートされていません", element.name);
                }
                return;
            }
            let elemExpr = {
                type: "index",
                target: sourceExpr,
                index: { type: "num", value: index, loc: dummyLoc },
                loc: dummyLoc,
            };
            if (element.initializer)
                elemExpr = withDefault(elemExpr, element.initializer);
            if (ts.isIdentifier(element.name)) {
                const targetName = element.name.text;
                helper.validateVariableName(targetName, element.name);
                pushStmt(targetName, elemExpr);
            }
            else if (ts.isObjectBindingPattern(element.name) ||
                ts.isArrayBindingPattern(element.name)) {
                stmts.push(...convertDestructuringAssignment(element.name, elemExpr, isMutable, helper));
            }
            else {
                helper.throwError("サポートされていない配列分割代入パターンです", element.name);
            }
        });
    }
    else {
        helper.throwError("サポートされていないバインディングパターンです", nameNode);
    }
    return stmts;
}
/**
 * BindingPatternをAiScript用の分割代入パターンに変換する
 */
export function convertBindingPattern(bindingName) {
    if (ts.isIdentifier(bindingName)) {
        return { type: "identifier", name: bindingName.text, loc: dummyLoc };
    }
    else if (ts.isArrayBindingPattern(bindingName)) {
        // [a, b] のような配列分割代入
        return {
            type: "arr",
            value: bindingName.elements.map((element) => {
                if (ts.isOmittedExpression(element)) {
                    // ホール要素（例: [a, , b]）はnullで表現
                    return { type: "null", loc: dummyLoc };
                }
                if (!ts.isBindingElement(element)) {
                    throw new Error("サポートされていない配列要素です");
                }
                return convertBindingPattern(element.name);
            }),
            loc: dummyLoc,
        };
    }
    else if (ts.isObjectBindingPattern(bindingName)) {
        // {x, y} や {x: a, y: b} のようなオブジェクト分割代入
        return {
            type: "obj",
            value: new Map(bindingName.elements.map((element) => {
                if (!ts.isBindingElement(element)) {
                    throw new Error("サポートされていないオブジェクト要素です");
                }
                if (element.propertyName && ts.isIdentifier(element.propertyName)) {
                    // {x: a} 形式
                    const sourceKey = element.propertyName.text;
                    const destPattern = convertBindingPattern(element.name);
                    return [sourceKey, destPattern];
                }
                else if (ts.isIdentifier(element.name)) {
                    // {x} 形式（ショートハンド）
                    const key = element.name.text;
                    const destPattern = convertBindingPattern(element.name);
                    return [key, destPattern];
                }
                else {
                    throw new Error("サポートされていないオブジェクト分割代入パターンです");
                }
            })),
            loc: dummyLoc,
        };
    }
    else {
        throw new Error("サポートされていないバインディングパターンです");
    }
}
/**
 * 代入文用の分割代入パターンに変換する（ObjectLiteralExpression/ArrayLiteralExpression用）
 */
export function convertDestructuringPattern(node) {
    if (ts.isArrayLiteralExpression(node)) {
        // [a, b] のような配列分割代入
        return {
            type: "arr",
            value: node.elements.map((element) => {
                if (ts.isSpreadElement(element)) {
                    throw new Error("スプレッド構文はサポートされていません");
                }
                if (ts.isOmittedExpression(element)) {
                    throw new Error("配列分割代入でのホール要素はサポートされていません");
                }
                if (ts.isIdentifier(element)) {
                    return { type: "identifier", name: element.text, loc: dummyLoc };
                }
                return convertDestructuringPattern(element);
            }),
            loc: dummyLoc,
        };
    }
    else if (ts.isObjectLiteralExpression(node)) {
        // {x, y} や {x: a, y: b} のようなオブジェクト分割代入
        return {
            type: "obj",
            value: new Map(node.properties.map((prop) => {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                    // {x: a} 形式
                    const sourceKey = prop.name.text;
                    if (ts.isIdentifier(prop.initializer)) {
                        const destPattern = {
                            type: "identifier",
                            name: prop.initializer.text,
                            loc: dummyLoc,
                        };
                        return [sourceKey, destPattern];
                    }
                    else {
                        const destPattern = convertDestructuringPattern(prop.initializer);
                        return [sourceKey, destPattern];
                    }
                }
                else if (ts.isShorthandPropertyAssignment(prop)) {
                    // {x} 形式（ショートハンド）
                    const key = prop.name.text;
                    const destPattern = {
                        type: "identifier",
                        name: prop.name.text,
                        loc: dummyLoc,
                    };
                    return [key, destPattern];
                }
                else {
                    throw new Error("サポートされていないオブジェクト分割代入パターンです");
                }
            })),
            loc: dummyLoc,
        };
    }
    else if (ts.isIdentifier(node)) {
        return { type: "identifier", name: node.text, loc: dummyLoc };
    }
    else {
        throw new Error("サポートされていない分割代入パターンです");
    }
}
/**
 * 関数の引数やfor-ofのitemなどのBindingNameを処理し、必要に応じて一時変数を介して展開する
 */
export function convertBindingNameArg(bindingName, isMutable, context) {
    if (ts.isIdentifier(bindingName)) {
        // 単純な変数の場合
        const varName = bindingName.text;
        context.validateVariableName(varName, bindingName);
        return [{ type: "identifier", name: varName, loc: dummyLoc }, []];
    }
    else {
        // 分割代入の場合
        const definitions = [];
        const id = context.getUniqueIdentifier();
        // 分割代入の展開
        const destructuringDefs = convertDestructuringAssignment(bindingName, id, isMutable, context);
        definitions.push(...destructuringDefs);
        return [id, definitions];
    }
}
/**
 * 関数/メソッド/コンストラクタのパラメータをAiScript用に変換する
 */
export function processParameters(parameters, context) {
    const params = [];
    for (const param of parameters) {
        params.push({
            dest: convertBindingPattern(param.name),
            optional: !!param.questionToken,
            default: param.initializer
                ? context.convertExpressionAsExpression(param.initializer)
                : undefined,
        });
    }
    return params;
}
//# sourceMappingURL=destructuring.js.map