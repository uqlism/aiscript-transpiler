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
    if (ts.isObjectBindingPattern(nameNode)) {
        // オブジェクト分割代入: { x, y } = obj; { x: a, y: b } = obj;
        nameNode.elements.forEach((element) => {
            if (!ts.isBindingElement(element))
                return;
            if (element.propertyName && ts.isIdentifier(element.propertyName)) {
                // {x: a} 形式
                const sourceKey = element.propertyName.text;
                if (ts.isIdentifier(element.name)) {
                    const targetName = element.name.text;
                    // 変数名の検証
                    helper.validateVariableName(targetName, element.name);
                    pushStmt(targetName, {
                        type: "prop",
                        target: sourceExpr,
                        name: sourceKey,
                        loc: dummyLoc,
                    });
                }
                else if (ts.isObjectBindingPattern(element.name) ||
                    ts.isArrayBindingPattern(element.name)) {
                    // ネストした分割代入: {x: {a, b}} または {x: [a, b]} 再帰的に分割代入を展開
                    stmts.push(...convertDestructuringAssignment(element.name, {
                        type: "prop",
                        target: sourceExpr,
                        name: sourceKey,
                        loc: dummyLoc,
                    }, isMutable, helper));
                }
                else {
                    helper.throwError("サポートされていない分割代入パターンです", element.name);
                }
            }
            else if (ts.isIdentifier(element.name)) {
                // {x} 形式
                const sourceKey = element.name.text;
                const targetName = element.name.text;
                // 変数名の検証
                helper.validateVariableName(targetName, element.name);
                pushStmt(targetName, {
                    type: "prop",
                    target: sourceExpr,
                    name: sourceKey,
                    loc: dummyLoc,
                });
            }
            else if (ts.isObjectBindingPattern(element.name) ||
                ts.isArrayBindingPattern(element.name)) {
                // ショートハンドでのネスト（実際にはこのケースは稀）
                helper.throwError("ショートハンドプロパティでのネストした分割代入はサポートされていません", element.name);
            }
            else {
                helper.throwError("サポートされていないオブジェクト分割代入パターンです", element.name);
            }
        });
    }
    else if (ts.isArrayBindingPattern(nameNode)) {
        // 配列分割代入: [a, b] = array;
        nameNode.elements.forEach((element, index) => {
            if (!ts.isBindingElement(element))
                return;
            if (ts.isIdentifier(element.name)) {
                const targetName = element.name.text;
                // 変数名の検証
                if (helper.validateVariableName) {
                    helper.validateVariableName(targetName, element.name);
                }
                pushStmt(targetName, {
                    type: "index",
                    target: sourceExpr,
                    index: { type: "num", value: index, loc: dummyLoc },
                    loc: dummyLoc,
                });
            }
            else if (ts.isObjectBindingPattern(element.name) ||
                ts.isArrayBindingPattern(element.name)) {
                // ネストした分割代入: [a, [b, c]] または [a, {x, y}] 再帰的に分割代入を展開
                stmts.push(...convertDestructuringAssignment(element.name, {
                    type: "index",
                    target: sourceExpr,
                    index: { type: "num", value: index, loc: dummyLoc },
                    loc: dummyLoc,
                }, isMutable, helper));
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