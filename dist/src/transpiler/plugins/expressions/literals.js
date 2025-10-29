import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertBindingNameArg } from "../../utils/destructuring.js";
export class LiteralPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression = (node) => {
        switch (true) {
            case node.kind === ts.SyntaxKind.NullKeyword:
                this.converter.throwError("nullは使用できません代わりにundefinedを使用してください", node);
                return; // unreachable, but satisfies linter
            case node.kind === ts.SyntaxKind.TrueKeyword:
                return { type: "bool", value: true, loc: dummyLoc };
            case node.kind === ts.SyntaxKind.FalseKeyword:
                return { type: "bool", value: false, loc: dummyLoc };
            case ts.isStringLiteral(node):
                return { type: "str", value: node.text, loc: dummyLoc };
            case ts.isNumericLiteral(node):
                return this.convertNumericLiteral(node);
            case node.kind === ts.SyntaxKind.UndefinedKeyword:
                return { type: "null", loc: dummyLoc };
            case ts.isTemplateExpression(node):
                return this.convertTemplateExpression(node);
            case ts.isNoSubstitutionTemplateLiteral(node):
                return this.convertNoSubstitutionTemplateLiteral(node);
            case ts.isArrayLiteralExpression(node):
                return this.convertArrayLiteralExpression(node);
            case ts.isObjectLiteralExpression(node):
                return this.convertObjectLiteralExpression(node);
        }
    };
    convertNumericLiteral(node) {
        let value;
        if (node.text.startsWith("0x") || node.text.startsWith("0X")) {
            // 16進数
            value = parseInt(node.text, 16);
        }
        else if (node.text.startsWith("0b") || node.text.startsWith("0B")) {
            // 2進数
            value = parseInt(node.text.slice(2), 2);
        }
        else if (node.text.includes("e") || node.text.includes("E")) {
            // 指数表記
            value = parseFloat(node.text);
        }
        else {
            value = Number(node.text);
        }
        return { type: "num", value, loc: dummyLoc };
    }
    convertTemplateExpression(node) {
        const elements = [];
        // 最初のテンプレート部分を追加
        if (node.head.text) {
            elements.push({ type: "str", value: node.head.text, loc: dummyLoc });
        }
        // 各テンプレート部分と式を交互に処理
        node.templateSpans.forEach((span) => {
            // 式部分を追加
            const expr = this.converter.convertExpressionAsExpression(span.expression);
            elements.push(expr);
            // テンプレート部分を追加
            if (span.literal.text) {
                elements.push({ type: "str", value: span.literal.text, loc: dummyLoc });
            }
        });
        return { type: "tmpl", tmpl: elements, loc: dummyLoc };
    }
    convertNoSubstitutionTemplateLiteral(node) {
        return {
            type: "tmpl",
            tmpl: [{ type: "str", value: node.text, loc: dummyLoc }],
            loc: dummyLoc,
        };
    }
    convertArrayLiteralExpression(node) {
        const value = node.elements.map((element) => {
            return this.converter.convertExpressionAsExpression(element);
        });
        return {
            type: "arr",
            value,
            loc: dummyLoc,
        };
    }
    convertObjectLiteralExpression(node) {
        const value = new Map();
        node.properties.forEach((prop) => {
            if (ts.isPropertyAssignment(prop)) {
                const key = prop.name?.getText() || "";
                const val = this.converter.convertExpressionAsExpression(prop.initializer);
                value.set(key, val);
            }
            else if (ts.isShorthandPropertyAssignment(prop)) {
                // ショートハンドプロパティ: { foo } → { foo: foo }
                const key = prop.name.getText();
                const val = {
                    type: "identifier",
                    name: key,
                    loc: dummyLoc,
                };
                value.set(key, val);
            }
            else if (ts.isMethodDeclaration(prop)) {
                // メソッド定義: { foo(x, y) { return x + y } }
                // → { foo: @(x, y) { return x + y } }
                const key = prop.name?.getText() || "";
                // メソッドを関数式に直接変換
                const methodFunction = this.convertMethodToInlineFunction(prop);
                value.set(key, methodFunction);
            }
            else {
                this.converter.throwError(`サポートされていないオブジェクトプロパティです: ${ts.SyntaxKind[prop.kind]}`, prop);
            }
        });
        return {
            type: "obj",
            value,
            loc: dummyLoc,
        };
    }
    convertMethodToInlineFunction(node) {
        const params = [];
        const destructuringStatements = [];
        let _paramIndex = 0;
        for (const param of node.parameters) {
            const isOptional = !!param.questionToken;
            const defaultValue = param.initializer
                ? this.converter.convertExpressionAsExpression(param.initializer)
                : undefined;
            const [paramIdentifier, paramDestructuring] = convertBindingNameArg(param.name, false, this.converter);
            params.push({
                dest: paramIdentifier,
                optional: isOptional,
                default: defaultValue,
            });
            destructuringStatements.push(...paramDestructuring);
            _paramIndex++;
        }
        // メソッド本体の変換
        let children;
        if (node.body && ts.isBlock(node.body)) {
            children = [...destructuringStatements];
            for (const statement of node.body.statements) {
                children.push(...this.converter.convertStatementAsStatements(statement));
            }
        }
        else {
            this.converter.throwError("メソッドにはブロック文が必要です", node);
        }
        return {
            type: "fn",
            typeParams: [],
            params,
            children,
            loc: dummyLoc,
        };
    }
}
//# sourceMappingURL=literals.js.map