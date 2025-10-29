# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AiScript transpiler that converts TypeScript code to AiScript (the scripting language used by Misskey). The project includes a transpiler engine, bundler for handling imports/exports, and CLI tools for both local transpilation and deploying to Misskey instances.

## Development Commands

This project uses Bun as the runtime and package manager (developed with Bun 1.2.23):

- `bun test` - Run all tests using Bun's built-in test runner
- `bun run main.ts` - Run the main development script
- `bun run bin/cli.ts transpile <file>` - Transpile a TypeScript file to AiScript
- `bun run bin/cli.ts deploy <file> <domain> <play-id>` - Transpile and deploy to a Misskey Play

## Architecture

### Core Components

1. **Transpiler Engine** (`src/transpiler/`)
   - `main.ts`: Main transpiler class that orchestrates plugins
   - `base.ts`: Base transpiler with plugin system
   - `plugins/`: Modular plugins for different TypeScript constructs
     - `expressions/`: Handle various expression types (literals, binary ops, property access)
     - `statements/`: Handle statements (variables, loops, conditions, switch)
     - `functions.ts`: Function declaration handling
     - `typesNodes.ts`: TypeScript type node processing

2. **Bundler** (`src/bundler.ts`)
   - Handles module resolution and import/export processing
   - Creates bundled output from multiple TypeScript files
   - Manages dependency graphs and circular dependencies

3. **Stringifier** (`src/stringifier.ts`)
   - Converts AiScript AST nodes to string representation
   - Handles proper formatting and syntax generation

4. **CLI Tools** (`bin/`)
   - `cli.ts`: Main CLI with transpile and deploy commands
   - `convert.ts`: Additional conversion utilities

### Plugin Architecture

The transpiler uses a plugin-based architecture where each TypeScript language construct is handled by a specific plugin. Plugins are registered in `main.ts` and process TypeScript AST nodes to generate AiScript AST nodes.

## File Extensions and Types

- Input: `.ts` TypeScript files
- Output: `.ais` AiScript files (default output to `dist/` directory)
- Type definitions: `aiscript.d.ts` and `misskey_aiscript.d.ts`

## Testing

Tests are written using Bun's test framework with comprehensive test cases covering:
- Basic language constructs transpilation
- Edge cases and error handling
- Bundler functionality for imports/exports

Test files: `transpiler.test.ts`, `bundler.test.ts`

## Development Notes

- The project targets ESNext and uses strict TypeScript configuration
- Uses `@syuilo/aiscript` as the core AiScript library dependency
- Supports both local transpilation and direct deployment to Misskey instances
- Error handling includes detailed position information for debugging