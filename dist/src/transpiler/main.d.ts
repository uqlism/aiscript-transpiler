import type { Ast } from "@syuilo/aiscript";
import * as ts from "typescript";
export declare class TypeScriptToAiScriptTranspiler {
    #private;
    constructor(options?: {
        additionalNamespaces?: string[];
    });
    transpileFile(entryFilePath: string, userProjectRoot?: string, doTypeCheck?: boolean): Ast.Node[];
    transpileProgram(program: ts.Program, entrySourceFile: ts.SourceFile, doTypeCheck?: boolean): Ast.Node[];
}
//# sourceMappingURL=main.d.ts.map