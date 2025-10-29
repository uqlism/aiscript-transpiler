/**
 * AiScript ASTをAiScriptコード文字列に変換するクラス
 */
export class AiScriptStringifier {
    indentStr = "  ";
    /**
     * AiScript ASTをAiScriptコード文字列に変換する
     */
    static stringify(nodes) {
        const stringifier = new AiScriptStringifier();
        return stringifier.stringifyNodes(nodes, 0);
    }
    stringifyNodes(nodes, indentLevel) {
        return nodes
            .map((node) => this.stringifyTopLevelNode(node, indentLevel))
            .join("\n");
    }
    stringifyTopLevelNode(node, indentLevel) {
        return this.stringifyNode(node, true, indentLevel);
    }
    getIndent(indentLevel) {
        return this.indentStr.repeat(indentLevel);
    }
    stringifyNode(node, blockEval, indentLevel) {
        switch (node.type) {
            case "def":
                return this.stringifyDefinition(node, indentLevel);
            case "fn":
                return this.stringifyFn(node, indentLevel);
            case "call":
                return this.stringifyCall(node, indentLevel);
            case "if":
                return this.stringifyIf(node, indentLevel);
            case "match":
                return this.stringifyMatch(node, indentLevel);
            case "loop":
                return this.stringifyLoop(node, indentLevel);
            case "each":
                return this.stringifyEach(node, indentLevel);
            case "block":
                return this.stringifyBlock(node, blockEval, indentLevel);
            case "assign":
                return this.stringifyAssign(node, indentLevel);
            case "addAssign":
                return this.stringifyAddAssign(node, indentLevel);
            case "subAssign":
                return this.stringifySubAssign(node, indentLevel);
            case "return":
                return this.stringifyReturn(node, indentLevel);
            case "break":
                return this.stringifyBreak(node);
            case "continue":
                return this.stringifyContinue(node);
            // 式の場合
            case "identifier":
                return this.stringifyIdentifier(node);
            case "num":
                return this.stringifyNumber(node);
            case "str":
                return this.stringifyString(node);
            case "bool":
                return this.stringifyBoolean(node);
            case "null":
                return this.stringifyNull(node);
            case "arr":
                return this.stringifyArray(node, indentLevel);
            case "obj":
                return this.stringifyObject(node, indentLevel);
            case "prop":
                return this.stringifyProperty(node, indentLevel);
            case "index":
                return this.stringifyIndex(node, indentLevel);
            case "not":
                return this.stringifyNot(node, indentLevel);
            case "plus":
                return this.stringifyPlus(node, indentLevel);
            case "minus":
                return this.stringifyMinus(node, indentLevel);
            case "and":
                return this.stringifyAnd(node, indentLevel);
            case "or":
                return this.stringifyOr(node, indentLevel);
            case "add":
                return this.stringifyAdd(node, indentLevel);
            case "sub":
                return this.stringifySub(node, indentLevel);
            case "mul":
                return this.stringifyMul(node, indentLevel);
            case "div":
                return this.stringifyDiv(node, indentLevel);
            case "rem":
                return this.stringifyRem(node, indentLevel);
            case "pow":
                return this.stringifyPow(node, indentLevel);
            case "eq":
                return this.stringifyEq(node, indentLevel);
            case "neq":
                return this.stringifyNeq(node, indentLevel);
            case "lt":
                return this.stringifyLt(node, indentLevel);
            case "lteq":
                return this.stringifyLteq(node, indentLevel);
            case "gt":
                return this.stringifyGt(node, indentLevel);
            case "gteq":
                return this.stringifyGteq(node, indentLevel);
            case "tmpl":
                return this.stringifyTemplate(node, 0); // テンプレートリテラル内はindentLevel=0
            default:
                throw new Error(`サポートされていないノードタイプです: ${node.type}`);
        }
    }
    stringifyExpression(node, indentLevel) {
        return this.stringifyNode(node, true, indentLevel);
    }
    stringifyStatement(node, blockEval, indentLevel) {
        if (node.type === "block") {
            return this.stringifyBlock(node, blockEval, indentLevel);
        }
        else {
            return this.stringifyNode(node, blockEval, indentLevel);
        }
    }
    // Core methods
    stringifyDefinition(node, indentLevel) {
        // 関数定義の場合は @name(params) { ... } 形式で出力
        if (node.expr.type === "fn" && node.dest.type === "identifier") {
            const fnNode = node.expr;
            const name = node.dest.name;
            const params = fnNode.params
                ?.map((param) => {
                let paramStr = this.stringifyExpression(param.dest, indentLevel);
                if (param.optional) {
                    paramStr += "?";
                }
                if (param.default) {
                    paramStr += ` = ${this.stringifyExpression(param.default, indentLevel)}`;
                }
                return paramStr;
            })
                .join(", ") || "";
            const body = fnNode.children
                ?.map((child) => this.getIndent(indentLevel + 1) +
                this.stringifyNode(child, true, indentLevel + 1))
                .join("\n") || "";
            if (body) {
                return `@${name}(${params}) {\n${body}\n${this.getIndent(indentLevel)}}`;
            }
            else {
                return `@${name}(${params}) {}`;
            }
        }
        // 通常の変数定義
        const keyword = node.mut ? "var" : "let";
        const dest = this.stringifyExpression(node.dest, indentLevel);
        const expr = this.stringifyExpression(node.expr, indentLevel);
        return `${keyword} ${dest} = ${expr}`;
    }
    stringifyFn(node, indentLevel) {
        const params = node.params
            ?.map((param) => {
            let paramStr = this.stringifyExpression(param.dest, indentLevel);
            if (param.optional) {
                paramStr += "?";
            }
            if (param.default) {
                paramStr += ` = ${this.stringifyExpression(param.default, indentLevel)}`;
            }
            return paramStr;
        })
            .join(", ") || "";
        if (node.children.length === 0) {
            return `@(${params}) {}`;
        }
        const childIndent = this.getIndent(indentLevel + 1);
        const children = node.children
            .map((child) => {
            const childStr = this.stringifyNode(child, true, indentLevel + 1);
            return childIndent + childStr;
        })
            .join("\n");
        return `@(${params}) {\n${children}\n${this.getIndent(indentLevel)}}`;
    }
    stringifyBlock(node, blockEval, indentLevel) {
        if (node.statements.length === 0) {
            return blockEval ? "eval {}" : "{}";
        }
        const childIndent = this.getIndent(indentLevel + 1);
        const statements = node.statements
            .map((stmt) => {
            return childIndent + this.stringifyNode(stmt, true, indentLevel + 1);
        })
            .join("\n");
        const prefix = blockEval ? "eval " : "";
        return `${prefix}{\n${statements}\n${this.getIndent(indentLevel)}}`;
    }
    stringifyArray(node, indentLevel) {
        if (node.value.length === 0) {
            return "[]";
        }
        const elements = node.value.map((elem) => this.stringifyExpression(elem, indentLevel + 1));
        const hasMultilineElements = elements.some((elem) => elem.includes("\n"));
        if (hasMultilineElements) {
            return `[\n${elements.map((elem) => `${this.getIndent(indentLevel + 1)}${elem}`).join(",\n")}\n${this.getIndent(indentLevel)}]`;
        }
        return `[${elements.join(", ")}]`;
    }
    stringifyObject(node, indentLevel) {
        if (node.value.size === 0) {
            return "({})";
        }
        const entries = [];
        for (const [key, value] of node.value.entries()) {
            const keyStr = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
                ? key
                : JSON.stringify(key);
            entries.push(`${keyStr}: ${this.stringifyExpression(value, indentLevel + 1)}`);
        }
        const hasMultilineEntries = entries.some((entry) => entry.includes("\n"));
        if (hasMultilineEntries) {
            return `({\n${entries.map((x) => `${this.getIndent(indentLevel + 1)}${x}`).join(",\n")}\n${this.getIndent(indentLevel)}})`;
        }
        return `({${entries.join(", ")}})`;
    }
    stringifyTemplate(node, _indentLevel) {
        let result = "`";
        for (const element of node.tmpl) {
            if (element.type === "str") {
                // テンプレートリテラル内では改行を含むコンテンツをそのまま保持
                let content = element.value;
                // エスケープは常に適用（テンプレートリテラル内の特殊文字）
                content = content.replace(/`/g, "\\`").replace(/{/g, "\\{");
                result += content;
            }
            else {
                // テンプレートリテラル内の式を処理（インデントレベル0で処理）
                result += `{${this.stringifyNode(element, true, 0)}}`;
            }
        }
        result += "`";
        return result;
    }
    // Simple expression methods
    stringifyCall(node, indentLevel) {
        const target = this.stringifyExpression(node.target, indentLevel);
        const args = node.args
            .map((arg) => this.stringifyExpression(arg, indentLevel))
            .join(", ");
        return `${target}(${args})`;
    }
    stringifyIf(node, indentLevel) {
        let result = `if ${this.stringifyExpression(node.cond, indentLevel)} ${this.stringifyStatement(node.then, false, indentLevel)}`;
        if (node.elseif && node.elseif.length > 0) {
            for (const elif of node.elseif) {
                result += ` elif ${this.stringifyExpression(elif.cond, indentLevel)} ${this.stringifyStatement(elif.then, false, indentLevel)}`;
            }
        }
        if (node.else) {
            result += ` else ${this.stringifyStatement(node.else, false, indentLevel)}`;
        }
        return result;
    }
    stringifyMatch(node, indentLevel) {
        const about = this.stringifyExpression(node.about, indentLevel);
        const cases = node.qs.map((q) => `case ${this.stringifyExpression(q.q, indentLevel)} => ${this.stringifyNode(q.a, false, indentLevel)}`);
        const defaultCase = node.default
            ? `default => ${this.stringifyNode(node.default, false, indentLevel)}`
            : "";
        const allCases = [...cases];
        if (defaultCase) {
            allCases.push(defaultCase);
        }
        return `match (${about}) { ${allCases.join(", ")} }`;
    }
    stringifyLoop(node, indentLevel) {
        const statements = node.statements
            .map((stmt) => this.stringifyNode(stmt, true, indentLevel + 1))
            .map((x) => `${this.getIndent(indentLevel + 1)}${x}`)
            .join("\n");
        if (statements.includes("\n")) {
            return `loop {\n${statements}\n${this.getIndent(indentLevel)}}`;
        }
        return `loop { ${statements} }`;
    }
    stringifyEach(node, indentLevel) {
        const varName = this.stringifyExpression(node.var, indentLevel);
        const items = this.stringifyExpression(node.items, indentLevel);
        const body = this.stringifyStatement(node.for, false, indentLevel);
        return `each let ${varName}, ${items} ${body}`;
    }
    // Assignment methods
    stringifyAssign(node, indentLevel) {
        const dest = this.stringifyExpression(node.dest, indentLevel);
        const expr = this.stringifyExpression(node.expr, indentLevel);
        return `${dest} = ${expr}`;
    }
    stringifyAddAssign(node, indentLevel) {
        const dest = this.stringifyExpression(node.dest, indentLevel);
        const expr = this.stringifyExpression(node.expr, indentLevel);
        return `${dest} += ${expr}`;
    }
    stringifySubAssign(node, indentLevel) {
        const dest = this.stringifyExpression(node.dest, indentLevel);
        const expr = this.stringifyExpression(node.expr, indentLevel);
        return `${dest} -= ${expr}`;
    }
    stringifyReturn(node, indentLevel) {
        const expr = this.stringifyExpression(node.expr, indentLevel);
        return `return ${expr}`;
    }
    stringifyBreak(_node) {
        return "break";
    }
    stringifyContinue(_node) {
        return "continue";
    }
    // Basic literals
    stringifyIdentifier(node) {
        return node.name;
    }
    stringifyNumber(node) {
        if (node.value < 0) {
            return `(${node.value.toString()})`;
        }
        return node.value.toString();
    }
    stringifyString(node) {
        const escaped = node.value
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t");
        return `"${escaped}"`;
    }
    stringifyBoolean(node) {
        return node.value ? "true" : "false";
    }
    stringifyNull(_node) {
        return "null";
    }
    // Access methods
    stringifyProperty(node, indentLevel) {
        const target = this.stringifyExpression(node.target, indentLevel);
        return `${target}.${node.name}`;
    }
    stringifyIndex(node, indentLevel) {
        const target = this.stringifyExpression(node.target, indentLevel);
        const index = this.stringifyExpression(node.index, indentLevel);
        return `${target}[${index}]`;
    }
    // Unary operators
    stringifyNot(node, indentLevel) {
        const expr = this.stringifyExpression(node.expr, indentLevel);
        return `(!${expr})`;
    }
    stringifyPlus(node, indentLevel) {
        const expr = this.stringifyExpression(node.expr, indentLevel);
        return `(+${expr})`;
    }
    stringifyMinus(node, indentLevel) {
        const expr = this.stringifyExpression(node.expr, indentLevel);
        return `(-${expr})`;
    }
    // Binary operators
    stringifyAnd(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} && ${right})`;
    }
    stringifyOr(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} || ${right})`;
    }
    stringifyAdd(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} + ${right})`;
    }
    stringifySub(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} - ${right})`;
    }
    stringifyMul(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} * ${right})`;
    }
    stringifyDiv(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} / ${right})`;
    }
    stringifyRem(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} % ${right})`;
    }
    stringifyPow(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} ^ ${right})`;
    }
    // Comparison operators
    stringifyEq(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} == ${right})`;
    }
    stringifyNeq(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} != ${right})`;
    }
    stringifyLt(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} < ${right})`;
    }
    stringifyLteq(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} <= ${right})`;
    }
    stringifyGt(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} > ${right})`;
    }
    stringifyGteq(node, indentLevel) {
        const left = this.stringifyExpression(node.left, indentLevel);
        const right = this.stringifyExpression(node.right, indentLevel);
        return `(${left} >= ${right})`;
    }
}
//# sourceMappingURL=stringifier.js.map