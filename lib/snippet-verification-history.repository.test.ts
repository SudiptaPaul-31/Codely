/**
 * Repository tests for snippet_verification_history.
 *
 * The neon() SQL client is mocked at the driver boundary: each test inspects
 * the tagged-template SQL and bound values that would be sent to Postgres,
 * asserting on the idempotent upsert semantics and chronological ordering.
 *
 * The repository caches its neon client in a module-level singleton, so the
 * neon() factory always returns one shared jest.fn tag (sqlTag) whose
 * implementations are queued per test.
 */

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => sqlTag),
}));

import { SnippetVerificationHistoryRepository } from "@/lib/snippet-verification-history.repository";

// Shared tagged-template client returned by the mocked neon() factory.
// Referenced lazily (inside test execution), so declaration order is safe.
const sqlTag = jest.fn();

function sqlText(callIndex: number): string {
  const [strings] = sqlTag.mock.calls[callIndex] as [TemplateStringsArray];
  return strings.join("");
}

function boundValues(callIndex: number): unknown[] {
  // A tagged-template call is invoked as fn(strings, v1, v2, ...), so the
  // mock call is a flat array: [strings, v1, v2, ...]. Drop the strings
  // and return the remaining bound values.
  const call = sqlTag.mock.calls[callIndex] as unknown[];
  return call.slice(1);
}

const SNIPPET_ID = "11111111-1111-1111-1111-111111111111";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    snippet_id: SNIPPET_ID,
    transaction_hash: "tx-hash-abc",
    ledger_sequence: 12345,
    status: "confirmed",
    tx_type: "hash_anchoring",
    error_message: null,
    verified_at: "2026-08-26T01:00:00.000Z",
    created_at: "2026-08-26T00:59:00.000Z",
    updated_at: "2026-08-26T01:00:00.000Z",
    ...overrides,
  };
}

describe("SnippetVerificationHistoryRepository", () => {
  let repository: SnippetVerificationHistoryRepository;

  beforeEach(() => {
    sqlTag.mockReset();
    sqlTag.mockResolvedValue([]);
    repository = new SnippetVerificationHistoryRepository();
  });

  describe("recordEvent", () => {
    it("inserts with snippet reference, hash, status, and type", async () => {
      await repository.recordEvent({
        snippetId: SNIPPET_ID,
        transactionHash: "tx-hash-abc",
        status: "pending",
        txType: "hash_anchoring",
      });

      expect(sqlText(0)).toContain("INSERT INTO snippet_verification_history");
      expect(sqlText(0)).toContain("ON CONFLICT (transaction_hash) DO UPDATE SET");
      expect(sqlText(0)).toContain(
        "WHERE snippet_verification_history.status <> 'confirmed'",
      );
      expect(boundValues(0)).toEqual([
        expect.any(String), // id (uuid)
        SNIPPET_ID,
        "tx-hash-abc",
        null, // ledger_sequence
        "pending",
        "hash_anchoring",
        null, // error_message
        null, // verified_at
      ]);
    });

    it("records confirmed events with ledger sequence and verified timestamp", async () => {
      const verifiedAt = new Date("2026-08-26T01:00:00.000Z");

      await repository.recordEvent({
        snippetId: SNIPPET_ID,
        transactionHash: "tx-hash-abc",
        status: "confirmed",
        txType: "hash_anchoring",
        ledgerSequence: 12345,
        verifiedAt,
      });

      expect(boundValues(0)).toEqual([
        expect.any(String),
        SNIPPET_ID,
        "tx-hash-abc",
        12345,
        "confirmed",
        "hash_anchoring",
        null,
        verifiedAt,
      ]);
    });

    it("coerces ISO string timestamps to dates", async () => {
      await repository.recordEvent({
        snippetId: SNIPPET_ID,
        transactionHash: "tx-hash-abc",
        status: "confirmed",
        verifiedAt: "2026-08-26T01:00:00.000Z",
      });

      expect(boundValues(0)[7]).toEqual(new Date("2026-08-26T01:00:00.000Z"));
    });

    it("rejects events missing snippet id or transaction hash", async () => {
      await expect(
        repository.recordEvent({
          snippetId: "",
          transactionHash: "tx-hash-abc",
          status: "pending",
        }),
      ).rejects.toThrow("snippetId and transactionHash are required");

      await expect(
        repository.recordEvent({
          snippetId: SNIPPET_ID,
          transactionHash: "",
          status: "pending",
        }),
      ).rejects.toThrow("snippetId and transactionHash are required");

      expect(sqlTag).not.toHaveBeenCalled();
    });
  });

  describe("findBySnippetId", () => {
    it("counts, then queries chronologically (created_at ASC) with pagination", async () => {
      const row = makeRow();

      // First call: COUNT(*). Second call: paginated SELECT.
      sqlTag.mockImplementationOnce(async () => [{ total: 1 }]);
      sqlTag.mockImplementationOnce(async () => [row]);

      const result = await repository.findBySnippetId(SNIPPET_ID, {
        limit: 10,
        offset: 5,
      });

      expect(sqlText(0)).toContain("COUNT(*)");
      expect(sqlText(1)).toContain("ORDER BY created_at ASC, id ASC");
      expect(sqlText(1)).toContain("LIMIT");
      expect(boundValues(1)).toContain(10);
      expect(boundValues(1)).toContain(5);

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: "evt-1",
        snippetId: SNIPPET_ID,
        transactionHash: "tx-hash-abc",
        ledgerSequence: 12345,
        status: "confirmed",
      });
    });

    it("defaults to limit 20 / offset 0 and coerces BIGINT ledger sequences", async () => {
      const bigLedgerRow = makeRow({
        id: "evt-2",
        transaction_hash: "tx-hash-def",
        // Postgres BIGINT arrives at the driver as a string.
        ledger_sequence: "987654321",
        tx_type: null,
      });

      sqlTag.mockImplementationOnce(async () => [{ total: 1 }]);
      sqlTag.mockImplementationOnce(async () => [bigLedgerRow]);

      const result = await repository.findBySnippetId(SNIPPET_ID);

      expect(boundValues(1)).toContain(20);
      expect(boundValues(1)).toContain(0);

      expect(result.data[0].ledgerSequence).toBe(987654321);
      expect(typeof result.data[0].ledgerSequence).toBe("number");
    });
  });

  describe("snippetExists", () => {
    it("returns true when the snippet row exists", async () => {
      sqlTag.mockResolvedValueOnce([{ 1: 1 }]);

      await expect(repository.snippetExists(SNIPPET_ID)).resolves.toBe(true);
      expect(sqlText(0)).toContain("FROM snippets");
    });

    it("returns false when the snippet row does not exist", async () => {
      sqlTag.mockResolvedValueOnce([]);

      await expect(repository.snippetExists(SNIPPET_ID)).resolves.toBe(false);
    });
  });
});
