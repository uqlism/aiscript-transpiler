import type { Ast } from "@syuilo/aiscript";
import * as ts from "typescript";
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
    constructor();
    addPlugin(pluginFactory: new (converter: TranspilerContext) => TranspilerPlugin): void;
    /**
     * TypeScript Programを受け取ってAiScript ASTに変換する
     * 核となる変換処理のみを行う
     */
    transpileProgram(program: ts.Program, entrySourceFile: ts.SourceFile): Ast.Node[];
}
export type TranspilerContext = {
    convertExpressionAsExpression(expr: ts.Expression): Ast.Expression;
    convertExpressionAsStatements(expr: ts.Expression): (Ast.Expression | Ast.Statement)[];
    convertStatementAsStatements(expr: ts.Statement): (Ast.Expression | Ast.Statement)[];
    getUniqueIdentifier(): Ast.Identifier;
    validateVariableName(name: string, node: ts.Node): void;
    throwError(message: string, node: ts.Node): never;
    typeChecker: ts.TypeChecker;
    getModuleRef(importPath: string): Ast.Identifier;
    addExport(name: string): void;
};
export declare class TranspilerPlugin {
    protected converter: TranspilerContext;
    constructor(converter: TranspilerContext);
    tryConvertExpressionAsExpression?: (node: ts.Expression) => Ast.Expression | undefined;
    tryConvertExpressionAsStatements?: (node: ts.Expression) => (Ast.Expression | Ast.Statement)[] | undefined;
    tryConvertStatementAsStatements?: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
}
//# sourceMappingURL=base.d.ts.map