import {
  SNIPPET_BATCH_MEMO_PREFIX,
  SNIPPET_MEMO_PREFIX,
  STELLAR_MEMO_TEXT_MAX_BYTES,
  SnippetMemoError,
  assertMemoWithinStellarLimit,
  assertSnippetMemoRef,
  buildBatchSnippetMemo,
  buildSnippetMemo,
  generateSnippetMemoRef,
  parseBatchSnippetMemo,
  parseSnippetMemo,
} from "@/lib/snippet-memo";

const SNIPPET_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("snippet-memo", () => {
  describe("generateSnippetMemoRef", () => {
    it("builds a deterministic snippet-scoped reference", () => {
      const ref = generateSnippetMemoRef(SNIPPET_ID);

      expect(ref).toBe(generateSnippetMemoRef(SNIPPET_ID));
      expect(ref).toMatch(/^snip:[0-9a-f]{12}$/);
      expect(ref.startsWith(SNIPPET_MEMO_PREFIX)).toBe(true);
    });

    it("stays inside the 28-byte memo_text limit", () => {
      const ref = generateSnippetMemoRef(SNIPPET_ID);

      expect(Buffer.byteLength(ref, "utf8")).toBeLessThanOrEqual(
        STELLAR_MEMO_TEXT_MAX_BYTES,
      );
    });

    it("never collides across different snippets", () => {
      const refs = new Set(
        Array.from({ length: 50 }, (_, index) =>
          generateSnippetMemoRef(`snippet-${index}`),
        ),
      );

      expect(refs.size).toBe(50);
    });

    it("rejects a missing snippet id", () => {
      expect(() => generateSnippetMemoRef("")).toThrow(SnippetMemoError);
      expect(() => generateSnippetMemoRef("   ")).toThrow(SnippetMemoError);
    });
  });

  describe("buildSnippetMemo", () => {
    it("returns the snippet reference when no content hash is given", () => {
      expect(buildSnippetMemo(SNIPPET_ID)).toBe(generateSnippetMemoRef(SNIPPET_ID));
    });

    it("appends a short hash suffix without exceeding the byte limit", () => {
      const contentHash = "a".repeat(64);
      const memo = buildSnippetMemo(SNIPPET_ID, contentHash);

      expect(memo.startsWith(`${generateSnippetMemoRef(SNIPPET_ID)}:`)).toBe(true);
      expect(Buffer.byteLength(memo, "utf8")).toBeLessThanOrEqual(
        STELLAR_MEMO_TEXT_MAX_BYTES,
      );
    });

    it("rejects an empty snippet id", () => {
      expect(() => buildSnippetMemo("")).toThrow(SnippetMemoError);
    });
  });

  describe("buildBatchSnippetMemo", () => {
    it("builds a bounded batch-scoped reference", () => {
      const memo = buildBatchSnippetMemo("b".repeat(64));

      expect(memo.startsWith(SNIPPET_BATCH_MEMO_PREFIX)).toBe(true);
      expect(Buffer.byteLength(memo, "utf8")).toBeLessThanOrEqual(
        STELLAR_MEMO_TEXT_MAX_BYTES,
      );
    });

    it("rejects a missing batch hash", () => {
      expect(() => buildBatchSnippetMemo("")).toThrow(SnippetMemoError);
    });
  });

  describe("assertMemoWithinStellarLimit", () => {
    it("accepts a memo of exactly 28 bytes", () => {
      const memo = "a".repeat(STELLAR_MEMO_TEXT_MAX_BYTES);

      expect(assertMemoWithinStellarLimit(memo)).toBe(memo);
    });

    it("throws instead of truncating an over-long memo", () => {
      expect(() =>
        assertMemoWithinStellarLimit("a".repeat(STELLAR_MEMO_TEXT_MAX_BYTES + 1)),
      ).toThrow(/limited to 28 bytes/);
    });

    it("measures multi-byte characters in bytes, not characters", () => {
      const memo = "é".repeat(15); // 30 bytes, 15 characters

      expect(() => assertMemoWithinStellarLimit(memo)).toThrow(SnippetMemoError);
    });

    it("rejects empty memos", () => {
      expect(() => assertMemoWithinStellarLimit("")).toThrow(SnippetMemoError);
    });
  });

  describe("parseSnippetMemo", () => {
    it("extracts the reference from a plain memo", () => {
      const ref = generateSnippetMemoRef(SNIPPET_ID);

      expect(parseSnippetMemo(ref)).toBe(ref);
    });

    it("ignores the hash suffix", () => {
      const ref = generateSnippetMemoRef(SNIPPET_ID);

      expect(parseSnippetMemo(`${ref}:deadbeef`)).toBe(ref);
    });

    it("returns null for memos that are not snippet references", () => {
      expect(parseSnippetMemo(undefined)).toBeNull();
      expect(parseSnippetMemo(null)).toBeNull();
      expect(parseSnippetMemo("")).toBeNull();
      expect(parseSnippetMemo("tr:abc:def:ghi")).toBeNull();
      expect(parseSnippetMemo("lic:abcdef12")).toBeNull();
      expect(parseSnippetMemo("snip:nothex")).toBeNull();
      expect(parseSnippetMemo("snip:ABCDEF012345")).toBeNull();
      expect(parseSnippetMemo(`snip:${"a".repeat(13)}`)).toBeNull();
    });
  });

  describe("parseBatchSnippetMemo", () => {
    it("extracts a batch reference", () => {
      const memo = buildBatchSnippetMemo("c".repeat(64));

      expect(parseBatchSnippetMemo(memo)).toBe(memo);
    });

    it("returns null for snippet-scoped references", () => {
      expect(parseBatchSnippetMemo(generateSnippetMemoRef(SNIPPET_ID))).toBeNull();
      expect(parseBatchSnippetMemo("batch:aaaa")).toBeNull();
    });
  });

  describe("assertSnippetMemoRef", () => {
    it("accepts snippet and batch references", () => {
      expect(assertSnippetMemoRef(generateSnippetMemoRef(SNIPPET_ID))).toBe(
        generateSnippetMemoRef(SNIPPET_ID),
      );
      expect(assertSnippetMemoRef(buildBatchSnippetMemo("d".repeat(64)))).toBe(
        buildBatchSnippetMemo("d".repeat(64)),
      );
    });

    it("rejects legacy or malformed memo references", () => {
      expect(() => assertSnippetMemoRef("s:abcdef12:deadbeef")).toThrow(
        SnippetMemoError,
      );
      expect(() => assertSnippetMemoRef("batch:abcdef")).toThrow(SnippetMemoError);
      expect(() => assertSnippetMemoRef("snip:")).toThrow(SnippetMemoError);
    });
  });
});
