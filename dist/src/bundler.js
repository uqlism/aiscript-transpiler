import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { TranspilerError } from "./transpiler/base.js";
import { TypeScriptToAiScriptTranspiler } from "./transpiler/main.js";
/**
 * バンドラーエラー（位置情報付き）
 */
export class BundlerError extends Error {
    sourceFile;
    line;
    column;
    originalStatement;
    cause;
    constructor(message, sourceFile, line, column, originalStatement, cause) {
        super(`${message} at ${sourceFile}:${line}:${column}`);
        this.sourceFile = sourceFile;
        this.line = line;
        this.column = column;
        this.originalStatement = originalStatement;
        this.cause = cause;
        this.name = "BundlerError";
        // 元のエラーがある場合はスタックトレースに含める
        if (cause) {
            this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
        }
    }
}
/**
 * 変数リネーム戦略（Rollup風）
 */
export class VariableRenamer {
    nameCounters = new Map();
    symbolToName = new Map();
    /**
     * Rollup風の$数字サフィックス方式で一意な名前を生成
     */
    generateUniqueName(originalName, symbol) {
        // 既にリネーム済みの場合は既存の名前を返す
        if (this.symbolToName.has(symbol)) {
            const existingName = this.symbolToName.get(symbol);
            if (existingName) {
                return existingName;
            }
        }
        const existingCount = this.nameCounters.get(originalName) || 0;
        this.nameCounters.set(originalName, existingCount + 1);
        const newName = existingCount === 0
            ? originalName // 最初の出現はそのまま
            : `${originalName}$${existingCount}`; // 衝突時は$数字
        this.symbolToName.set(symbol, newName);
        return newName;
    }
    /**
     * シンボルに対応するリネーム後の名前を取得
     */
    getNewName(symbol) {
        return this.symbolToName.get(symbol);
    }
    /**
     * すべてのリネーム情報をクリア
     */
    clear() {
        this.nameCounters.clear();
        this.symbolToName.clear();
    }
}
/**
 * モジュール解析器
 */
