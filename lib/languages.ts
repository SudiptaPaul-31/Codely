export const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "csharp",
  "cpp",
  "go",
  "rust",
  "php",
  "ruby",
  "sql",
  "html",
  "css",
  "bash",
  "plaintext",
];

export const PLAIN_TEXT_LANGUAGE = "plaintext";

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  csharp: "C#",
  cpp: "C++",
  go: "Go",
  rust: "Rust",
  php: "PHP",
  ruby: "Ruby",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  bash: "Bash",
  plaintext: "Plain Text",
};

export function getLanguageLabel(language: string): string {
  const key = (language || "").toLowerCase();
  if (LANGUAGE_LABELS[key]) return LANGUAGE_LABELS[key];
  if (!key) return "Plain Text";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function isKnownLanguage(language: string): boolean {
  return LANGUAGES.includes((language || "").toLowerCase());
}
