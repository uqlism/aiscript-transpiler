import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertBindingPattern, convertDestructuringAssignment } from "../../utils/destructuring.js";
// デフォルト値・rest 要素があるパターンは AiScript ネイティブ展開では扱えない
function needsExpansion(pattern) {
    for (const element of pattern.elements) {
        if (!ts.isBindingElement(element))
            continue;
        if (element.dotDotDotToken || element.initializer)
            return true;
        if ((ts.isArrayBindingPattern(element.name) || ts.isObjectBindingPattern(element.name)) &&
            needsExpansion(element.name))
            return true;
    }
    return false;
}
export class VariableStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        if (ts.isVariableStatement(node)) {
            return this.convertVariableStatements(node);
        }
    };
    convertVariableStatements(node) {
        if (this.hasDeclareModifier(node)) {
            return [];
        }
        const definitions = [];
        // export修飾子があるかチェック
        const hasExportModifier = this.hasExportModifier(node);
        for (const declaration of node.declarationList.declarations) {
            if (!declaration.initializer) {
                this.converter.throwError("変数宣言には初期値が必要です", declaration);
            }
            const isMutable = Boolean(node.declarationList.flags & ts.NodeFlags.Let);
            const nameNode = declaration.name;
            const expr = this.converter.convertExpressionAsExpression(declaration.initializer);
            if (ts.isIdentifier(nameNode)) {
                // 単純な変数宣言: let x = value
                this.converter.validateVariableName(nameNode.text, nameNode);
                // export修飾子があれば、exportリストに追加
                if (hasExportModifier) {
                    this.converter.addExport(nameNode.text);
                }
                definitions.push({
                    type: "def",
                    dest: { type: "identifier", name: nameNode.text, loc: dummyLoc },
                    expr,
                    mut: isMutable,
                    attr: [],
                    loc: dummyLoc,
                });
            }
            else if (needsExpansion(nameNode)) {
                // デフォルト値・rest 要素を含む分割代入 → 展開形式
                const tmp = this.converter.getUniqueIdentifier();
                definitions.push({ type: "def", dest: tmp, expr, mut: false, attr: [], loc: dummyLoc });
                definitions.push(...convertDestructuringAssignment(nameNode, tmp, isMutable, this.converter));
            }
            else {
                // 単純な分割代入: AiScript ネイティブ分割代入を利用
                definitions.push({
                    type: "def",
                    dest: convertBindingPattern(nameNode),
                    expr,
                    mut: isMutable,
                    attr: [],
                    loc: dummyLoc,
                });
            }
        }
        return definitions;
    }
    hasExportModifier(node) {
        return (ts.canHaveModifiers(node) &&
            (ts
                .getModifiers(node)
                ?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ??
                false));
    }
    hasDeclareModifier(node) {
        return (ts.canHaveModifiers(node) &&
            (ts
                .getModifiers(node)
                ?.some((mod) => mod.kind === ts.SyntaxKind.DeclareKeyword) ??
                false));
    }
}
//# sourceMappingURL=variableStatement.js.map