export class ModuleAnalyzer {
    program;
    typeChecker;
    constructor(program) {
        this.program = program;
        this.typeChecker = program.getTypeChecker();
    }
    /**
     * ファイルを解析してModuleInfoを作成
     */
    analyzeModule(filePath) {
        const sourceFile = this.program.getSourceFile(filePath);
        if (!sourceFile) {
            throw new Error(`ソースファイルが見つかりません: ${filePath}`);
        }
        const exports = [];
        const imports = [];
        const statements = [];
        const statementContexts = [];
        const dependencies = [];
        /**
         * 文の位置情報を作成
         */
        const createStatementContext = (statement) => {
            let start;
            let end;
            try {
                // 元のソースファイルから位置情報を取得
                start = sourceFile.getLineAndCharacterOfPosition(statement.getStart());
                end = sourceFile.getLineAndCharacterOfPosition(statement.getEnd());
            }
            catch (_error) {
                // 作成されたノードの場合、位置情報がないので適当な値を設定
                start = { line: 0, character: 0 };
                end = { line: 0, character: 0 };
            }
            return {
                statement,
                sourceFile: filePath,
                startLine: start.line + 1, // 1ベース
                startColumn: start.character + 1, // 1ベース
                endLine: end.line + 1, // 1ベース
                endColumn: end.character + 1, // 1ベース
            };
        };
        for (const statement of sourceFile.statements) {
            if (ts.isExportDeclaration(statement)) {
                this.analyzeExportDeclaration(statement, exports, dependencies);
            }
            else if (ts.isImportDeclaration(statement)) {
                this.analyzeImportDeclaration(statement, imports, dependencies);
            }
            else if (ts.isExportAssignment(statement)) {
                this.analyzeExportAssignment(statement, exports);
            }
            else if (this.hasExportModifier(statement)) {
                this.analyzeExportedStatement(statement, exports, statements, statementContexts, createStatementContext);
            }
            else {
                statements.push(statement);
                statementContexts.push(createStatementContext(statement));
            }
        }
        return {
            filePath,
            sourceFile,
            exports,
            imports,
            statements,
            statementContexts,
            dependencies: [...new Set(dependencies)], // 重複除去
        };
    }
    /**
     * export宣言を解析
     */
    analyzeExportDeclaration(node, exports, dependencies) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const modulePath = node.moduleSpecifier.text;
            dependencies.push(modulePath);
        }
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const exportSpecifier of node.exportClause.elements) {
                const symbol = this.typeChecker.getSymbolAtLocation(exportSpecifier.name);
                if (symbol) {
                    exports.push({
                        name: exportSpecifier.name.text,
                        originalName: exportSpecifier.propertyName?.text || exportSpecifier.name.text,
                        symbol,
                        sourceFile: node.getSourceFile().fileName,
                        isDefault: false,
                    });
                }
            }
        }
    }
    /**
     * import宣言を解析
     */
    analyzeImportDeclaration(node, imports, dependencies) {
        if (!ts.isStringLiteral(node.moduleSpecifier))
            return;
        const modulePath = node.moduleSpecifier.text;
        dependencies.push(modulePath);
        if (!node.importClause)
            return;
        // デフォルトインポート: import foo from './module'
        if (node.importClause.name) {
            const symbol = this.typeChecker.getSymbolAtLocation(node.importClause.name);
            if (symbol) {
                imports.push({
                    name: node.importClause.name.text,
                    originalName: "default",
                    from: modulePath,
                    symbol,
                    isDefault: true,
                });
            }
        }
        // 名前付きインポート: import { foo, bar } from './module'
        if (node.importClause.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings)) {
            for (const importSpecifier of node.importClause.namedBindings.elements) {
                const symbol = this.typeChecker.getSymbolAtLocation(importSpecifier.name);
                if (symbol) {
                    imports.push({
                        name: importSpecifier.name.text,
                        originalName: importSpecifier.propertyName?.text || importSpecifier.name.text,
                        from: modulePath,
                        symbol,
                        isDefault: false,
                    });
                }
            }
        }
        // 名前空間インポート: import * as foo from './module'
        if (node.importClause.namedBindings &&
            ts.isNamespaceImport(node.importClause.namedBindings)) {
            const symbol = this.typeChecker.getSymbolAtLocation(node.importClause.namedBindings.name);
            if (symbol) {
                imports.push({
                    name: node.importClause.namedBindings.name.text,
                    originalName: "*",
                    from: modulePath,
                    symbol,
                    isDefault: false,
                });
            }
        }
    }
    /**
     * export assignment を解析 (export = foo)
     */
    analyzeExportAssignment(node, exports) {
        if (ts.isIdentifier(node.expression)) {
            const symbol = this.typeChecker.getSymbolAtLocation(node.expression);
            if (symbol) {
                exports.push({
                    name: "default",
                    originalName: node.expression.text,
                    symbol,
                    sourceFile: node.getSourceFile().fileName,
                    isDefault: true,
                });
            }
        }
    }
    /**
     * export修飾子付きの文を解析
     */
    analyzeExportedStatement(node, exports, statements, statementContexts, createStatementContext) {
        // AST操作を避けて、元のノードをそのまま使用
        // export修飾子の除去は後でテキスト処理で行う
        statements.push(node);
        statementContexts.push(createStatementContext(node));
        // エクスポート情報を抽出
        if (ts.isFunctionDeclaration(node) && node.name) {
            const symbol = this.typeChecker.getSymbolAtLocation(node.name);
            if (symbol) {
                exports.push({
                    name: node.name.text,
                    originalName: node.name.text,
                    symbol,
                    sourceFile: node.getSourceFile().fileName,
                    isDefault: false,
                });
            }
        }
        else if (ts.isVariableStatement(node)) {
            for (const declaration of node.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name)) {
                    const symbol = this.typeChecker.getSymbolAtLocation(declaration.name);
                    if (symbol) {
                        exports.push({
                            name: declaration.name.text,
                            originalName: declaration.name.text,
                            symbol,
                            sourceFile: node.getSourceFile().fileName,
                            isDefault: false,
                        });
                    }
                }
            }
        }
    }
    /**
     * 文にexport修飾子があるかチェック
     */
    hasExportModifier(node) {
        if (!ts.canHaveModifiers(node))
            return false;
        const modifiers = ts.getModifiers(node);
        return (modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || false);
    }
}
/**
 * AiScriptバンドラー（Rollup風の単一スコープ展開）
 */
