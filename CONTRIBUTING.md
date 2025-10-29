# Contributing to AiScript Transpiler

AiScript Transpilerへのコントリビューションありがとうございます！このドキュメントでは、プロジェクトへの貢献方法について説明します。

## 開発環境

### 必要な環境

- Bun 1.2.23（推奨）
- Git

### セットアップ

1. リポジトリをフォーク・クローン

```bash
git clone https://github.com/uqlism/aiscript-transpiler.git
cd aiscript-transpiler
```

2. 依存関係をインストール

```bash
bun install
```

### 開発コマンド

```bash
# テスト実行
bun test

# メインスクリプト実行
bun run main.ts

# CLI実行（ローカル開発用）
bun run bin/cli.ts transpile <file>
bun run bin/cli.ts deploy <file> <domain> <play-id>

# リント・フォーマット
bun run check          # チェックのみ
bun run check:fix      # 自動修正あり

# 後悔用ビルド
bun run build
```

## プロジェクト構成

### アーキテクチャ

```
src/
├── transpiler/         # トランスパイラエンジン
│   ├── main.ts        # メインのトランスパイラクラス
│   ├── base.ts        # ベーストランスパイラとプラグインシステム
│   ├── plugins/       # 各TypeScript構文のプラグイン
│   │   ├── expressions/  # 式の処理
│   │   ├── statements/   # 文の処理
│   │   └── functions.ts  # 関数宣言の処理
│   └── utils/         # ユーティリティ
├── bundler.ts         # モジュールバンドラ
├── stringifier.ts     # AiScript AST文字列化
└── index.ts          # メインエントリポイント

bin/
├── cli.ts            # CLI メインファイル
└── convert.ts        # 変換ユーティリティ

types/
├── aiscript.d.ts     # AiScript型定義
└── misskey.d.ts      # Misskey型定義
```

### プラグイン開発

トランスパイラは Plugin ベースのアーキテクチャを採用しています：

```typescript
import { TranspilerPlugin } from '../base.js';

export class YourPlugin extends TranspilerPlugin {
    override tryConvertStatementAsStatements(
        node: ts.Statement
    ): Ast.Statement[] | undefined {
        // TypeScript AST -> AiScript AST変換処理
        return statements;
    }
}
```

## コントリビューション手順

### 1. Issue作成

- バグ報告、機能提案は Issue で報告してください
- 既存の Issue を確認し、重複を避けてください
- 明確なタイトルと詳細な説明を記載してください

### 2. ブランチ作成

```bash
git checkout -b feature/your-feature-name
# または
git checkout -b fix/your-bug-fix
```

### 3. 開発

- コードスタイルはBiomeの設定に従ってください
- 新機能にはテストを追加してください
- コミットメッセージは明確に記載してください

### 4. テスト

```bash
# すべてのテストを実行
bun test

# リントチェック
bun run check

# 特定のテストファイル実行
bun test transpiler.test.ts
```

### 5. プルリクエスト

- `main` ブランチに対してPRを作成してください
- 変更内容の説明を詳しく記載してください
- テストが通ることを確認してください

## コーディング規約

### TypeScript

- strict モードを使用
- 型定義は明示的に記載
- `any` 型の使用は最小限に

### コミットメッセージ

```
type: 簡潔な説明

詳細な説明（必要に応じて）

- 変更点1
- 変更点2
```

Type例：
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント更新
- `style`: コードスタイル修正
- `refactor`: リファクタリング
- `test`: テスト追加・修正

### ファイル・フォルダ命名

- ファイル名は kebab-case または camelCase
- TypeScript ファイルは `.ts` 拡張子
- テストファイルは `.test.ts` 拡張子

## テスト指針

### 単体テスト

- 各プラグインの個別テスト
- エラーハンドリングのテスト
- エッジケースのテスト

### 統合テスト

- 複数ファイルのバンドルテスト
- CLI動作テスト
- 実際のAiScriptコード生成テスト

### テスト作成例

```typescript
import { expect, test } from "bun:test";
import { TypeScriptToAiScriptTranspiler } from "../src/transpiler/main";

test("変数宣言のトランスパイル", () => {
    const transpiler = new TypeScriptToAiScriptTranspiler();
    const result = transpiler.transpileAndStringify("const x = 10;");
    expect(result).toBe("let x = 10");
});
```

## よくある問題

### TypeScript AST処理

- `ts.isXXX` を使用して node タイプを判定
- `node.kind` での分岐も活用
- `typeChecker` を使用した型情報の取得

### AiScript AST生成

- `loc: dummyLoc` を適切に設定
- AiScript 仕様に合わせた構文生成
- エラー時は `throwError` を使用

## 質問・サポート

- GitHub Issues で質問可能
- 実装についての議論は Discussion で

## ライセンス

コントリビューションは MIT ライセンスの下で公開されます。
