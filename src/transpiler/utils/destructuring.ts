import ts from "typescript"
import type { Ast } from "@syuilo/aiscript"
import type { TranspilerContext } from "../base.js"
import { dummyLoc } from "../consts.js"


/**
 * 分割代入を展開してAiScript のdef|assign文の配列に変換する
 */
export function convertObjectAssignment(
    node: ts.ObjectLiteralExpression,
    sourceExpr: Ast.Expression,
    helper: TranspilerContext
): Ast.Assign[] {
    const stmts: Ast.Assign[] = []

    function pushStmt(targetName: string, expr: Ast.Expression) {
        stmts.push({
            type: "assign",
            expr,
            dest: { type: "identifier", name: targetName, loc: dummyLoc },
            loc: dummyLoc,
        })
    }

    node.properties.forEach(prop => {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const expr: Ast.Prop = { type: "prop", target: sourceExpr, name: prop.name.text, loc: dummyLoc }
            // {x: expr} 形式
            if (ts.isIdentifier(prop.initializer)) {
                const targetName = prop.name.text
                helper.validateVariableName(targetName, prop.name)
                pushStmt(targetName, expr)
            } else if (ts.isObjectLiteralExpression(prop.initializer)) {
                stmts.push(...convertObjectAssignment(prop.initializer, expr, helper))
            } else if (ts.isArrayLiteralExpression(prop.initializer)) {
                stmts.push(...convertArrayAssignment(prop.initializer, expr, helper))
            } else {
                helper.throwError("サポートされていない分割代入パターンです", prop.name)
            }
        } else if (ts.isShorthandPropertyAssignment(prop)) {
            // {x} 形式
            const targetName = prop.name.text
            helper.validateVariableName(targetName, prop.name)
            pushStmt(targetName, { type: "prop", target: sourceExpr, name: prop.name.text, loc: dummyLoc })
        } else {
            helper.throwError("サポートされていないオブジェクト分割代入パターンです", prop)
        }
    });
    return stmts
}
/**
 * 分割代入を展開してAiScript のdef|assign文の配列に変換する
 */
export function convertArrayAssignment(
    node: ts.ArrayLiteralExpression,
    sourceExpr: Ast.Expression,
    helper: TranspilerContext
): Ast.Assign[] {
    const stmts: Ast.Assign[] = []

    function pushStmt(targetName: string, expr: Ast.Expression) {
        stmts.push({
            type: "assign",
            expr,
            dest: { type: "identifier", name: targetName, loc: dummyLoc },
            loc: dummyLoc,
        })
    }

    node.elements.forEach((prop, index) => {
        const expr: Ast.Index = { type: "index", target: sourceExpr, index: { type: "num", value: index, loc: dummyLoc }, loc: dummyLoc }
        if (ts.isIdentifier(prop)) {
            // {x} 形式
            const targetName = prop.text
            helper.validateVariableName(targetName, prop)
            pushStmt(targetName, expr)
        } else if (ts.isObjectLiteralExpression(prop)) {
            stmts.push(...convertObjectAssignment(prop, expr, helper))
        } else if (ts.isArrayLiteralExpression(prop)) {
            stmts.push(...convertArrayAssignment(prop, expr, helper))
        } else {
            helper.throwError("サポートされていない分割代入パターンです", prop)
        }
    });
    return stmts
}

/**
 * 分割代入を展開してAiScript のdef|assign文の配列に変換する
 */
export function convertDestructuringAssignment(
    nameNode: ts.BindingPattern,
    sourceExpr: Ast.Expression,
    isMutable: boolean,
    helper: TranspilerContext
): Ast.Definition[] {
    const stmts: Ast.Definition[] = []

    function pushStmt(targetName: string, expr: Ast.Expression) {
        stmts.push({
            type: "def",
            expr,
            dest: { type: "identifier", name: targetName, loc: dummyLoc },
            mut: isMutable,
            attr: [],
            loc: dummyLoc,
        })
    }

    if (ts.isObjectBindingPattern(nameNode)) {
        // オブジェクト分割代入: { x, y } = obj; { x: a, y: b } = obj;
        nameNode.elements.forEach(element => {
            if (!ts.isBindingElement(element)) return

            if (element.propertyName && ts.isIdentifier(element.propertyName)) {
                // {x: a} 形式
                const sourceKey = element.propertyName.text
                if (ts.isIdentifier(element.name)) {
                    const targetName = element.name.text
                    // 変数名の検証
                    helper.validateVariableName(targetName, element.name)
                    pushStmt(targetName, { type: "prop", target: sourceExpr, name: sourceKey, loc: dummyLoc })
                } else if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
                    // ネストした分割代入: {x: {a, b}} または {x: [a, b]} 再帰的に分割代入を展開
                    stmts.push(...convertDestructuringAssignment(element.name, { type: "prop", target: sourceExpr, name: sourceKey, loc: dummyLoc }, isMutable, helper))
                } else {
                    helper.throwError("サポートされていない分割代入パターンです", element.name)
                }
            } else if (ts.isIdentifier(element.name)) {
                // {x} 形式
                const sourceKey = element.name.text
                const targetName = element.name.text
                // 変数名の検証
                helper.validateVariableName(targetName, element.name)
                pushStmt(targetName, { type: "prop", target: sourceExpr, name: sourceKey, loc: dummyLoc })
            } else if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
                // ショートハンドでのネスト（実際にはこのケースは稀）
                helper.throwError("ショートハンドプロパティでのネストした分割代入はサポートされていません", element.name)
            } else {
                helper.throwError("サポートされていないオブジェクト分割代入パターンです", element.name)
            }
        })
    } else if (ts.isArrayBindingPattern(nameNode)) {
        // 配列分割代入: [a, b] = array;
        nameNode.elements.forEach((element, index) => {
            if (!ts.isBindingElement(element)) return

            if (ts.isIdentifier(element.name)) {
                const targetName = element.name.text
                // 変数名の検証
                if (helper.validateVariableName) {
                    helper.validateVariableName(targetName, element.name)
                }
                pushStmt(targetName, { type: "index", target: sourceExpr, index: { type: "num", value: index, loc: dummyLoc }, loc: dummyLoc })
            } else if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
                // ネストした分割代入: [a, [b, c]] または [a, {x, y}] 再帰的に分割代入を展開
                stmts.push(...convertDestructuringAssignment(element.name, { type: "index", target: sourceExpr, index: { type: "num", value: index, loc: dummyLoc }, loc: dummyLoc }, isMutable, helper))
            } else {
                helper.throwError("サポートされていない配列分割代入パターンです", element.name)
            }
        })
    } else {
        helper.throwError("サポートされていないバインディングパターンです", nameNode as ts.Node)
    }

    return stmts as any
}


/**
 * 関数の引数やfor-ofのitemなどのBindingNameを処理し、必要に応じて一時変数を介して展開する
 */
export function convertBindingNameArg(
    bindingName: ts.BindingName,
    isMutable: boolean,
    context: TranspilerContext
): [Ast.Identifier, Ast.Definition[]] {
    if (ts.isIdentifier(bindingName)) {
        // 単純な変数の場合
        const varName = bindingName.text;
        context.validateVariableName(varName, bindingName);
        return [{ type: "identifier", name: varName, loc: dummyLoc }, []]
    } else {
        // 分割代入の場合
        const definitions: Ast.Definition[] = [];
        const id = context.getUniqueIdentifier()

        // 分割代入の展開
        const destructuringDefs = convertDestructuringAssignment(bindingName, id, isMutable, context);
        definitions.push(...destructuringDefs);
        return [id, definitions];
    }
}