export class AiScriptBundler {
    program;
    analyzer;
    renamer = new VariableRenamer();
    modules = new Map();
    exportMap = new Map();
    resolvedPaths = new Map();
    constructor(entryFile, rootDir = process.cwd()) {
        this.program = this.createProgram(entryFile, rootDir);
        this.analyzer = new ModuleAnalyzer(this.program);
    }
    /**
     * TypeScriptプログラムを作成
     */
    createProgram(entryFile, rootDir) {
        const compilerOptions = {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ES2020,
            moduleResolution: ts.ModuleResolutionKind.Node10,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: true,
            allowJs: true,
            skipLibCheck: true,
            noLib: true,
            typeRoots: [],
            lib: [],
            baseUrl: rootDir,
        };
        const compilerHost = ts.createCompilerHost(compilerOptions);
        // ユーザープロジェクトのnode_modules/aiscript-transpilerから型定義ファイルを含める
        const typeFiles = [
            path.resolve(rootDir, "node_modules", "aiscript-transpiler", "types", "aiscript.d.ts"),
            path.resolve(rootDir, "node_modules", "aiscript-transpiler", "types", "misskey_aiscript.d.ts"),
        ].filter((filePath) => {
            try {
                return fs.existsSync(filePath);
            }
            catch {
                return false;
            }
        });
        return ts.createProgram([entryFile, ...typeFiles], compilerOptions, compilerHost);
    }
    /**
     * バンドルを実行
     */
    bundle() {
        // 1. 依存関係を解析
        this.analyzeDependencies();
        // 2. 変数名の衝突を解決
        this.resolveNameConflicts();
        // 3. AiScriptコードを生成
        return this.generateAiScript();
    }
    /**
     * 依存関係を解析
     */
    analyzeDependencies() {
        const visited = new Set();
        const analyzing = new Set();
        const analyze = (filePath) => {
            if (visited.has(filePath) || analyzing.has(filePath))
                return;
            analyzing.add(filePath);
            const moduleInfo = this.analyzer.analyzeModule(filePath);
            this.modules.set(filePath, moduleInfo);
            // エクスポートマップを構築
            const exports = new Map();
            for (const exportInfo of moduleInfo.exports) {
                exports.set(exportInfo.name, exportInfo);
            }
            this.exportMap.set(filePath, exports);
            // 依存ファイルを再帰的に解析
            for (const dependency of moduleInfo.dependencies) {
                const resolvedPath = this.resolveDependency(dependency, filePath);
                if (resolvedPath) {
                    this.resolvedPaths.set(`${filePath}:${dependency}`, resolvedPath);
                    analyze(resolvedPath);
                }
            }
            analyzing.delete(filePath);
            visited.add(filePath);
        };
        // エントリーファイルから開始
        const entryFile = this.program.getRootFileNames()[0];
        if (entryFile) {
            analyze(entryFile);
        }
    }
    /**
     * 依存関係を解決
     */
    resolveDependency(importPath, fromFile) {
        // 相対パスの解決
        if (importPath.startsWith("./") || importPath.startsWith("../")) {
            const resolved = ts.resolveModuleName(importPath, fromFile, this.program.getCompilerOptions(), ts.sys);
            return resolved.resolvedModule?.resolvedFileName;
        }
        // その他の解決方法は将来実装
        return undefined;
    }
    /**
     * 変数名の衝突を解決
     */
    resolveNameConflicts() {
        // 全ての変数宣言に対してユニーク名を生成（モジュールレベルのみ）
        for (const [_filePath, moduleInfo] of this.modules) {
            // まずエクスポートシンボルを処理
            for (const exportInfo of moduleInfo.exports) {
                this.renamer.generateUniqueName(exportInfo.originalName, exportInfo.symbol);
            }
            // モジュールレベルの変数宣言のみをチェック
            for (const statement of moduleInfo.statements) {
                this.collectModuleLevelDeclarations(statement);
            }
        }
    }
    /**
     * モジュールレベルの変数宣言のみを収集してリネーム対象に追加
     */
    collectModuleLevelDeclarations(statement) {
        // 直接的な変数宣言のみ（関数内部は除外）
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name)) {
                    const symbol = this.program
                        .getTypeChecker()
                        .getSymbolAtLocation(declaration.name);
                    if (symbol) {
                        this.renamer.generateUniqueName(declaration.name.text, symbol);
                    }
                }
            }
        }
        else if (ts.isFunctionDeclaration(statement) && statement.name) {
            const symbol = this.program
                .getTypeChecker()
                .getSymbolAtLocation(statement.name);
            if (symbol) {
                this.renamer.generateUniqueName(statement.name.text, symbol);
            }
        }
        // 他の種類の文（クラス宣言など）も必要に応じて追加可能
    }
    /**
     * AiScriptコードを生成
     */
    generateAiScript() {
        const transpiler = new TypeScriptToAiScriptTranspiler();
        // すべてのステートメントを結合してから一括でトランスパイル（Source Map方式）
        const { combinedCode, sourceMap } = this.combineAllStatementsWithSourceMap();
        try {
            return transpiler.transpile(combinedCode);
        }
        catch (error) {
            if (error instanceof TranspilerError) {
                // Source Mapを使って元の位置情報を復元
                const position = error.getPosition();
                const originalLocation = this.mapToOriginalLocation(position.startLine, sourceMap);
                throw new BundlerError(`Error transpiling statement: ${error.message}`, originalLocation.fileName, originalLocation.line, originalLocation.column, error.node, error);
            }
            else {
                throw new BundlerError(`Error transpiling bundled code: ${error instanceof Error ? error.message : String(error)}`, "unknown", 1, 1, undefined, error instanceof Error ? error : undefined);
            }
        }
    }
    /**
     * Source Map情報と共にコードを結合
     */
    combineAllStatementsWithSourceMap() {
        const processedModules = this.getProcessingOrder();
        const statements = [];
        const sourceMap = [];
        let currentBundledLine = 1;
        for (const filePath of processedModules) {
            const moduleInfo = this.modules.get(filePath);
            if (!moduleInfo)
                continue;
            for (let i = 0; i < moduleInfo.statements.length; i++) {
                const statement = moduleInfo.statements[i];
                const context = moduleInfo.statementContexts[i];
                // 安全性チェック
                if (!statement || !context) {
                    continue;
                }
                // 文のテキストを取得してexport修飾子を除去
                let statementText = statement.getFullText().trim();
                // export修飾子がある場合は除去
                if (statementText.startsWith("export ")) {
                    statementText = statementText.replace(/^export\s+/, "");
                }
                // 変数リネームを適用
                statementText = this.applyVariableRenames(statementText, statement);
                // ステートメントの元の位置情報を取得
                const sourceFile = statement.getSourceFile();
                const start = sourceFile.getLineAndCharacterOfPosition(statement.getStart());
                // Source Map情報を記録
                sourceMap.push({
                    bundledLine: currentBundledLine,
                    fileName: filePath,
                    originalLine: start.line + 1, // TypeScriptは0ベースなので+1
                    originalColumn: start.character + 1,
                });
                statements.push(statementText);
                // 改行の数を正確にカウント（最後が空行でない場合を考慮）
                const newlineCount = (statementText.match(/\n/g) || []).length;
                currentBundledLine += newlineCount + 1;
            }
        }
        return {
            combinedCode: statements.join("\n"),
            sourceMap,
        };
    }
    /**
     * バンドル後の行番号から元の位置情報を取得
     */
    mapToOriginalLocation(bundledLine, sourceMap) {
        // 該当する行を探す（逆順で最初に見つかったものが正解）
        let bestMatch = null;
        for (let i = sourceMap.length - 1; i >= 0; i--) {
            const mapping = sourceMap[i];
            if (mapping && mapping.bundledLine <= bundledLine) {
                bestMatch = mapping;
                break;
            }
        }
        if (bestMatch) {
            // バンドル内での相対位置を計算
            const lineOffset = bundledLine - bestMatch.bundledLine;
            const mappedLine = bestMatch.originalLine + lineOffset - 1; // 1行補正
            return {
                fileName: bestMatch.fileName,
                line: mappedLine,
                column: bestMatch.originalColumn,
            };
        }
        // 見つからない場合はデフォルト値
        return {
            fileName: "unknown",
            line: 1,
            column: 1,
        };
    }
    /**
     * 処理順序を決定（トポロジカルソート簡易版）
     */
    getProcessingOrder() {
        const visited = new Set();
        const result = [];
        const visit = (filePath) => {
            if (visited.has(filePath))
                return;
            visited.add(filePath);
            const moduleInfo = this.modules.get(filePath);
            if (!moduleInfo)
                return;
            // 依存先を先に処理
            for (const dependency of moduleInfo.dependencies) {
                const resolvedPath = this.resolvedPaths.get(`${filePath}:${dependency}`);
                if (resolvedPath && this.modules.has(resolvedPath)) {
                    visit(resolvedPath);
                }
            }
            result.push(filePath);
        };
        for (const filePath of this.modules.keys()) {
            visit(filePath);
        }
        return result;
    }
    /**
     * テキストベースで変数リネームを適用
     */
    applyVariableRenames(text, statement) {
        let result = text;
        // 識別子をトラバースしてリネームが必要なものを置換
        const visitor = (node) => {
            if (ts.isIdentifier(node)) {
                const symbol = this.program.getTypeChecker().getSymbolAtLocation(node);
                if (symbol) {
                    const newName = this.renamer.getNewName(symbol);
                    if (newName && newName !== node.text) {
                        // テキスト内で識別子を置換（単語境界を考慮）
                        const regex = new RegExp(`\\b${this.escapeRegex(node.text)}\\b`, "g");
                        result = result.replace(regex, newName);
                    }
                }
            }
            ts.forEachChild(node, visitor);
        };
        visitor(statement);
        return result;
    }
    /**
     * 正規表現用文字列をエスケープ
     */
    escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
//# sourceMappingURL=bundler.js.map