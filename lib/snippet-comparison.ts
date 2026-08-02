export interface ComparisonSnippet {
  id: string;
  title: string;
  code: string;
  language: string;
  created_at: string;
  owner_wallet_address?: string | null;
  contributor?: string | null;
}

export type DiffKind = "equal" | "changed" | "added" | "removed";

export interface DiffRow {
  kind: DiffKind;
  left?: string;
  right?: string;
  leftLine?: number;
  rightLine?: number;
}

export interface CodeToken {
  value: string;
  kind: "plain" | "keyword" | "string" | "number" | "comment";
}

const KEYWORDS: Record<string, Set<string>> = {
  javascript: new Set(["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "new", "import", "export", "from", "async", "await", "try", "catch", "throw"]),
  typescript: new Set(["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "interface", "type", "enum", "implements", "extends", "public", "private", "import", "export", "from", "async", "await"]),
  python: new Set(["def", "return", "if", "elif", "else", "for", "while", "class", "import", "from", "as", "try", "except", "raise", "with", "lambda", "async", "await", "True", "False", "None"]),
  go: new Set(["package", "import", "func", "return", "if", "else", "for", "range", "type", "struct", "interface", "go", "defer", "var", "const"]),
  rust: new Set(["fn", "let", "mut", "pub", "impl", "trait", "struct", "enum", "match", "if", "else", "for", "while", "loop", "use", "mod", "return", "async", "await"]),
};

const C_STYLE = new Set(["java", "csharp", "cpp", "php"]);
const C_KEYWORDS = new Set(["class", "public", "private", "protected", "static", "void", "int", "string", "bool", "new", "return", "if", "else", "for", "while", "try", "catch", "throw", "namespace", "using"]);

export function buildSideBySideDiff(leftCode: string, rightCode: string): DiffRow[] {
  const left = leftCode.split("\n");
  const right = rightCode.split("\n");
  const table = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  let leftLine = 1;
  let rightLine = 1;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      rows.push({ kind: "equal", left: left[i], right: right[j], leftLine, rightLine });
      i += 1; j += 1; leftLine += 1; rightLine += 1;
    } else if (
      i < left.length && j < right.length &&
      table[i + 1][j] === table[i][j + 1]
    ) {
      rows.push({ kind: "changed", left: left[i], right: right[j], leftLine, rightLine });
      i += 1; j += 1; leftLine += 1; rightLine += 1;
    } else if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) {
      rows.push({ kind: "added", right: right[j], rightLine });
      j += 1; rightLine += 1;
    } else {
      rows.push({ kind: "removed", left: left[i], leftLine });
      i += 1; leftLine += 1;
    }
  }
  return rows;
}

export function getMetadataDifferences(left: ComparisonSnippet, right: ComparisonSnippet) {
  return {
    language: left.language.toLowerCase() !== right.language.toLowerCase(),
    createdAt: new Date(left.created_at).getTime() !== new Date(right.created_at).getTime(),
    contributor: getContributor(left) !== getContributor(right),
  };
}

export function getContributor(snippet: ComparisonSnippet) {
  return snippet.contributor || snippet.owner_wallet_address || "Unknown contributor";
}

export function tokenizeLine(line: string, language: string): CodeToken[] {
  const keywords = KEYWORDS[language.toLowerCase()] ||
    (C_STYLE.has(language.toLowerCase()) ? C_KEYWORDS : new Set<string>());
  const commentMarker = ["python", "ruby"].includes(language.toLowerCase()) ? "#" : "//";
  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
  const commentAt = line.indexOf(commentMarker);
  const code = commentAt >= 0 ? line.slice(0, commentAt) : line;
  const tokens: CodeToken[] = [];
  let cursor = 0;

  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ value: code.slice(cursor, index), kind: "plain" });
    const value = match[0];
    const kind: CodeToken["kind"] =
      value.startsWith('"') || value.startsWith("'") ? "string" :
      /^\d/.test(value) ? "number" :
      keywords.has(value) ? "keyword" : "plain";
    tokens.push({ value, kind });
    cursor = index + value.length;
  }
  if (cursor < code.length) tokens.push({ value: code.slice(cursor), kind: "plain" });
  if (commentAt >= 0) tokens.push({ value: line.slice(commentAt), kind: "comment" });
  return tokens.length ? tokens : [{ value: line, kind: "plain" }];
}
