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
        const hasSpread = node.elements.some(ts.isSpreadElement);
        if (!hasSpread) {
            return {
                type: "arr",
                value: node.elements.map((el) => this.converter.convertExpressionAsExpression(el)),
                loc: dummyLoc,
            };
        }
        return this.buildArrWithSpread(node.elements);
    }
    buildArrWithSpread(elements) {
        // スプレッドで区切りながらセグメントリストを作る
        const segments = [];
        let current = [];
        const flushCurrent = () => {
            if (current.length > 0) {
                segments.push({ type: "arr", value: current, loc: dummyLoc });
                current = [];
            }
        };
        for (const el of elements) {
            if (ts.isSpreadElement(el)) {
                flushCurrent();
                segments.push(this.converter.convertExpressionAsExpression(el.expression));
            }
            else {
                current.push(this.converter.convertExpressionAsExpression(el));
            }
        }
        flushCurrent();
        // segments を arr.concat() で左畳み込み
        let merged;
        for (const seg of segments) {
            merged =
                merged === undefined
                    ? seg
                    : {
                        type: "call",
                        target: {
                            type: "prop",
                            target: merged,
                            name: "concat",
                            loc: dummyLoc,
                        },
                        args: [seg],
                        loc: dummyLoc,
                    };
        }
        if (merged === undefined)
            throw new Error("internal: no segments in spread array");
        return merged;
    }
    convertObjectLiteralExpression(node) {
        const hasSpread = node.properties.some(ts.isSpreadAssignment);
        const hasComputed = node.properties.some((p) => ts.isPropertyAssignment(p) && ts.isComputedPropertyName(p.name));
        if (!hasSpread && !hasComputed)
            return this.buildPlainObj(node.properties);
        // 算出キーがある場合はスプレッドの有無によらず統合ブロック方式を使う
        if (hasComputed)
            return this.buildDynamicObj(node.properties);
        return this.buildObjWithSpread(node.properties);
    }
    /**
     * スプレッドや算出キーを含むオブジェクトを eval ブロックで生成する。
     * 左から順に処理し:
     *   - 静的キー → 蓄積して Obj:merge でまとめてフラッシュ
     *   - 算出キー → tmp[expr] = val でフラッシュ後インデックス代入
     *   - スプレッド → Obj:merge(tmp, spread) でフラッシュ後マージ
     */
    buildDynamicObj(props) {
        const tmp = this.converter.getUniqueIdentifier();
        const statements = [
            { type: "def", dest: tmp, expr: { type: "obj", value: new Map(), loc: dummyLoc }, mut: true, attr: [], loc: dummyLoc },
        ];
        let staticAccum = new Map();
        const flushStatic = () => {
            if (staticAccum.size === 0)
                return;
            statements.push({
                type: "assign",
                dest: tmp,
                expr: { type: "call", target: { type: "identifier", name: "Obj:merge", loc: dummyLoc }, args: [tmp, { type: "obj", value: staticAccum, loc: dummyLoc }], loc: dummyLoc },
                loc: dummyLoc,
            });
            staticAccum = new Map();
        };
        for (const prop of props) {
            if (ts.isSpreadAssignment(prop)) {
                flushStatic();
                const spread = this.converter.convertExpressionAsExpression(prop.expression);
                statements.push({ type: "assign", dest: tmp, expr: { type: "call", target: { type: "identifier", name: "Obj:merge", loc: dummyLoc }, args: [tmp, spread], loc: dummyLoc }, loc: dummyLoc });
            }
            else if (ts.isPropertyAssignment(prop) && ts.isComputedPropertyName(prop.name)) {
                flushStatic();
                statements.push({ type: "assign", dest: { type: "index", target: tmp, index: this.converter.convertExpressionAsExpression(prop.name.expression), loc: dummyLoc }, expr: this.converter.convertExpressionAsExpression(prop.initializer), loc: dummyLoc });
            }
            else if (ts.isPropertyAssignment(prop)) {
                staticAccum.set(prop.name.getText() || "", this.converter.convertExpressionAsExpression(prop.initializer));
            }
            else if (ts.isShorthandPropertyAssignment(prop)) {
                const key = prop.name.getText();
                staticAccum.set(key, { type: "identifier", name: key, loc: dummyLoc });
            }
            else if (ts.isMethodDeclaration(prop)) {
                staticAccum.set(prop.name.text || "", this.convertMethodToInlineFunction(prop));
            }
            else {
                this.converter.throwError(`サポートされていないオブジェクトプロパティです: ${ts.SyntaxKind[prop.kind]}`, prop);
            }
        }
        flushStatic();
        statements.push(tmp);
        return { type: "block", statements, loc: dummyLoc };
    }
    buildPlainObj(props) {
        const value = new Map();
        for (const prop of props) {
            if (ts.isPropertyAssignment(prop)) {
                const key = prop.name?.getText() || "";
                const val = this.converter.convertExpressionAsExpression(prop.initializer);
                value.set(key, val);
            }
            else if (ts.isShorthandPropertyAssignment(prop)) {
                const key = prop.name.getText();
                value.set(key, { type: "identifier", name: key, loc: dummyLoc });
            }
            else if (ts.isMethodDeclaration(prop)) {
                const key = prop.name?.getText() || "";
                value.set(key, this.convertMethodToInlineFunction(prop));
            }
            else {
                this.converter.throwError(`サポートされていないオブジェクトプロパティです: ${ts.SyntaxKind[prop.kind]}`, prop);
            }
        }
        return { type: "obj", value, loc: dummyLoc };
    }
    buildObjWithSpread(props) {
        // スプレッドで区切りながらセグメントのリストを作る
        const segments = [];
        let current = new Map();
        const flushCurrent = () => {
            if (current.size > 0) {
                segments.push({ type: "obj", value: current, loc: dummyLoc });
                current = new Map();
            }
        };
        for (const prop of props) {
            if (ts.isSpreadAssignment(prop)) {
                flushCurrent();
                segments.push(this.converter.convertExpressionAsExpression(prop.expression));
            }
            else if (ts.isPropertyAssignment(prop)) {
                const key = prop.name?.getText() || "";
                current.set(key, this.converter.convertExpressionAsExpression(prop.initializer));
            }
            else if (ts.isShorthandPropertyAssignment(prop)) {
                const key = prop.name.getText();
                current.set(key, { type: "identifier", name: key, loc: dummyLoc });
            }
            else if (ts.isMethodDeclaration(prop)) {
                const key = prop.name?.getText() || "";
                current.set(key, this.convertMethodToInlineFunction(prop));
            }
            else {
                this.converter.throwError(`サポートされていないオブジェクトプロパティです: ${ts.SyntaxKind[prop.kind]}`, prop);
            }
        }
        flushCurrent();
        // segments を Obj:merge でたたみ込む（左畳み込み）
        let merged;
        for (const seg of segments) {
            merged =
                merged === undefined
                    ? seg
                    : {
                        type: "call",
                        target: { type: "identifier", name: "Obj:merge", loc: dummyLoc },
                        args: [merged, seg],
                        loc: dummyLoc,
                    };
        }
        // スプレッドがある場合は必ず1つ以上のセグメントが存在する（到達不能）
        if (merged === undefined)
            throw new Error("internal: no segments in spread object");
        return merged;
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