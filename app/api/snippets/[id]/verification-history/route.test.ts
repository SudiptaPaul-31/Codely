jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    public url: string;

    constructor(input: string | URL, init?: RequestInit & { headers?: Headers }) {
      this.url = typeof input === "string" ? input : input.toString();
      this.headers = init?.headers ?? new Headers();
    }
  },
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Headers({ "content-type": "application/json" }),
    }),
  },
}));

jest.mock("@/lib/stellar-recovery.service", () => {
  // The route constructs its service once at module load. Stash the instance
  // on the constructor mock so tests can reach it regardless of mock clearing.
  const constructorMock: any = jest.fn(() => {
    constructorMock.instance = {
      snippetExists: jest.fn(),
      getVerificationHistory: jest.fn(),
    };
    return constructorMock.instance;
  });    return { StellarRecoveryService: constructorMock };
});

import { NextRequest } from "next/server";
import { GET } from "./route";
import { StellarRecoveryService } from "@/lib/stellar-recovery.service";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

function createServiceMock() {
  const instance = (StellarRecoveryService as any)
    .instance as jest.Mocked<StellarRecoveryService>;
  return instance;
}

function makeRequest(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/snippets/${VALID_UUID}/verification-history${query}`,
  );
}

describe("GET /api/snippets/[id]/verification-history", () => {
  let service: jest.Mocked<StellarRecoveryService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = createServiceMock();
  });

  it("returns 400 for an invalid snippet id", async () => {
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid snippet ID format. Must be a valid UUID.");
    expect(service.snippetExists).not.toHaveBeenCalled();
  });

  it("returns 404 when the snippet does not exist", async () => {
    (service.snippetExists as jest.Mock).mockResolvedValue(false);

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_UUID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Snippet not found");
    expect(service.getVerificationHistory).not.toHaveBeenCalled();
  });

  it("returns chronological history with pagination metadata", async () => {
    (service.snippetExists as jest.Mock).mockResolvedValue(true);
    (service.getVerificationHistory as jest.Mock).mockResolvedValue({
      data: [
        {
          id: "evt-1",
          snippetId: VALID_UUID,
          transactionHash: "tx-hash-1",
          ledgerSequence: null,
          status: "pending",
          txType: "hash_anchoring",
          errorMessage: null,
          verifiedAt: null,
          createdAt: "2026-08-26T00:00:00.000Z",
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
        {
          id: "evt-2",
          snippetId: VALID_UUID,
          transactionHash: "tx-hash-2",
          ledgerSequence: 12345,
          status: "confirmed",
          txType: "hash_anchoring",
          errorMessage: null,
          verifiedAt: "2026-08-26T00:05:00.000Z",
          createdAt: "2026-08-26T00:04:00.000Z",
          updatedAt: "2026-08-26T00:05:00.000Z",
        },
      ],
      total: 3,
    });

    const response = await GET(makeRequest("?limit=2"), {
      params: Promise.resolve({ id: VALID_UUID }),
    });

    expect(response.status).toBe(200);
    expect(service.getVerificationHistory).toHaveBeenCalledWith(VALID_UUID, {
      limit: 2,
      offset: 0,
    });

    const body = await response.json();
    expect(body.snippetId).toBe(VALID_UUID);
    expect(body.history).toHaveLength(2);
    // Chronological order (oldest first) is preserved from the repository.
    expect(body.history.map((e: any) => e.createdAt)).toEqual([
      "2026-08-26T00:00:00.000Z",
      "2026-08-26T00:04:00.000Z",
    ]);
    expect(body.history[1]).toMatchObject({
      transactionHash: "tx-hash-2",
      ledgerSequence: 12345,
      status: "confirmed",
    });
    // A failed event's error message is surfaced alongside confirmed ones.
    expect(body.history[0].status).toBe("pending");
    expect(body.pagination).toEqual({
      total: 3,
      limit: 2,
      offset: 0,
      hasMore: true,
    });
  });

  it("returns an empty history for a snippet with no verification events", async () => {
    (service.snippetExists as jest.Mock).mockResolvedValue(true);
    (service.getVerificationHistory as jest.Mock).mockResolvedValue({
      data: [],
      total: 0,
    });

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_UUID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.history).toEqual([]);
    expect(body.pagination).toEqual({
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
  });

  it("caps the limit at 100", async () => {
    (service.snippetExists as jest.Mock).mockResolvedValue(true);
    (service.getVerificationHistory as jest.Mock).mockResolvedValue({
      data: [],
      total: 0,
    });

    await GET(makeRequest("?limit=5000"), {
      params: Promise.resolve({ id: VALID_UUID }),
    });

    expect(service.getVerificationHistory).toHaveBeenCalledWith(VALID_UUID, {
      limit: 100,
      offset: 0,
    });
  });

  it("returns 500 when the history lookup fails", async () => {
    (service.snippetExists as jest.Mock).mockResolvedValue(true);
    (service.getVerificationHistory as jest.Mock).mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_UUID }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("database unavailable");
  });
});
