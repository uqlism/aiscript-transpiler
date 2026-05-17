import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertBindingPattern } from "../../utils/destructuring.js";
import { validateArrayExpression } from "../../utils/typeValidation.js";
export class ForOfStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        if (ts.isForOfStatement(node)) {
            return [this.convertForOfStatement(node)];
        }
    };
    convertForOfStatement(node) {
        // 配列型チェックを追加（util関数を直接使用）
        validateArrayExpression(node.expression, this.converter);
        const iterable = this.converter.convertExpressionAsExpression(node.expression);
        const bodyStatements = this.converter.convertStatementAsStatements(node.statement);
        if (!ts.isVariableDeclarationList(node.initializer)) {
            this.converter.throwError("for-of文では変数宣言が必要です", node.initializer);
        }
        const declaration = node.initializer.declarations[0];
        if (declaration === undefined) {
            this.converter.throwError("for-of文では変数宣言が必要です", node);
        }
        const _isMutable = Boolean(node.initializer.flags & ts.NodeFlags.Let);
        // TODO: ワンチャンconst必須かもなので調査
        // 分割代入もネイティブサポート
        const varPattern = convertBindingPattern(declaration.name);
        // body文を展開（blockの場合はその中身を取り出す）
        const flattenedBodyStatements = [];
        for (const stmt of bodyStatements) {
            if (stmt.type === "block") {
                flattenedBodyStatements.push(...stmt.statements);
            }
            else {
                flattenedBodyStatements.push(stmt);
            }
        }
        const forBody = flattenedBodyStatements.length === 1 && flattenedBodyStatements[0]
            ? flattenedBodyStatements[0]
            : { type: "block", statements: flattenedBodyStatements, loc: dummyLoc };
        return {
            type: "each",
            var: varPattern,
            items: iterable,
            for: forBody,
            loc: dummyLoc,
        };
    }
}
//# sourceMappingURL=forOfStatement.js.map