import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { validateElementAccess } from "../../utils/typeValidation.js";
export class PropertyAccessPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression = (node) => {
        switch (true) {
            case ts.isPropertyAccessExpression(node):
                return this.convertPropertyAccessExpression(node);
            case ts.isElementAccessExpression(node):
                return this.convertElementAccessExpression(node);
        }
    };
    convertPropertyAccessExpression(node) {
        const target = this.converter.convertExpressionAsExpression(node.expression);
        const propertyName = node.name.text;
        // AiScriptの名前空間アクセス（Core.v → Core:v）の特別処理
        if (target.type === "identifier") {
            const namespaces = [
                "Core",
                "Math",
                "Util",
                "Json",
                "Date",
                "Uri",
                "Str",
                "Num",
                "Arr",
                "Obj",
                "Async",
                "Mk",
                "Ui",
                "Ui:C",
            ];
            if (namespaces.includes(target.name)) {
                return {
                    type: "identifier",
                    name: `${target.name}:${propertyName}`,
                    loc: dummyLoc,
                };
            }
        }
        // 通常のプロパティアクセス
        return {
            type: "prop",
            target,
            name: propertyName,
            loc: dummyLoc,
        };
    }
    convertElementAccessExpression(node) {
        if (!node.argumentExpression) {
            this.converter.throwError("配列アクセスにはインデックスが必要です", node);
        }
        validateElementAccess(node.expression, node.argumentExpression, this.converter.typeChecker);
        const target = this.converter.convertExpressionAsExpression(node.expression);
        const index = this.converter.convertExpressionAsExpression(node.argumentExpression);
        return {
            type: "index",
            target,
            index,
            loc: dummyLoc,
        };
    }
}
//# sourceMappingURL=property-access.js.map