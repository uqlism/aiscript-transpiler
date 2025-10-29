import ts from 'typescript';
import { Ast } from '@syuilo/aiscript';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { TypeScriptToAiScriptTranspiler } from './transpiler/main.js';
import { TranspilerError } from './transpiler/base.js';

/**
 * バンドラーエラー（位置情報付き）
 */
export class BundlerError extends Error {
  constructor(
    message: string,
    public sourceFile: string,
    public line: number,
    public column: number,
    public originalStatement?: ts.Statement,
    public override cause?: Error
  ) {
    super(`${message} at ${sourceFile}:${line}:${column}`);
    this.name = 'BundlerError';

    // 元のエラーがある場合はスタックトレースに含める
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * エクスポート情報
 */
export interface ExportInfo {
  name: string;                    // エクスポート名
  originalName: string;           // 元の変数名
  symbol: ts.Symbol;              // TypeScriptシンボル
  sourceFile: string;             // 定義元ファイル
  isDefault: boolean;             // デフォルトエクスポートかどうか
}

/**
 * インポート情報
 */
export interface ImportInfo {
  name: string;                   // インポート名
  originalName: string;          // 元の変数名
  from: string;                  // インポート元ファイル
  symbol: ts.Symbol;             // TypeScriptシンボル
  isDefault: boolean;            // デフォルトインポートかどうか
}

/**
 * 文の位置情報
 */
export interface StatementContext {
  statement: ts.Statement;       // 文
  sourceFile: string;            // 元ファイルパス
  startLine: number;             // 開始行番号（1ベース）
  startColumn: number;           // 開始列番号（1ベース）
  endLine: number;               // 終了行番号（1ベース）
  endColumn: number;             // 終了列番号（1ベース）
}

/**
 * モジュール情報
 */
export interface ModuleInfo {
  filePath: string;              // ファイルパス
  sourceFile: ts.SourceFile;     // TypeScript SourceFile
  exports: ExportInfo[];         // エクスポート一覧
  imports: ImportInfo[];         // インポート一覧
  statements: ts.Statement[];    // import/export以外の文
  statementContexts: StatementContext[]; // 文の位置情報
  dependencies: string[];        // 依存ファイル一覧
}

/**
 * 変数リネーム戦略（Rollup風）
 */
export class VariableRenamer {
  private nameCounters = new Map<string, number>();
  private symbolToName = new Map<ts.Symbol, string>();

  /**
   * Rollup風の$数字サフィックス方式で一意な名前を生成
   */
  generateUniqueName(originalName: string, symbol: ts.Symbol): string {
    // 既にリネーム済みの場合は既存の名前を返す
    if (this.symbolToName.has(symbol)) {
      return this.symbolToName.get(symbol)!;
    }

    const existingCount = this.nameCounters.get(originalName) || 0;
    this.nameCounters.set(originalName, existingCount + 1);

    const newName = existingCount === 0
      ? originalName  // 最初の出現はそのまま
      : `${originalName}$${existingCount}`;  // 衝突時は$数字

    this.symbolToName.set(symbol, newName);
    return newName;
  }

  /**
   * シンボルに対応するリネーム後の名前を取得
   */
  getNewName(symbol: ts.Symbol): string | undefined {
    return this.symbolToName.get(symbol);
  }

  /**
   * すべてのリネーム情報をクリア
   */
  clear(): void {
    this.nameCounters.clear();
    this.symbolToName.clear();
  }
}

/**
 * モジュール解析器
 */
export class ModuleAnalyzer {
  private typeChecker: ts.TypeChecker;

  constructor(private program: ts.Program) {
    this.typeChecker = program.getTypeChecker();
  }

  /**
   * ファイルを解析してModuleInfoを作成
   */
  analyzeModule(filePath: string): ModuleInfo {
    const sourceFile = this.program.getSourceFile(filePath);
    if (!sourceFile) {
      throw new Error(`ソースファイルが見つかりません: ${filePath}`);
    }

    const exports: ExportInfo[] = [];
    const imports: ImportInfo[] = [];
    const statements: ts.Statement[] = [];
    const statementContexts: StatementContext[] = [];
    const dependencies: string[] = [];

    /**
     * 文の位置情報を作成
     */
    const createStatementContext = (statement: ts.Statement): StatementContext => {
      let start: ts.LineAndCharacter;
      let end: ts.LineAndCharacter;

      try {
        // 元のソースファイルから位置情報を取得
        start = sourceFile.getLineAndCharacterOfPosition(statement.getStart());
        end = sourceFile.getLineAndCharacterOfPosition(statement.getEnd());
      } catch (error) {
        // 作成されたノードの場合、位置情報がないので適当な値を設定
        start = { line: 0, character: 0 };
        end = { line: 0, character: 0 };
      }

      return {
        statement,
        sourceFile: filePath,
        startLine: start.line + 1,     // 1ベース
        startColumn: start.character + 1, // 1ベース
        endLine: end.line + 1,         // 1ベース
        endColumn: end.character + 1,  // 1ベース
      };
    };

    for (const statement of sourceFile.statements) {
      if (ts.isExportDeclaration(statement)) {
        this.analyzeExportDeclaration(statement, exports, dependencies);
      } else if (ts.isImportDeclaration(statement)) {
        this.analyzeImportDeclaration(statement, imports, dependencies);
      } else if (ts.isExportAssignment(statement)) {
        this.analyzeExportAssignment(statement, exports);
      } else if (this.hasExportModifier(statement)) {
        this.analyzeExportedStatement(statement, exports, statements, statementContexts, createStatementContext);
      } else {
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
      dependencies: [...new Set(dependencies)] // 重複除去
    };
  }

  /**
   * export宣言を解析
   */
  private analyzeExportDeclaration(
    node: ts.ExportDeclaration,
    exports: ExportInfo[],
    dependencies: string[]
  ): void {
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
            isDefault: false
          });
        }
      }
    }
  }

  /**
   * import宣言を解析
   */
  private analyzeImportDeclaration(
    node: ts.ImportDeclaration,
    imports: ImportInfo[],
    dependencies: string[]
  ): void {
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;

    const modulePath = node.moduleSpecifier.text;
    dependencies.push(modulePath);

    if (!node.importClause) return;

    // デフォルトインポート: import foo from './module'
    if (node.importClause.name) {
      const symbol = this.typeChecker.getSymbolAtLocation(node.importClause.name);
      if (symbol) {
        imports.push({
          name: node.importClause.name.text,
          originalName: 'default',
          from: modulePath,
          symbol,
          isDefault: true
        });
      }
    }

    // 名前付きインポート: import { foo, bar } from './module'
    if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const importSpecifier of node.importClause.namedBindings.elements) {
        const symbol = this.typeChecker.getSymbolAtLocation(importSpecifier.name);
        if (symbol) {
          imports.push({
            name: importSpecifier.name.text,
            originalName: importSpecifier.propertyName?.text || importSpecifier.name.text,
            from: modulePath,
            symbol,
            isDefault: false
          });
        }
      }
    }

    // 名前空間インポート: import * as foo from './module'
    if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
      const symbol = this.typeChecker.getSymbolAtLocation(node.importClause.namedBindings.name);
      if (symbol) {
        imports.push({
          name: node.importClause.namedBindings.name.text,
          originalName: '*',
          from: modulePath,
          symbol,
          isDefault: false
        });
      }
    }
  }

  /**
   * export assignment を解析 (export = foo)
   */
  private analyzeExportAssignment(node: ts.ExportAssignment, exports: ExportInfo[]): void {
    if (ts.isIdentifier(node.expression)) {
      const symbol = this.typeChecker.getSymbolAtLocation(node.expression);
      if (symbol) {
        exports.push({
          name: 'default',
          originalName: node.expression.text,
          symbol,
          sourceFile: node.getSourceFile().fileName,
          isDefault: true
        });
      }
    }
  }

  /**
   * export修飾子付きの文を解析
   */
  private analyzeExportedStatement(
    node: ts.Statement,
    exports: ExportInfo[],
    statements: ts.Statement[],
    statementContexts: StatementContext[],
    createStatementContext: (stmt: ts.Statement) => StatementContext
  ): void {
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
          isDefault: false
        });
      }
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const symbol = this.typeChecker.getSymbolAtLocation(declaration.name);
          if (symbol) {
            exports.push({
              name: declaration.name.text,
              originalName: declaration.name.text,
              symbol,
              sourceFile: node.getSourceFile().fileName,
              isDefault: false
            });
          }
        }
      }
    }
  }

  /**
   * 文にexport修飾子があるかチェック
   */
  private hasExportModifier(node: ts.Statement): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) || false;
  }
}

