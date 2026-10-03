import {
  detectLanguage,
  formatConfidence,
  MIN_DETECTION_CONFIDENCE,
} from "./language-detection";
import { PLAIN_TEXT_LANGUAGE } from "./languages";

const JS_SNIPPET = `
function calculateTotal(items) {
  const total = items.reduce((sum, item) => sum + item.price, 0);
  console.log("Total:", total);
  return total;
}

module.exports = { calculateTotal };
`;

const TS_SNIPPET = `
interface User {
  id: number;
  name: string;
  email: string;
}

export function greet(user: User): string {
  return "Hello, " + user.name;
}

const isAdmin: boolean = false;
`;

const PY_SNIPPET = `
import os
from datetime import datetime

def process(path):
    """Load and process the file."""
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return datetime.now()

class Handler:
    def handle(self):
        print("done")
`;

const CPP_SNIPPET = `
#include <iostream>
#include <vector>

int main() {
    std::vector<int> values = {1, 2, 3};
    for (int v : values) {
        std::cout << v << std::endl;
    }
    return 0;
}
`;

const KOTLIN_SNIPPET = `
fun main() {
    val names = listOf("Alice", "Bob")
    names.forEach { println(it) }
}
`;

const MIXED_SNIPPET = `
function greet() {
  console.log("hello");
}

def farewell():
    print("bye")
`;

describe("detectLanguage", () => {
  it("detects JavaScript from a pasted snippet", () => {
    const result = detectLanguage(JS_SNIPPET);
    expect(result.language).toBe("javascript");
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_DETECTION_CONFIDENCE);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("detects TypeScript from a pasted snippet", () => {
    const result = detectLanguage(TS_SNIPPET);
    expect(result.language).toBe("typescript");
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_DETECTION_CONFIDENCE);
  });

  it("detects Python from a pasted snippet", () => {
    const result = detectLanguage(PY_SNIPPET);
    expect(result.language).toBe("python");
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_DETECTION_CONFIDENCE);
  });

  it("detects C++ from a pasted snippet", () => {
    const result = detectLanguage(CPP_SNIPPET);
    expect(result.language).toBe("cpp");
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_DETECTION_CONFIDENCE);
  });

  it("detects HTML", () => {
    const html = `<!DOCTYPE html>
<html>
  <body>
    <div class="container">
      <p>Hello</p>
    </div>
  </body>
</html>`;
    expect(detectLanguage(html).language).toBe("html");
  });

  it("detects SQL", () => {
    const sql = `SELECT u.id, u.name
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.active = true
ORDER BY u.name;`;
    expect(detectLanguage(sql).language).toBe("sql");
  });

  it("detects Bash", () => {
    const bash = `#!/usr/bin/env bash
set -euo pipefail
if [ -f "$1" ]; then
  echo "exists"
fi`;
    expect(detectLanguage(bash).language).toBe("bash");
  });

  it("falls back to plain text for unsupported languages", () => {
    const result = detectLanguage(KOTLIN_SNIPPET);
    expect(result.language).toBe(PLAIN_TEXT_LANGUAGE);
    expect(result.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
  });

  it("falls back to plain text for mixed-language snippets", () => {
    const result = detectLanguage(MIXED_SNIPPET);
    expect(result.language).toBe(PLAIN_TEXT_LANGUAGE);
    expect(result.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
  });

  it("falls back to plain text for incomplete snippets", () => {
    const result = detectLanguage("function greet(");
    expect(result.language).toBe(PLAIN_TEXT_LANGUAGE);
    expect(result.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
  });

  it("falls back to plain text for very short fragments", () => {
    expect(detectLanguage("const x = 1").language).toBe(PLAIN_TEXT_LANGUAGE);
  });

  it("falls back to plain text for empty or whitespace-only input", () => {
    expect(detectLanguage("")).toEqual({
      language: PLAIN_TEXT_LANGUAGE,
      confidence: 0,
    });
    expect(detectLanguage("   \n\t ").language).toBe(PLAIN_TEXT_LANGUAGE);
  });

  it("always returns a confidence between 0 and 1", () => {
    const samples = [JS_SNIPPET, TS_SNIPPET, PY_SNIPPET, KOTLIN_SNIPPET, "x", ""];
    for (const sample of samples) {
      const { confidence } = detectLanguage(sample);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("formatConfidence", () => {
  it("renders confidence as a whole-number percentage", () => {
    expect(formatConfidence(0.914)).toBe("91%");
    expect(formatConfidence(0.5)).toBe("50%");
    expect(formatConfidence(0)).toBe("0%");
  });
});
