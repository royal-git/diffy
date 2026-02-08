// Lightweight syntax highlighting — no dependencies.
// Covers the most common languages with regex-based tokenization.
// Returns an array of spans with class names for CSS styling.

export interface SyntaxSpan {
  text: string;
  className: string;
}

type Rule = [RegExp, string];

const COMMON_RULES: Rule[] = [
  // Strings (double-quoted, single-quoted, template literals)
  [/^"(?:[^"\\]|\\.)*"/, 'syn-string'],
  [/^'(?:[^'\\]|\\.)*'/, 'syn-string'],
  [/^`(?:[^`\\]|\\.)*`/, 'syn-string'],
  // Comments
  [/^\/\/.*/, 'syn-comment'],
  [/^#.*/, 'syn-comment'],
  [/^\/\*[\s\S]*?\*\//, 'syn-comment'],
  // Numbers
  [/^0x[0-9a-fA-F]+/, 'syn-number'],
  [/^0b[01]+/, 'syn-number'],
  [/^\d+\.?\d*(?:[eE][+-]?\d+)?/, 'syn-number'],
  // Operators
  [/^(?:=>|===|!==|==|!=|<=|>=|&&|\|\||<<|>>|>>>|\?\?|\?\.|\.\.\.|\*\*|[+\-*/%&|^~!<>=?:])/, 'syn-operator'],
  // Punctuation
  [/^[{}[\]();,.]/, 'syn-punct'],
];

const KEYWORDS = new Set([
  // JavaScript / TypeScript
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class',
  'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
  'enum', 'export', 'extends', 'finally', 'for', 'from', 'function',
  'get', 'if', 'implements', 'import', 'in', 'instanceof', 'interface',
  'let', 'new', 'of', 'package', 'private', 'protected', 'public',
  'return', 'set', 'static', 'super', 'switch', 'this', 'throw', 'try',
  'type', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  // Python
  'and', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import',
  'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
  // Java / C / C++ / Go / Rust
  'auto', 'bool', 'byte', 'char', 'double', 'final', 'float', 'fn',
  'func', 'goto', 'impl', 'int', 'long', 'match', 'mod', 'mut',
  'namespace', 'override', 'println', 'print', 'pub', 'ref', 'self',
  'short', 'signed', 'sizeof', 'struct', 'trait', 'union', 'unsigned',
  'use', 'using', 'virtual', 'volatile', 'where',
]);

const BUILTINS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'None', 'True', 'False', 'nil', 'self', 'Self',
  'console', 'Math', 'JSON', 'Object', 'Array', 'String',
  'Number', 'Boolean', 'Promise', 'Map', 'Set', 'Error',
  'require', 'module', 'exports', '__dirname', '__filename',
]);

const IDENT_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*/;
const WHITESPACE_RE = /^\s+/;

export function highlightLine(line: string | null | undefined): SyntaxSpan[] {
  const spans: SyntaxSpan[] = [];
  const text = line ?? '';
  let pos = 0;

  while (pos < text.length) {
    const rest = text.slice(pos);

    // Whitespace
    const wsMatch = rest.match(WHITESPACE_RE);
    if (wsMatch) {
      spans.push({ text: wsMatch[0], className: '' });
      pos += wsMatch[0].length;
      continue;
    }

    // Try common rules
    let matched = false;
    for (const [regex, className] of COMMON_RULES) {
      const m = rest.match(regex);
      if (m) {
        spans.push({ text: m[0], className });
        pos += m[0].length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Identifiers / keywords
    const identMatch = rest.match(IDENT_RE);
    if (identMatch) {
      const word = identMatch[0];
      let className = '';
      if (KEYWORDS.has(word)) {
        className = 'syn-keyword';
      } else if (BUILTINS.has(word)) {
        className = 'syn-builtin';
      } else if (rest[word.length] === '(') {
        className = 'syn-function';
      } else if (word[0] === word[0].toUpperCase() && /[a-z]/.test(word)) {
        className = 'syn-type';
      }
      spans.push({ text: word, className });
      pos += word.length;
      continue;
    }

    // Decorators / annotations
    if (rest[0] === '@') {
      const decorMatch = rest.match(/^@[a-zA-Z_][a-zA-Z0-9_.]*/);
      if (decorMatch) {
        spans.push({ text: decorMatch[0], className: 'syn-decorator' });
        pos += decorMatch[0].length;
        continue;
      }
    }

    // Fallback: single char
    spans.push({ text: rest[0], className: '' });
    pos++;
  }

  return mergeSpans(spans);
}

function mergeSpans(spans: SyntaxSpan[]): SyntaxSpan[] {
  if (spans.length === 0) return spans;
  const merged: SyntaxSpan[] = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    if (last.className === spans[i].className) {
      last.text += spans[i].text;
    } else {
      merged.push(spans[i]);
    }
  }
  return merged;
}

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    cs: 'csharp', swift: 'swift', kt: 'kotlin',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    css: 'css', scss: 'css', html: 'html', xml: 'xml',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', sql: 'sql', graphql: 'graphql',
  };
  return map[ext] || 'text';
}
