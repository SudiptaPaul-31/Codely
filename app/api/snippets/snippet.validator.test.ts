import {
  createSnippetSchema,
  updateSnippetSchema,
  importSnippetSchema,
  shareSnippetSchema,
  validationErrorBody,
  SUPPORTED_LANGUAGES,
  VISIBILITY_VALUES,
} from "./snippet.validator";
import { LANGUAGES } from "@/lib/languages";

// Real, checksum-valid Stellar public keys
const VALID_WALLET = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";

function omit(obj: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  for (const key of keys) delete result[key];
  return result;
}

const validCreate = {
  title: "Valid Title",
  description: "A useful snippet",
  code: 'console.log("hello")',
  language: "javascript",
  tags: ["react"],
  ownerWalletAddress: VALID_WALLET,
};

describe("createSnippetSchema", () => {
  it("accepts a fully valid snippet", () => {
    const result = createSnippetSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it("accepts each supported language", () => {
    for (const language of LANGUAGES) {
      const result = createSnippetSchema.safeParse({ ...validCreate, language });
      expect(result.success).toBe(true);
      expect(SUPPORTED_LANGUAGES).toContain(language);
    }
  });

  it("rejects a missing title", () => {
    const result = createSnippetSchema.safeParse(omit(validCreate, "title"));
    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, title: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, title: "   " }).success).toBe(false);
  });

  it("rejects a title below the 3-character minimum", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, title: "ab" }).success).toBe(false);
  });

  it("accepts a title of exactly 3 characters (boundary)", () => {
    const result = createSnippetSchema.safeParse({ ...validCreate, title: "abc" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("abc");
  });

  it("accepts a title of exactly 100 characters (boundary)", () => {
    const title = "t".repeat(100);
    const result = createSnippetSchema.safeParse({ ...validCreate, title });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe(title);
  });

  it("rejects a title above the 100-character maximum", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, title: "t".repeat(101) }).success).toBe(false);
  });

  it("trims surrounding whitespace from titles", () => {
    const result = createSnippetSchema.safeParse({ ...validCreate, title: "  My Title  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("My Title");
  });

  it("rejects an unsupported language", () => {
    const result = createSnippetSchema.safeParse({ ...validCreate, language: "cobol" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string language", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, language: 42 }).success).toBe(false);
  });

  it("rejects missing code", () => {
    expect(createSnippetSchema.safeParse(omit(validCreate, "code")).success).toBe(false);
  });

  it("rejects empty code", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, code: "" }).success).toBe(false);
  });

  it("rejects whitespace-only code", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, code: " \n\t  " }).success).toBe(false);
  });

  it("accepts a single-character code (boundary)", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, code: "x" }).success).toBe(true);
  });

  it("accepts code at the 10000-character maximum (boundary)", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, code: "x".repeat(10000) }).success).toBe(true);
  });

  it("rejects oversized code above 10000 characters", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, code: "x".repeat(10001) }).success).toBe(false);
  });

  it("rejects code that is not a string", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, code: { raw: "x" } }).success).toBe(false);
  });

  it("rejects a malformed wallet address (bad prefix)", () => {
    const bad = "A" + "X".repeat(55);
    expect(createSnippetSchema.safeParse({ ...validCreate, ownerWalletAddress: bad }).success).toBe(false);
  });

  it("rejects a malformed wallet address (invalid characters)", () => {
    const bad = "G" + "0".repeat(55);
    expect(createSnippetSchema.safeParse({ ...validCreate, ownerWalletAddress: bad }).success).toBe(false);
  });

  it("rejects a wallet address with an invalid checksum", () => {
    // 56 valid base32 chars but wrong checksum
    const bad = "G" + "A".repeat(55);
    expect(createSnippetSchema.safeParse({ ...validCreate, ownerWalletAddress: bad }).success).toBe(false);
  });

  it("rejects a wallet address with the wrong length", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, ownerWalletAddress: "GABCDEF" }).success).toBe(false);
  });

  it("accepts a valid wallet address", () => {
    const result = createSnippetSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it.each(VISIBILITY_VALUES)("accepts visibility %s", (visibility) => {
    const result = createSnippetSchema.safeParse({ ...validCreate, visibility });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visibility).toBe(visibility);
  });

  it("rejects an invalid visibility value", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, visibility: "friends" }).success).toBe(false);
    expect(createSnippetSchema.safeParse({ ...validCreate, visibility: "PUBLIC" }).success).toBe(false);
  });

  it("defaults visibility to private when omitted", () => {
    const result = createSnippetSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visibility).toBe("private");
  });

  it("rejects an empty request body", () => {
    expect(createSnippetSchema.safeParse({}).success).toBe(false);
  });

  it("rejects wrong field types", () => {
    expect(createSnippetSchema.safeParse({ ...validCreate, title: 123 }).success).toBe(false);
    expect(createSnippetSchema.safeParse({ ...validCreate, tags: "react, hooks" }).success).toBe(false);
    expect(createSnippetSchema.safeParse({ ...validCreate, tags: [] }).success).toBe(false);
  });
});

