import type { Ast } from "@syuilo/aiscript";
import * as ts from "typescript";
/** 正規表現コンパイル関数名 */
export declare const REGEX_COMPILE_FN = "__re_compile";
export type RegexHoist = {
    id: Ast.Identifier;
    pattern: string;
    flags: string;
};
/**
 * TypeScript位置情報付きトランスパイラーエラー
 */
export declare class TranspilerError extends Error {
    node: ts.Node;
    sourceFile: ts.SourceFile;
    constructor(message: string, node: ts.Node, sourceFile: ts.SourceFile);
    getPosition(): {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
    };
}
export declare class Transpiler {
    #private;
    constructor(namespaces?: string[]);
    addPlugin(pluginFactory: new (converter: TranspilerContext) => TranspilerPlugin): void;
    /**
     * TypeScript Programを受け取ってAiScript ASTに変換する
     * @param regexLibNodes 正規表現が使われた場合に先頭に挿入するライブラリノード列
     */
    transpileProgram(program: ts.Program, entrySourceFile: ts.SourceFile, doTypeCheck?: boolean, regexLibNodes?: Ast.Node[]): Ast.Node[];
}
export type TranspilerContext = {
    convertExpressionAsExpression(expr: ts.Expression): Ast.Expression;
    convertExpressionAsStatements(expr: ts.Expression): (Ast.Expression | Ast.Statement)[];
    convertStatementAsStatements(expr: ts.Statement): (Ast.Expression | Ast.Statement)[];
    getUniqueIdentifier(): Ast.Identifier;
    validateVariableName(name: string, node: ts.Node): void;
    throwError(message: string, node: ts.Node): never;
    typeChecker: ts.TypeChecker;
    doTypeCheck: boolean;
    getNamespaces(): string[];
    getModuleRef(importPath: string): Ast.Expression;
    addExport(name: string): void;
    /** export * from './other' 用: 丸ごと再エクスポートするモジュール参照を登録 */
    addReExportAll(moduleRef: Ast.Expression): void;
    registerRegexLiteral(pattern: string, flags: string): Ast.Identifier;
    popRegexHoists(): RegexHoist[];
};
export declare class TranspilerPlugin {
    protected converter: TranspilerContext;
    constructor(converter: TranspilerContext);
    tryConvertExpressionAsExpression?: (node: ts.Expression) => Ast.Expression | undefined;
    tryConvertExpressionAsStatements?: (node: ts.Expression) => (Ast.Expression | Ast.Statement)[] | undefined;
    tryConvertStatementAsStatements?: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
}
//# sourceMappingURL=base.d.ts.map