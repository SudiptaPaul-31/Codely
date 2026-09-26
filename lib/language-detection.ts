import { PLAIN_TEXT_LANGUAGE } from "./languages";

/**
 * Heuristic pasted-code language detection.
 *
 * Each language has a set of weighted signals (regular expressions). The
 * detector scores every language, then converts the top two scores into a
 * confidence value. When the winning score is weak, or a second language
 * scores close behind (mixed code), the result falls back to plain text so
 * the editor never suggests a language it is not reasonably sure about.
 */

export interface DetectionResult {
  /** Detected language id, or "plaintext" when confidence is too low. */
  language: string;
  /** Confidence in the range [0, 1]. */
  confidence: number;
}

interface Signal {
  pattern: RegExp;
  weight: number;
}

/** Minimum combined score before a language can win at all. */
export const MIN_DETECTION_SCORE = 3;

/** Below this confidence the suggestion is suppressed (plain-text fallback). */
export const MIN_DETECTION_CONFIDENCE = 0.5;

const signal = (source: string, weight: number, flags = ""): Signal => ({
  pattern: new RegExp(source, flags),
  weight,
});

const SIGNALS: Record<string, Signal[]> = {
  javascript: [
    signal("\\b(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=", 2),
    signal("\\bfunction\\s+[A-Za-z_$][\\w$]*\\s*\\(", 2),
    signal("=>", 1.5),
    signal("\\bconsole\\.(?:log|error|warn|info)\\s*\\(", 2),
    signal("\\brequire\\s*\\(", 2),
    signal("module\\.exports|exports\\.", 2.5),
    signal("\\bdocument\\.(?:getElementById|querySelector|addEventListener)", 2.5),
    signal("\\bnew\\s+Promise\\b|\\bawait\\b", 1.5),
    signal("\\btypeof\\s+", 1.5),
    signal("\\bwindow\\.", 1),
    signal("^import\\s+.+\\s+from\\s+[\"']", 2, "m"),
  ],
  typescript: [
    signal("\\binterface\\s+[A-Za-z_$][\\w$]*\\s*(?:extends\\s+[^{]+)?\\{", 4),
    signal("\\btype\\s+[A-Za-z_$][\\w$]*\\s*=", 4),
    signal("\\benum\\s+[A-Za-z_$][\\w$]*\\s*\\{", 4),
    signal(":\\s*(?:string|number|boolean|any|unknown|void|never|object)\\b", 3),
    signal("\\b(?:public|private|protected|readonly)\\s+[A-Za-z_$]", 3),
    signal("\\b(?:import|export)\\s+type\\s+", 4),
    signal("\\)\\s*:\\s*(?:string|number|boolean|void|Promise<)", 3),
    signal("\\bimplements\\s+[A-Za-z_$]", 3),
    signal("\\bas\\s+const\\b", 3),
    signal("\\bdeclare\\s+(?:const|let|var|function)\\b", 4),
  ],
  python: [
    signal("^\\s*def\\s+[A-Za-z_]\\w*\\s*\\(", 3.5, "m"),
    signal("^\\s*class\\s+[A-Za-z_]\\w*\\s*(?:\\([^)]*\\))?\\s*:", 3.5, "m"),
    signal("^\\s*from\\s+[\\w.]+\\s+import\\s+", 3.5, "m"),
    signal("^\\s*import\\s+\\w+(?:\\s*,\\s*\\w+)*\\s*$", 2.5, "m"),
    signal("if\\s+__name__\\s*==\\s*[\"']__main__[\"']", 4),
    signal("\\b(?:elif|except)\\b[^\\n]*:", 3),
    signal("^\\s*(?:if|for|while|try|else|with)\\b[^\\n]*:\\s*$", 2.5, "m"),
    signal('"""', 3),
    signal("\\bprint\\s*\\(", 1.5),
    signal("\\bself\\b", 1.5),
    signal("\\blambda\\s+[^:\\n]+:", 2),
    signal('f["\'][^"\\n]*\\{[^}]*\\}[^"\\n]*["\']', 3),
    signal("^\\s*@[A-Za-z_]\\w*\\s*$", 2, "m"),
  ],
  cpp: [
    signal("#include\\s*[<\"]", 3.5),
    signal("\\bstd::", 3),
    signal("\\b(?:cout|cin|endl)\\b", 3),
    signal("\\bint\\s+main\\s*\\(", 2.5),
    signal("\\b(?:vector|string|map)\\s*<", 2),
    signal("\\bnamespace\\s+\\w+\\s*\\{", 2.5),
    signal("\\btemplate\\s*<", 2),
    signal("\\b(?:printf|scanf)\\s*\\(", 1.5),
  ],
  java: [
    signal("\\bimport\\s+java\\.", 4),
    signal("System\\.(?:out|err)\\.print", 4),
    signal("\\bpublic\\s+static\\s+void\\s+main\\b", 3),
    signal("@Override", 2.5),
    signal("\\bpublic\\s+(?:class|interface|enum)\\s+\\w+", 2),
    signal("\\bextends\\s+\\w+\\s*\\{", 2),
  ],
  csharp: [
    signal("^\\s*using\\s+System", 4, "m"),
    signal("Console\\.WriteLine", 4),
    signal("\\bnamespace\\s+[\\w.]+\\s*\\{", 2.5),
    signal("\\bpublic\\s+(?:class|struct|interface)\\s+\\w+", 2),
    signal("\\b(?:async\\s+Task|await\\s+)", 1.5),
    signal("\\bvar\\s+\\w+\\s*=\\s*new\\b", 2),
  ],
  go: [
    signal("^\\s*package\\s+\\w+", 3, "m"),
    signal("^\\s*func\\s+\\w+\\s*\\(", 3, "m"),
    signal("fmt\\.(?:Print|Sprintf|Printf)", 3.5),
    signal(":=", 2.5),
    signal("^\\s*import\\s+\"", 3, "m"),
    signal("\\b(?:defer|go\\s+func)\\b", 2.5),
    signal("\\bfunc\\s*\\(", 2),
  ],
  rust: [
    signal("\\blet\\s+mut\\s+", 3.5),
    signal("println!\\s*\\(", 3.5),
    signal("#\\[derive\\s*\\(", 3.5),
    signal("^\\s*use\\s+std::", 3.5, "m"),
    signal("\\bfn\\s+\\w+\\s*\\(", 2.5),
    signal("\\bimpl\\s+\\w+", 3),
    signal("\\bmod\\s+\\w+\\s*\\{", 2),
  ],
  php: [
    signal("<\\?php", 4.5),
    signal("\\bpublic\\s+function\\b", 2.5),
    signal("\\barray\\s*\\(", 2.5),
    signal("\\becho\\s+[\"'$]", 2),
    signal("\\$\\w+\\s*(?:->|::)\\s*\\w+", 2),
    signal("\\b\\w+\\s*->\\s*\\w+\\s*\\(", 1.5),
  ],
  ruby: [
    signal("\\bputs\\s+", 3),
    signal("\\brequire\\s+['\"]", 3),
    signal("\\bdo\\s*\\|", 2.5),
    signal("\\battr_(?:accessor|reader|writer)\\b", 3),
    signal("^\\s*def\\s+\\w+[?!]?(?:\\([^)]*\\))?\\s*$", 2.5, "m"),
    signal("^\\s*end\\s*$", 1.5, "m"),
    signal("@[A-Za-z_]\\w*", 1),
  ],
  sql: [
    signal("\\bSELECT\\b[\\s\\S]*\\bFROM\\b", 4, "i"),
    signal("\\bINSERT\\s+INTO\\b", 3.5, "i"),
    signal("\\bCREATE\\s+TABLE\\b", 3.5, "i"),
    signal("\\bUPDATE\\b[\\s\\S]*\\bSET\\b", 3.5, "i"),
    signal("\\b(?:LEFT|RIGHT|INNER|OUTER|CROSS)?\\s*JOIN\\b", 2.5, "i"),
    signal("\\bGROUP\\s+BY\\b|\\bORDER\\s+BY\\b", 2.5, "i"),
    signal("\\bWHERE\\b", 1.5, "i"),
  ],
  html: [
    signal("<!DOCTYPE\\s+html>", 4, "i"),
    signal("<html[\\s>]", 3.5, "i"),
    signal("</(?:div|span|body|html|p|section|a|ul|li)>", 3, "i"),
    signal("<(?:div|span|p|a|section|img|input|button|form|ul|li)\\b[^>]*>", 2.5, "i"),
    signal("</\\w+>", 2, "i"),
    signal("<(?:meta|link|title|script|style)\\b", 2.5, "i"),
  ],
  css: [
    signal("@media[^{]*\\{", 3.5),
    signal(":root\\s*\\{|:root", 3),
    signal("\\}\\s*\\{", 2),
    signal("\\b(?:color|background|margin|padding|font-size|display|border)\\s*:\\s*[^;{}]+;", 2.5),
    signal("^[.#]?[\\w-]+(?:\\.[\\w-]+|:[\\w-]+(?:\\([^)]*\\))?)?\\s*\\{", 2, "m"),
  ],
  bash: [
    signal("^#!.*\\b(?:ba)?sh\\b", 4, "m"),
    signal("\\bif\\s+\\[\\s+", 3.5),
    signal("^\\s*fi\\s*$", 2.5, "m"),
    signal("^\\s*(?:export|alias)\\s+\\w+\\s*=", 3, "m"),
    signal("\\becho\\s+[\"'$]", 2),
    signal("\\$\\(", 2),
    signal("^\\s*\\w+\\(\\)\\s*\\{", 2, "m"),
    signal("^\\s*elif\\b", 3, "m"),
  ],
};

