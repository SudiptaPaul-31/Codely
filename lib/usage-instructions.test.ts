import {
  MAX_EXAMPLE_LENGTH,
  MAX_SECTION_LENGTH,
  isUsageInstructionsEmpty,
  normalizeUsageInstructions,
  parseStoredUsageInstructions,
  usageInstructionsInputSchema,
  usageValidationErrors,
} from "./usage-instructions";

describe("usage instructions model", () => {
  const full = {
    overview: "Generates JWT tokens for authenticated users.",
    prerequisites: "- jsonwebtoken\n- Node.js 20+",
    setup: "1. Install dependencies\n2. Configure secret key\n3. Execute function",
    notes: "Expiration is configurable.",
    inputExample: { language: "JSON", code: '{\n  "name": "John Doe"\n}' },
    outputExample: { language: "json", code: '{\n  "success": true\n}' },
  };

  describe("validation (create / edit payloads)", () => {
    it("accepts a full document and keeps its formatting", () => {
      const parsed = usageInstructionsInputSchema.parse(full);
      expect(parsed.setup).toBe(full.setup);
      expect(parsed.inputExample).toEqual({ language: "json", code: full.inputExample.code });
      expect(parsed.outputExample?.code).toBe(full.outputExample.code);
    });

    it("accepts any single section on its own", () => {
      expect(usageInstructionsInputSchema.parse({ notes: "Only notes" })).toEqual({ notes: "Only notes" });
      expect(usageInstructionsInputSchema.parse({ outputExample: { code: "ok" } })).toEqual({
        outputExample: { language: "", code: "ok" },
      });
    });

    it("drops blank sections and blank examples", () => {
      const parsed = usageInstructionsInputSchema.parse({
        overview: "Real text",
        setup: "   \n  ",
        inputExample: { language: "json", code: "   " },
      });
      expect(parsed).toEqual({ overview: "Real text" });
    });

    it("refuses a document with nothing in it, pointing at delete", () => {
      const result = usageInstructionsInputSchema.safeParse({ overview: "  ", inputExample: { code: "" } });
      expect(result.success).toBe(false);
      if (!result.success) expect(usageValidationErrors(result.error).form).toMatch(/at least one section.*delete/i);
    });

    it("enforces section and example size limits, per field", () => {
      const big = usageInstructionsInputSchema.safeParse({ overview: "x".repeat(MAX_SECTION_LENGTH + 1) });
      expect(big.success).toBe(false);
      if (!big.success) expect(usageValidationErrors(big.error).overview).toMatch(/under/);

      const bigExample = usageInstructionsInputSchema.safeParse({
        inputExample: { code: "x".repeat(MAX_EXAMPLE_LENGTH + 1) },
      });
      expect(bigExample.success).toBe(false);
      if (!bigExample.success) expect(usageValidationErrors(bigExample.error).inputExample).toBeDefined();
    });

    it("refuses unknown fields rather than storing them", () => {
      expect(usageInstructionsInputSchema.safeParse({ overview: "x", html: "<b>" }).success).toBe(false);
      expect(
        usageInstructionsInputSchema.safeParse({ inputExample: { code: "x", run: true } }).success,
      ).toBe(false);
    });

    it("refuses control characters and odd example languages", () => {
      expect(usageInstructionsInputSchema.safeParse({ overview: "a\u0000b" }).success).toBe(false);
      expect(
        usageInstructionsInputSchema.safeParse({ inputExample: { language: "js<script>", code: "1" } }).success,
      ).toBe(false);
    });

    it("normalises line endings and trailing whitespace, but not inner formatting", () => {
      const parsed = usageInstructionsInputSchema.parse({ setup: "1. a\r\n2. b\r\n\r\n```\n  indented\n```  \n\n" });
      expect(parsed.setup).toBe("1. a\n2. b\n\n```\n  indented\n```");
    });
  });

  describe("reading stored values (persistence round trip)", () => {
    it("round-trips what was saved, including the stamp", () => {
      const stored = { ...usageInstructionsInputSchema.parse(full), updatedAt: "2026-10-19T10:00:00.000Z", updatedBy: "GABC" };
      const reloaded = parseStoredUsageInstructions(JSON.parse(JSON.stringify(stored)));
      expect(reloaded).toEqual(stored);
    });

    it("accepts a JSON string (some drivers return JSONB as text)", () => {
      expect(parseStoredUsageInstructions(JSON.stringify({ overview: "Hi" }))).toEqual({ overview: "Hi" });
    });

    it.each([null, undefined, "", "not json", 42, [], { overview: 7 }, { overview: "   " }])(
      "treats %p as no instructions instead of throwing",
      (raw) => {
        expect(parseStoredUsageInstructions(raw)).toBeNull();
      },
    );

    it("ignores unknown stored keys", () => {
      expect(parseStoredUsageInstructions({ overview: "Hi", evil: "<script>" })).toEqual({ overview: "Hi" });
    });
  });

  it("knows what empty means", () => {
    expect(isUsageInstructionsEmpty(null)).toBe(true);
    expect(isUsageInstructionsEmpty({})).toBe(true);
    expect(isUsageInstructionsEmpty(normalizeUsageInstructions({ notes: " " }))).toBe(true);
    expect(isUsageInstructionsEmpty({ notes: "x" })).toBe(false);
    expect(isUsageInstructionsEmpty({ outputExample: { language: "", code: "1" } })).toBe(false);
  });
});
