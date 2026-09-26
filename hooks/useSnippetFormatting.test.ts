import { act, renderHook, waitFor } from "@testing-library/react";
import { useSnippetFormatting } from "@/hooks/useSnippetFormatting";
import { PLAIN_TEXT_LANGUAGE } from "@/lib/languages";

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
`;

const PY_SNIPPET = `
import os
from datetime import datetime

def process(path):
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return datetime.now()
`;

const MESSY_JS = "const  answer=42;function  f( a ){return   a+1}";
const TIDY_JS = "const answer = 42;\nfunction f(a) {\n  return a + 1;\n}\n";

const MESSY_PY = "def  main():\n\tprint('hi')   \n";
const TIDY_PY = "def  main():\n    print('hi')\n";

interface Harness {
  result: { current: ReturnType<typeof useSnippetFormatting> };
  state: { code: string; language: string };
}

function setup(options?: { language?: string; code?: string; autoFormatDelay?: number }): Harness {
  const state = {
    code: options?.code ?? "",
    language: options?.language ?? "javascript",
  };
  const { result } = renderHook(() =>
    useSnippetFormatting({
      getCode: () => state.code,
      getLanguage: () => state.language,
      applyLanguage: (language) => {
        state.language = language;
      },
      applyCode: (code) => {
        state.code = code;
      },
      autoFormatDelay: options?.autoFormatDelay ?? 0,
    }),
  );
  return { result, state };
}

describe("paste detection", () => {
  it("suggests JavaScript when JavaScript code is pasted", () => {
    const { result } = setup();
    act(() => result.current.handlePaste(JS_SNIPPET));
    expect(result.current.suggestion?.language).toBe("javascript");
  });

  it("suggests TypeScript when TypeScript code is pasted", () => {
    const { result } = setup();
    act(() => result.current.handlePaste(TS_SNIPPET));
    expect(result.current.suggestion?.language).toBe("typescript");
  });

  it("suggests Python when Python code is pasted", () => {
    const { result } = setup();
    act(() => result.current.handlePaste(PY_SNIPPET));
    expect(result.current.suggestion?.language).toBe("python");
  });

  it("shows no suggestion for low-confidence input (plain text fallback)", () => {
    const { result } = setup();
    act(() => result.current.handlePaste("def "));
    expect(result.current.suggestion).toBeNull();
  });

  it("shows no suggestion for mixed-language input", () => {
    const { result } = setup();
    act(() => result.current.handlePaste(`${JS_SNIPPET}\n${PY_SNIPPET}`));
    expect(result.current.suggestion).toBeNull();
  });

  it("shows no suggestion for empty pastes", () => {
    const { result } = setup();
    act(() => result.current.handlePaste("   "));
    expect(result.current.suggestion).toBeNull();
  });
});

describe("suggestion confirmation", () => {
  it("applies the detected language when the suggestion is accepted", () => {
    const { result, state } = setup();
    act(() => result.current.handlePaste(TS_SNIPPET));
    act(() => result.current.acceptSuggestion());
    expect(state.language).toBe("typescript");
    expect(result.current.suggestion).toBeNull();
  });

  it("keeps the current language when the suggestion is rejected", () => {
    const { result, state } = setup({ language: "python" });
    act(() => result.current.handlePaste(TS_SNIPPET));
    act(() => result.current.dismissSuggestion());
    expect(state.language).toBe("python");
    expect(result.current.suggestion).toBeNull();
  });
});

describe("manual override", () => {
  it("stops suggesting languages after an explicit user selection", () => {
    const { result, state } = setup();
    act(() => result.current.handleLanguageSelect("python"));
    state.language = "python";
    act(() => result.current.handlePaste(JS_SNIPPET));
    expect(result.current.suggestion).toBeNull();
  });

  it("never overwrites an explicitly selected language", () => {
    const { result, state } = setup({ language: "python" });
    act(() => result.current.handleLanguageSelect("python"));
    act(() => result.current.handlePaste(JS_SNIPPET));
    act(() => result.current.acceptSuggestion());
    expect(state.language).toBe("python");
  });

  it("lockDetection suppresses suggestions for pre-existing snippets", () => {
    const { result } = setup();
    act(() => result.current.lockDetection());
    act(() => result.current.handlePaste(JS_SNIPPET));
    expect(result.current.suggestion).toBeNull();
  });

  it("formats with the manually selected language", async () => {
    const { result, state } = setup({ language: "python", code: MESSY_PY });
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.code).toBe(TIDY_PY);

    state.language = "javascript";
    state.code = MESSY_JS;
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.code).toBe(TIDY_JS);
  });
});

describe("manual formatting (Format Code button)", () => {
  it("formats JavaScript code on demand", async () => {
    const { result, state } = setup({ language: "javascript", code: MESSY_JS });
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.code).toBe(TIDY_JS);
    expect(result.current.formatStatus).toEqual({
      type: "success",
      message: "Formatted with Prettier.",
    });
    expect(result.current.formatting).toBe(false);
  });

  it("reports already-formatted code without rewriting it", async () => {
    const { result, state } = setup({ language: "javascript", code: TIDY_JS });
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.code).toBe(TIDY_JS);
    expect(result.current.formatStatus?.message).toMatch(/already formatted/i);
  });

  it("does not format plain text and explains why", async () => {
    const { result, state } = setup({
      language: PLAIN_TEXT_LANGUAGE,
      code: "lorem ipsum   dolor",
    });
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.code).toBe("lorem ipsum   dolor");
    expect(result.current.formatStatus?.type).toBe("info");
    expect(result.current.formatStatus?.message).toMatch(/not available/i);
  });

  it("leaves invalid code untouched and surfaces the error", async () => {
    const { result, state } = setup({ language: "javascript", code: "const = ;;; {" });
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.code).toBe("const = ;;; {");
    expect(result.current.formatStatus?.type).toBe("error");
  });

  it("skips empty snippets", async () => {
    const { result, state } = setup({ language: "javascript", code: "" });
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.code).toBe("");
    expect(result.current.formatStatus?.message).toMatch(/nothing to format/i);
  });
});

describe("end-to-end paste → accept → format", () => {
  it("detects JavaScript on paste and formats it on demand", async () => {
    const { result, state } = setup({ code: MESSY_JS });
    act(() => result.current.handlePaste(JS_SNIPPET));
    expect(result.current.suggestion?.language).toBe("javascript");
    act(() => result.current.acceptSuggestion());
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.code).toBe(TIDY_JS);
  });

  it("detects TypeScript on paste and formats it on demand", async () => {
    const { result, state } = setup({
      language: "plaintext",
      code: 'interface Box{value:number}\nconst b:Box={value:1};',
    });
    act(() => result.current.handlePaste(TS_SNIPPET));
    expect(result.current.suggestion?.language).toBe("typescript");
    act(() => result.current.acceptSuggestion());
    await act(async () => {
      await result.current.formatNow();
    });
    expect(state.language).toBe("typescript");
    expect(state.code).toBe('interface Box {\n  value: number;\n}\nconst b: Box = { value: 1 };\n');
  });
});

describe("auto-format toggle", () => {
  it("is off by default and does not format on confirmation", async () => {
    const { result, state } = setup({ code: MESSY_JS });
    expect(result.current.autoFormat).toBe(false);
    act(() => result.current.handlePaste(JS_SNIPPET));
    act(() => result.current.acceptSuggestion());
    await waitFor(() => expect(result.current.formatting).toBe(false));
    expect(state.code).toBe(MESSY_JS);
  });

  it("formats automatically after language confirmation when enabled", async () => {
    const { result, state } = setup({ code: MESSY_JS });
    act(() => result.current.setAutoFormat(true));
    expect(result.current.autoFormat).toBe(true);
    act(() => result.current.handlePaste(JS_SNIPPET));
    act(() => result.current.acceptSuggestion());
    await waitFor(() => expect(state.code).toBe(TIDY_JS));
    await waitFor(() => expect(result.current.formatting).toBe(false));
  });

  it("formats automatically after a manual language selection when enabled", async () => {
    const { result, state } = setup({ language: "javascript", code: MESSY_JS });
    act(() => result.current.setAutoFormat(true));
    act(() => result.current.handleLanguageSelect("javascript"));
    await waitFor(() => expect(state.code).toBe(TIDY_JS));
  });

  it("cancels a pending auto-format when toggled off", async () => {
    const { result, state } = setup({ code: MESSY_JS });
    act(() => result.current.setAutoFormat(true));
    act(() => result.current.handlePaste(JS_SNIPPET));
    act(() => result.current.acceptSuggestion());
    act(() => result.current.setAutoFormat(false));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.code).toBe(MESSY_JS);
  });
});
