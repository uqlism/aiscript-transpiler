# AiScript Transpiler

このプロジェクトはTypeScriptを[AiScript](https://aiscript-dev.github.io/ja/references/syntax.html)にトランスパイルするための仕組みを提供するプロジェクトです。

## インストール

現在npm公開準備中のため、GitHubリポジトリから直接インストールしてください。

### npm

```bash
npm install git+https://github.com/uqlism/aiscript-transpiler.git
```

### yarn

```bash
yarn add git+https://github.com/uqlism/aiscript-transpiler.git
```

### bun

```bash
bun add git+https://github.com/uqlism/aiscript-transpiler.git
```

## 使い方

### コマンドライン

```bash
# TypeScriptファイルをAiScriptにトランスパイル
aiscript-transpiler transpile input.ts

# Misskeyにデプロイ
aiscript-transpiler deploy input.ts your-misskey-domain.com play-id-here
```

### プロジェクトでの使用

```bash
# プロジェクトにローカルインストール
npm install --save-dev git+https://github.com/uqlism/aiscript-transpiler.git
yarn add --dev git+https://github.com/uqlism/aiscript-transpiler.git
bun add --dev git+https://github.com/uqlism/aiscript-transpiler.git

# 使用例
npx aiscript-transpiler transpile src/main.ts
yarn aiscript-transpiler transpile src/main.ts
bun aiscript-transpiler transpile src/main.ts
```

### プログラムから使用

```typescript
import { TypeScriptToAiScriptTranspiler, AiScriptBundler } from 'aiscript-transpiler';

const transpiler = new TypeScriptToAiScriptTranspiler();
const result = transpiler.transpileAndStringify(sourceCode);
```

## 要件

- Node.js 18.0.0以上

