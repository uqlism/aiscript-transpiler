import type { Ast } from "@syuilo/aiscript";
import * as ts from "typescript";
export declare class TypeScriptToAiScriptTranspiler {
    #private;
    constructor();
    transpileFile(entryFilePath: string, userProjectRoot?: string): Ast.Node[];
    transpileProgram(program: ts.Program, entrySourceFile: ts.SourceFile): Ast.Node[];
}
//# sourceMappingURL=main.d.ts.map