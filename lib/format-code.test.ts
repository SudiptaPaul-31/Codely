import {
  formatCode,
  formatPython,
  getFormatterId,
  isFormattingAvailable,
  MAX_FORMAT_LENGTH,
} from "./format-code";

describe("formatter selection", () => {
  it("maps JavaScript and TypeScript to Prettier", () => {
    expect(getFormatterId("javascript")).toBe("prettier");
    expect(getFormatterId("typescript")).toBe("prettier");
  });

  it("maps HTML and CSS to Prettier", () => {
    expect(getFormatterId("html")).toBe("prettier");
    expect(getFormatterId("css")).toBe("prettier");
  });

  it("maps Python to the Python formatter", () => {
    expect(getFormatterId("python")).toBe("python");
  });

  it("maps other common languages to conservative whitespace cleanup", () => {
    for (const language of ["java", "csharp", "cpp", "go", "rust", "php", "ruby", "sql", "bash"]) {
      expect(getFormatterId(language)).toBe("whitespace");
    }
  });

  it("never formats plain text or unknown languages", () => {
    expect(getFormatterId("plaintext")).toBe("none");
    expect(getFormatterId("")).toBe("none");
    expect(getFormatterId("kotlin")).toBe("none");
    expect(isFormattingAvailable("plaintext")).toBe(false);
    expect(isFormattingAvailable("python")).toBe(true);
  });
});

describe("formatCode", () => {
  it("formats JavaScript with Prettier", async () => {
    const messy = "const x=1;function  f( a ){return   a+1}";
    const result = await formatCode(messy, "javascript");
    expect(result.ok).toBe(true);
    expect(result.formatter).toBe("prettier");
    expect(result.changed).toBe(true);
    expect(result.code).toBe("const x = 1;\nfunction f(a) {\n  return a + 1;\n}\n");
  });

  it("formats TypeScript with Prettier", async () => {
    const messy = 'interface User{name:string;age:number}\nconst u:User={name:"A",age:1};';
    const result = await formatCode(messy, "typescript");
    expect(result.ok).toBe(true);
    expect(result.formatter).toBe("prettier");
    expect(result.changed).toBe(true);
    expect(result.code).toContain("interface User {\n  name: string;\n  age: number;\n}");
    expect(result.code).toContain('const u: User = { name: "A", age: 1 };');
  });

  it("formats JSX/TSX content", async () => {
    const messy = 'const el = <div className="x">hi</div>;';
    const result = await formatCode(messy, "typescript");
    expect(result.ok).toBe(true);
    expect(result.code).toContain("<div className=\"x\">");
  });

  it("preserves JavaScript behavior when formatting", async () => {
    const messy = "function  add(a,b){return  a + b} const result=add( 1,2 );";
    const result = await formatCode(messy, "javascript");
    expect(result.ok).toBe(true);
    // Both the original and the formatted snippet must evaluate the same way.
    const run = (source: string) => new Function(`${source}; return result;`)();
    expect(run(result.code)).toBe(run(messy));
  });

  it("is idempotent for already-formatted code", async () => {
    const once = await formatCode("const x = 1;\nfunction f(a) {\n  return a + 1;\n}\n", "javascript");
    expect(once.ok).toBe(true);
    expect(once.changed).toBe(false);
    const twice = await formatCode(once.code, "javascript");
    expect(twice.code).toBe(once.code);
  });

  it("formats Python conservatively", async () => {
    const messy = "def  main():\r\n\tprint('hi')   \r\n\r\n\r\n\r\nif True:\r\n    pass";
    const result = await formatCode(messy, "python");
    expect(result.ok).toBe(true);
    expect(result.formatter).toBe("python");
    expect(result.changed).toBe(true);
    expect(result.code).toBe(
      "def  main():\n    print('hi')\n\n\nif True:\n    pass\n",
    );
  });

  it("preserves triple-quoted string content verbatim", () => {
    const code = [
      'def f():',
      '    """doc   ',
      '\tkeep   ',
      '',
      '',
      '   """',
      '    return 1   ',
      '',
    ].join("\n");
    const formatted = formatPython(code);
    expect(formatted).toContain('"""doc   \n\tkeep   \n\n\n   """');
    expect(formatted).toContain("    return 1");
    expect(formatted.endsWith("return 1\n")).toBe(true);
  });

  it("handles C++ with conservative whitespace cleanup only", async () => {
    const messy =
      '#include <iostream>   \n\n\n\nint main() {\n    std::cout << "hi" << std::endl; \n    return 0;\n}\n';
    const result = await formatCode(messy, "cpp");
    expect(result.ok).toBe(true);
    expect(result.formatter).toBe("whitespace");
    expect(result.changed).toBe(true);
    // Constructs are untouched — no destructive reformatting.
    expect(result.code).toContain("#include <iostream>");
    expect(result.code).toContain('std::cout << "hi" << std::endl;');
    expect(result.code).toContain("return 0;");
    expect(result.code).not.toContain("iostream>   ");
    expect(result.code).not.toMatch(/\n{4}/);
    expect(result.code.endsWith("\n")).toBe(true);
  });

  it("skips whitespace cleanup inside multi-line literals", async () => {
    const go = 'package main\n\nfunc main() {\n\ts := `line1   \n\n\n\nline2`\n\t_ = s\n}\n';
    const result = await formatCode(go, "go");
    expect(result.ok).toBe(true);
    expect(result.code).toContain("line1   \n\n\n\nline2");
  });

  it("leaves plain text untouched", async () => {
    const text = "just some prose   \n\n\n\nnothing to format";
    const result = await formatCode(text, "plaintext");
    expect(result.ok).toBe(true);
    expect(result.formatter).toBe("none");
    expect(result.changed).toBe(false);
    expect(result.code).toBe(text);
  });

  it("leaves unknown languages untouched", async () => {
    const kotlin = "fun main() { println(\"hi\") }";
    const result = await formatCode(kotlin, "kotlin");
    expect(result.ok).toBe(true);
    expect(result.formatter).toBe("none");
    expect(result.code).toBe(kotlin);
  });

  it("fails gracefully on invalid JavaScript without changing the code", async () => {
    const bad = "const = ;;; {";
    const result = await formatCode(bad, "javascript");
    expect(result.ok).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.code).toBe(bad);
    expect(result.error).toBeTruthy();
  });

  it("refuses oversized snippets instead of blocking the editor", async () => {
    const big = "const x = 1;\n".repeat(Math.ceil(MAX_FORMAT_LENGTH / 13) + 1);
    const result = await formatCode(big, "javascript");
    expect(result.ok).toBe(false);
    expect(result.code).toBe(big);
    expect(result.error).toMatch(/too large/i);
  });

  it("handles empty input", async () => {
    const result = await formatCode("", "javascript");
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.code).toBe("");
  });
});
