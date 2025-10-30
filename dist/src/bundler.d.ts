import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
/**
 * バンドラーエラー（位置情報付き）
 */
export declare class BundlerError extends Error {
    sourceFile: string;
    line: number;
    column: number;
    originalStatement?: ts.Node | undefined;
    cause?: Error | undefined;
    constructor(message: string, sourceFile: string, line: number, column: number, originalStatement?: ts.Node | undefined, cause?: Error | undefined);
}
/**
 * エクスポート情報
 */
export interface ExportInfo {
    name: string;
    originalName: string;
    symbol: ts.Symbol;
    sourceFile: string;
    isDefault: boolean;
}
/**
 * インポート情報
 */
export interface ImportInfo {
    name: string;
    originalName: string;
    from: string;
    symbol: ts.Symbol;
    isDefault: boolean;
}
/**
 * 文の位置情報
 */
export interface StatementContext {
    statement: ts.Statement;
    sourceFile: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}
/**
 * モジュール情報
 */
export interface ModuleInfo {
    filePath: string;
    sourceFile: ts.SourceFile;
    exports: ExportInfo[];
    imports: ImportInfo[];
    statements: ts.Statement[];
    statementContexts: StatementContext[];
    dependencies: string[];
}
/**
 * 変数リネーム戦略（Rollup風）
 */
export declare class VariableRenamer {
    private nameCounters;
    private symbolToName;
    /**
     * Rollup風の$数字サフィックス方式で一意な名前を生成
     */
    generateUniqueName(originalName: string, symbol: ts.Symbol): string;
    /**
     * シンボルに対応するリネーム後の名前を取得
     */
    getNewName(symbol: ts.Symbol): string | undefined;
    /**
     * すべてのリネーム情報をクリア
     */
    clear(): void;
}
/**
 * モジュール解析器
 */
export declare class ModuleAnalyzer {
    private program;
    private typeChecker;
    constructor(program: ts.Program);
    /**
     * ファイルを解析してModuleInfoを作成
     */
    analyzeModule(filePath: string): ModuleInfo;
    /**
     * export宣言を解析
     */
    private analyzeExportDeclaration;
    /**
     * import宣言を解析
     */
    private analyzeImportDeclaration;
    /**
     * export assignment を解析 (export = foo)
     */
    private analyzeExportAssignment;
    /**
     * export修飾子付きの文を解析
     */
    private analyzeExportedStatement;
    /**
     * 文にexport修飾子があるかチェック
     */
    private hasExportModifier;
}
/**
 * AiScriptバンドラー（Rollup風の単一スコープ展開）
 */
export declare class AiScriptBundler {
    private program;
    private analyzer;
    private renamer;
    private modules;
    private exportMap;
    private resolvedPaths;
    constructor(entryFile: string, rootDir?: string);
    /**
     * TypeScriptプログラムを作成
     */
    private createProgram;
    /**
     * バンドルを実行
     */
    bundle(): Ast.Node[];
    /**
     * 依存関係を解析
     */
    private analyzeDependencies;
    /**
     * 依存関係を解決
     */
    private resolveDependency;
    /**
     * 変数名の衝突を解決
     */
    private resolveNameConflicts;
    /**
     * モジュールレベルの変数宣言のみを収集してリネーム対象に追加
     */
    private collectModuleLevelDeclarations;
    /**
     * AiScriptコードを生成
     */
    private generateAiScript;
    /**
     * Source Map情報と共にコードを結合
     */
    private combineAllStatementsWithSourceMap;
    /**
     * バンドル後の行番号から元の位置情報を取得
     */
    private mapToOriginalLocation;
    /**
     * 処理順序を決定（トポロジカルソート簡易版）
     */
    private getProcessingOrder;
    /**
     * テキストベースで変数リネームを適用
     */
    private applyVariableRenames;
    /**
     * 正規表現用文字列をエスケープ
     */
    private escapeRegex;
}
//# sourceMappingURL=bundler.d.ts.map