interface ScoredLanguage {
  language: string;
  score: number;
}

function scoreLanguages(code: string): ScoredLanguage[] {
  return Object.entries(SIGNALS)
    .map(([language, signals]) => {
      let score = 0;
      for (const { pattern, weight } of signals) {
        if (pattern.test(code)) {
          score += weight;
          pattern.lastIndex = 0;
        }
      }
      return { language, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Detect the most likely language of a code snippet.
 *
 * Returns `language: "plaintext"` with a low confidence whenever the snippet
 * is empty, too short, mixes multiple languages, or matches nothing the
 * detector knows — callers should treat that as "no suggestion".
 */
export function detectLanguage(code: string): DetectionResult {
  if (typeof code !== "string" || code.trim().length === 0) {
    return { language: PLAIN_TEXT_LANGUAGE, confidence: 0 };
  }

  const ranked = scoreLanguages(code);
  const [first, second] = ranked;
  const runnerUp = second?.score ?? 0;

  if (!first || first.score < MIN_DETECTION_SCORE) {
    return {
      language: PLAIN_TEXT_LANGUAGE,
      confidence: Math.min(0.45, first ? first.score / (MIN_DETECTION_SCORE * 2) : 0),
    };
  }

  // Strength of the winning score: more distinct signals, higher confidence.
  const strength = Math.min(1, (first.score + 1) / (first.score + 3));
  // Separation from the runner-up: mixed snippets score close together.
  const margin = (first.score - runnerUp) / first.score;
  let confidence = strength * (0.45 + 0.55 * margin);
  // A real competing language lowers trust in the winner.
  if (runnerUp >= MIN_DETECTION_SCORE) confidence *= 0.85;

  if (confidence < MIN_DETECTION_CONFIDENCE) {
    return { language: PLAIN_TEXT_LANGUAGE, confidence: Number(confidence.toFixed(3)) };
  }

  return { language: first.language, confidence: Number(confidence.toFixed(3)) };
}

/** Render a confidence value as a whole-number percentage (e.g. "91%"). */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
