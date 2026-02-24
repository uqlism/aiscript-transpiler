import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
import { dummyLoc } from "../consts.js";
import { processParameters } from "../utils/destructuring.js";
export class ClassDeclarationPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        if (ts.isClassDeclaration(node)) {
            return this.convertClassDeclaration(node);
        }
    };
    tryConvertExpressionAsExpression = (node) => {
        if (ts.isNewExpression(node)) {
            return this.convertNewExpression(node);
        }
    };
    convertClassDeclaration(node) {
        const className = node.name?.text;
        if (!className) {
            this.converter.throwError("クラス名がありません", node);
        }
        // getter/setterのチェック
        for (const member of node.members) {
            if (ts.isGetAccessorDeclaration(member)) {
                this.converter.throwError("getterはサポートされていません", member);
            }
            if (ts.isSetAccessorDeclaration(member)) {
                this.converter.throwError("setterはサポートされていません", member);
            }
        }
        // 親クラスを取得
        const baseClassName = this.getBaseClassName(node);
        // コンストラクタを探す
        const ctor = node.members.find(ts.isConstructorDeclaration);
        // 静的メソッドを収集
        const staticMethods = node.members.filter((member) => ts.isMethodDeclaration(member) &&
            member.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) === true);
        // インスタンスメソッドを収集
        const instanceMethods = node.members.filter((member) => ts.isMethodDeclaration(member) &&
            !member.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword));
        // __new メソッドを生成
        const newMethod = this.createNewMethod(ctor, instanceMethods, baseClassName);
        // オブジェクトのプロパティを構築
        const objValue = new Map();
        objValue.set("__new", newMethod);
        // 静的メソッドを追加
        for (const method of staticMethods) {
            const methodName = method.name.text;
            const methodFn = this.convertMethodToFunction(method);
            objValue.set(methodName, methodFn);
        }
        const classObj = {
            type: "obj",
            value: objValue,
            loc: dummyLoc,
        };
        return [
            {
                type: "def",
                dest: { type: "identifier", name: className, loc: dummyLoc },
                expr: classObj,
                mut: false,
                attr: [],
                loc: dummyLoc,
            },
        ];
    }
    getBaseClassName(node) {
        if (!node.heritageClauses)
            return undefined;
        for (const clause of node.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                const baseType = clause.types[0];
                if (baseType && ts.isIdentifier(baseType.expression)) {
                    return baseType.expression.text;
                }
            }
        }
        return undefined;
    }
    createNewMethod(ctor, instanceMethods, baseClassName) {
        // コンストラクタのパラメータを取得
        const params = ctor
            ? processParameters(ctor.parameters, this.converter)
            : [];
        // 関数本体を構築
        const children = [];
        // 継承がない場合は最初に let __this = {} を追加
        if (!baseClassName) {
            children.push({
                type: "def",
                dest: { type: "identifier", name: "__this", loc: dummyLoc },
                expr: { type: "obj", value: new Map(), loc: dummyLoc },
                mut: false,
                attr: [],
                loc: dummyLoc,
            });
        }
        // コンストラクタ本体を変換
        if (ctor?.body) {
            for (const statement of ctor.body.statements) {
                // super() 呼び出しは let __this = Base.__new(...) に変換
                const superArgs = this.getSuperCallArgs(statement);
                if (superArgs && baseClassName) {
                    children.push({
                        type: "def",
                        dest: { type: "identifier", name: "__this", loc: dummyLoc },
                        expr: {
                            type: "call",
                            target: {
                                type: "prop",
                                target: {
                                    type: "identifier",
                                    name: baseClassName,
                                    loc: dummyLoc,
                                },
                                name: "__new",
                                loc: dummyLoc,
                            },
                            args: superArgs.map((arg) => this.converter.convertExpressionAsExpression(arg)),
                            loc: dummyLoc,
                        },
                        mut: false,
                        attr: [],
                        loc: dummyLoc,
                    });
                    continue;
                }
                children.push(...this.converter.convertStatementAsStatements(statement));
            }
        }
        // インスタンスメソッドを __this に追加
        for (const method of instanceMethods) {
            const methodName = method.name.text;
            const methodFn = this.convertMethodToFunction(method);
            // __this.methodName = @() { ... }
            children.push({
                type: "assign",
                dest: {
                    type: "prop",
                    target: { type: "identifier", name: "__this", loc: dummyLoc },
                    name: methodName,
                    loc: dummyLoc,
                },
                expr: methodFn,
                loc: dummyLoc,
            });
        }
        // return __this;
        children.push({
            type: "return",
            expr: { type: "identifier", name: "__this", loc: dummyLoc },
            loc: dummyLoc,
        });
        return {
            type: "fn",
            typeParams: [],
            params,
            children,
            loc: dummyLoc,
        };
    }
    getSuperCallArgs(statement) {
        if (ts.isExpressionStatement(statement) &&
            ts.isCallExpression(statement.expression) &&
            statement.expression.expression.kind === ts.SyntaxKind.SuperKeyword) {
            return statement.expression.arguments;
        }
        return undefined;
    }
    convertMethodToFunction(method) {
        const params = processParameters(method.parameters, this.converter);
        const children = [];
        if (method.body) {
            for (const statement of method.body.statements) {
                children.push(...this.converter.convertStatementAsStatements(statement));
            }
        }
        return {
            type: "fn",
            typeParams: [],
            params,
            children,
            loc: dummyLoc,
        };
    }
    convertNewExpression(node) {
        // new ClassName(...) → ClassName.__new(...)
        const target = this.converter.convertExpressionAsExpression(node.expression);
        // ClassName.__new の形式に変換
        const newTarget = {
            type: "prop",
            target,
            name: "__new",
            loc: dummyLoc,
        };
        const args = node.arguments
            ? node.arguments.map((arg) => this.converter.convertExpressionAsExpression(arg))
            : [];
        return {
            type: "call",
            target: newTarget,
            args,
            loc: dummyLoc,
        };
    }
}
//# sourceMappingURL=classDeclaration.js.map