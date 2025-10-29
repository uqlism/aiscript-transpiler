import type { Ast } from "@syuilo/aiscript";
export declare class TypeScriptToAiScriptTranspiler {
    #private;
    constructor();
    transpile(sourceCode: string, userProjectRoot?: string): Ast.Node[];
    static transpile(sourceCode: string, userProjectRoot?: string): Ast.Node[];
    transpileAndStringify(sourceCode: string, userProjectRoot?: string): string;
}
//# sourceMappingURL=main.d.ts.map