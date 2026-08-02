import {
  buildSideBySideDiff,
  getMetadataDifferences,
  tokenizeLine,
  type ComparisonSnippet,
} from "./snippet-comparison";

const snippet = (overrides: Partial<ComparisonSnippet> = {}): ComparisonSnippet => ({
  id: "one",
  title: "Example",
  code: "const answer = 42;",
  language: "typescript",
  created_at: "2026-01-01T00:00:00.000Z",
  owner_wallet_address: "alice",
  ...overrides,
});

describe("snippet comparison", () => {
  it("aligns equal, changed, added, and removed lines", () => {
    const rows = buildSideBySideDiff("same\nold\nremoved", "same\nnew\nadded\nextra");
    expect(rows.map((row) => row.kind)).toEqual(["equal", "changed", "changed", "added"]);
    expect(rows[1]).toMatchObject({ left: "old", right: "new", leftLine: 2, rightLine: 2 });
    expect(rows[3]).toMatchObject({ right: "extra", rightLine: 4 });
  });

  it("marks language, timestamp, and contributor differences", () => {
    expect(getMetadataDifferences(
      snippet(),
      snippet({ language: "python", created_at: "2026-02-01T00:00:00.000Z", owner_wallet_address: "bob" }),
    )).toEqual({ language: true, createdAt: true, contributor: true });
  });

  it("tokenizes keywords, strings, numbers, and comments", () => {
    const tokens = tokenizeLine('const value = "hi" + 2; // note', "typescript");
    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "const", kind: "keyword" }),
      expect.objectContaining({ value: '"hi"', kind: "string" }),
      expect.objectContaining({ value: "2", kind: "number" }),
      expect.objectContaining({ value: "// note", kind: "comment" }),
    ]));
  });
});