/**
 * AiScriptバンドラー（Rollup風の単一スコープ展開）
 */
export class AiScriptBundler {
  private program: ts.Program;
  private analyzer: ModuleAnalyzer;
  private renamer = new VariableRenamer();
  private modules = new Map<string, ModuleInfo>();
  private exportMap = new Map<string, Map<string, ExportInfo>>();
  private resolvedPaths = new Map<string, string>();

  constructor(entryFile: string, rootDir = process.cwd()) {
    this.program = this.createProgram(entryFile, rootDir);
    this.analyzer = new ModuleAnalyzer(this.program);
  }

  /**
   * TypeScriptプログラムを作成
   */
  private createProgram(entryFile: string, rootDir: string): ts.Program {
    const compilerOptions: ts.CompilerOptions = {
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
      baseUrl: rootDir
    };

    const compilerHost = ts.createCompilerHost(compilerOptions);

    // transpiler/src/の型定義ファイルを含める
    // ES Modulesでは__dirnameの代わりにimport.meta.urlを使用
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const typeFiles = [
      path.resolve(__dirname, 'aiscript.d.ts'),
      path.resolve(__dirname, 'misskey_aiscript.d.ts')
    ];

    return ts.createProgram([entryFile, ...typeFiles], compilerOptions, compilerHost);
  }