describe("updateSnippetSchema", () => {
  it("accepts a valid partial update", () => {
    expect(updateSnippetSchema.safeParse({ title: "New Title" }).success).toBe(true);
    expect(updateSnippetSchema.safeParse({ code: "new code", visibility: "public" }).success).toBe(true);
  });

  it("rejects an empty update body", () => {
    const result = updateSnippetSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an invalid title in an update", () => {
    expect(updateSnippetSchema.safeParse({ title: "ab" }).success).toBe(false);
    expect(updateSnippetSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("rejects invalid visibility in an update", () => {
    expect(updateSnippetSchema.safeParse({ visibility: "admin" }).success).toBe(false);
  });

  it("rejects unsupported language in an update", () => {
    expect(updateSnippetSchema.safeParse({ language: "brainfuck" }).success).toBe(false);
  });

  it("rejects whitespace-only code in an update", () => {
    expect(updateSnippetSchema.safeParse({ code: "   " }).success).toBe(false);
  });

  it("rejects unknown fields in an update", () => {
    expect(updateSnippetSchema.safeParse({ title: "New", ownerWalletAddress: VALID_WALLET }).success).toBe(false);
  });
});

describe("importSnippetSchema", () => {
  const validImportItem = {
    title: "Imported",
    description: "From a file",
    code: "print('hi')",
    language: "python",
    tags: ["imported"],
  };

  it("accepts a valid imported snippet", () => {
    expect(importSnippetSchema.safeParse(validImportItem).success).toBe(true);
  });

  it("applies the same title rules as creation", () => {
    expect(importSnippetSchema.safeParse({ ...validImportItem, title: "ab" }).success).toBe(false);
    expect(importSnippetSchema.safeParse({ ...validImportItem, title: "t".repeat(101) }).success).toBe(false);
    expect(importSnippetSchema.safeParse({ ...validImportItem, title: "abc" }).success).toBe(true);
  });

  it("applies the same language rules as creation", () => {
    expect(importSnippetSchema.safeParse({ ...validImportItem, language: "klingon" }).success).toBe(false);
  });

  it("applies the same code rules as creation", () => {
    expect(importSnippetSchema.safeParse({ ...validImportItem, code: "" }).success).toBe(false);
    expect(importSnippetSchema.safeParse({ ...validImportItem, code: "   " }).success).toBe(false);
    expect(importSnippetSchema.safeParse({ ...validImportItem, code: "x".repeat(10001) }).success).toBe(false);
  });

  it("rejects missing required fields inside imported snippets", () => {
    expect(importSnippetSchema.safeParse(omit(validImportItem, "title")).success).toBe(false);
    expect(importSnippetSchema.safeParse(omit(validImportItem, "code")).success).toBe(false);
    expect(importSnippetSchema.safeParse(omit(validImportItem, "language")).success).toBe(false);
  });

  it("rejects invalid visibility in imported snippets", () => {
    expect(importSnippetSchema.safeParse({ ...validImportItem, visibility: "everyone" }).success).toBe(false);
  });

  it("rejects ownerWalletAddress so the owner cannot be spoofed from a file", () => {
    expect(
      importSnippetSchema.safeParse({ ...validImportItem, ownerWalletAddress: VALID_WALLET }).success,
    ).toBe(false);
  });

  it("rejects unknown/extra fields in imported snippets", () => {
    expect(importSnippetSchema.safeParse({ ...validImportItem, id: "abc" }).success).toBe(false);
    expect(importSnippetSchema.safeParse({ ...validImportItem, createdAt: "2026-01-01" }).success).toBe(false);
  });
});

describe("shareSnippetSchema", () => {
  it("accepts an empty share body", () => {
    expect(shareSnippetSchema.safeParse({}).success).toBe(true);
  });

  it("accepts isReadOnly and expiresAt", () => {
    expect(
      shareSnippetSchema.safeParse({ isReadOnly: false, expiresAt: "2027-01-01T00:00:00Z" }).success,
    ).toBe(true);
  });

  it("rejects a malformed expiresAt", () => {
    expect(shareSnippetSchema.safeParse({ expiresAt: "not-a-date" }).success).toBe(false);
  });

  it("rejects a non-boolean isReadOnly", () => {
    expect(shareSnippetSchema.safeParse({ isReadOnly: "yes" }).success).toBe(false);
  });
});

describe("validationErrorBody", () => {
  it("produces the consistent error shape", () => {
    const result = createSnippetSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const body = validationErrorBody(result.error);
      expect(body.error).toBe("Validation failed");
      expect(typeof body.message).toBe("string");
      expect(body.message.length).toBeGreaterThan(0);
      expect(Array.isArray(body.details)).toBe(true);
      expect(body.details.length).toBeGreaterThan(0);
      for (const detail of body.details) {
        expect(typeof detail.field).toBe("string");
        expect(typeof detail.message).toBe("string");
      }
    }
  });

  it("identifies the failing field", () => {
    const result = createSnippetSchema.safeParse({ title: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const body = validationErrorBody(result.error);
      expect(body.details.some((d) => d.field === "title")).toBe(true);
    }
  });

  it("prepends a field prefix for nested item errors", () => {
    const result = importSnippetSchema.safeParse({ title: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const body = validationErrorBody(result.error, "items[0]");
      expect(body.details.some((d) => d.field === "items[0].title")).toBe(true);
    }
  });

  it("does not leak stack traces or internal details", () => {
    const result = createSnippetSchema.safeParse({ title: 42 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const body = validationErrorBody(result.error);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("stack");
      expect(serialized).not.toContain("node_modules");
      expect(serialized).not.toContain("at ");
    }
  });
});