  /**
   * バンドルを実行
   */
  bundle(): Ast.Node[] {
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
  private analyzeDependencies(): void {
    const visited = new Set<string>();
    const analyzing = new Set<string>();

    const analyze = (filePath: string): void => {
      if (visited.has(filePath) || analyzing.has(filePath)) return;

      analyzing.add(filePath);

      const moduleInfo = this.analyzer.analyzeModule(filePath);
      this.modules.set(filePath, moduleInfo);

      // エクスポートマップを構築
      const exports = new Map<string, ExportInfo>();
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
  private resolveDependency(importPath: string, fromFile: string): string | undefined {
    // 相対パスの解決
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const resolved = ts.resolveModuleName(
        importPath,
        fromFile,
        this.program.getCompilerOptions(),
        ts.sys
      );
      return resolved.resolvedModule?.resolvedFileName;
    }

    // その他の解決方法は将来実装
    return undefined;
  }

  /**
   * 変数名の衝突を解決
   */
  private resolveNameConflicts(): void {
    // 全ての変数宣言に対してユニーク名を生成（モジュールレベルのみ）
    for (const [filePath, moduleInfo] of this.modules) {
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
  private collectModuleLevelDeclarations(statement: ts.Statement): void {
    // 直接的な変数宣言のみ（関数内部は除外）
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const symbol = this.program.getTypeChecker().getSymbolAtLocation(declaration.name);
          if (symbol) {
            this.renamer.generateUniqueName(declaration.name.text, symbol);
          }
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      const symbol = this.program.getTypeChecker().getSymbolAtLocation(statement.name);
      if (symbol) {
        this.renamer.generateUniqueName(statement.name.text, symbol);
      }
    }
    // 他の種類の文（クラス宣言など）も必要に応じて追加可能
  }

  /**
   * AiScriptコードを生成
   */
  private generateAiScript(): Ast.Node[] {
    const result: Ast.Node[] = [];

    const transpiler = new TypeScriptToAiScriptTranspiler()

    // トポロジカルソート順にモジュールを処理
    const processedModules = this.getProcessingOrder();

    for (const filePath of processedModules) {
      const moduleInfo = this.modules.get(filePath);
      if (!moduleInfo) continue;

      // 各文とそのコンテキストを同時に処理
      for (let i = 0; i < moduleInfo.statements.length; i++) {
        const statement = moduleInfo.statements[i];
        const context = moduleInfo.statementContexts[i];

        // 安全性チェック
        if (!statement || !context) {
          continue;
        }

        try {
          // 文のテキストを取得してexport修飾子を除去
          let statementText = statement.getFullText().trim();

          // export修飾子がある場合は除去
          if (statementText.startsWith('export ')) {
            statementText = statementText.replace(/^export\s+/, '');
          }

          // 変数リネームを適用
          statementText = this.applyVariableRenames(statementText, statement);

          const tsCode = statementText;

          const converted = transpiler.transpile(tsCode);
          result.push(...converted);
        } catch (error) {
          if (error instanceof TranspilerError) {
            // TranspilerErrorの場合、実際のエラー位置を使用
            const position = error.getPosition();
            throw new BundlerError(
              `Error transpiling statement: ${error.message}`,
              context.sourceFile,
              context.startLine + position.startLine - 1, // statementの開始行 + エラー行の相対位置
              position.startColumn,
              statement,
              error
            );
          } else {
            // 元のファイルの位置情報を含むエラーを投げる
            throw new BundlerError(
              `Error transpiling statement: ${error instanceof Error ? error.message : String(error)}`,
              context.sourceFile,
              context.startLine,
              context.startColumn,
              statement,
              error instanceof Error ? error : undefined
            );
          }
        }
      }
    }

    return result;
  }

  /**
   * 処理順序を決定（トポロジカルソート簡易版）
   */
  private getProcessingOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (filePath: string): void => {
      if (visited.has(filePath)) return;
      visited.add(filePath);

      const moduleInfo = this.modules.get(filePath);
      if (!moduleInfo) return;

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
  private applyVariableRenames(text: string, statement: ts.Statement): string {
    let result = text;

    // 識別子をトラバースしてリネームが必要なものを置換
    const visitor = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const symbol = this.program.getTypeChecker().getSymbolAtLocation(node);
        if (symbol) {
          const newName = this.renamer.getNewName(symbol);
          if (newName && newName !== node.text) {
            // テキスト内で識別子を置換（単語境界を考慮）
            const regex = new RegExp(`\\b${this.escapeRegex(node.text)}\\b`, 'g');
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
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
