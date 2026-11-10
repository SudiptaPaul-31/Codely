jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    private _body: string | null;
    public url: string;
    constructor(
      input: string | URL,
      init?: { headers?: Headers; body?: string },
    ) {
      this.url = typeof input === "string" ? input : input.toString();
      this.headers = init?.headers ?? new Headers();
      this._body = init?.body ?? null;
    }
    async json() {
      if (this._body === null) throw new Error("no body");
      return JSON.parse(this._body);
    }
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import {
  BlockchainVerificationService,
  DefaultHorizonVerificationClient,
  InMemoryVerificationStore,
  StellarVerificationNetworkError,
  VerificationAuthorizationError,
  VerificationValidationError,
  blockchainVerificationService,
} from "@/lib/blockchain-verification-service";
import { GET as getSnippetVerificationStatusRoute } from "@/app/api/snippets/[id]/verification-status/route";
import { POST as verifySnippetRoute } from "@/app/api/snippets/[id]/verify/route";
import { GET as getVerificationByIdRoute } from "@/app/api/verifications/[verificationId]/route";
import { POST as retryVerificationRoute } from "@/app/api/verifications/[verificationId]/retry/route";

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
}));

const VALID_TX_HASH =
  "4f8c2e7a9b1d3c5e7f9a0b2c4d6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e";
const OWNER_WALLET = "GOWNER" + "A".repeat(50);
const COLLAB_WALLET = "GCOLLAB" + "B".repeat(49);
const STRANGER_WALLET = "GSTRANG" + "C".repeat(49);

function makeMockRequest(
  url: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> },
): any {
  const headersMap = new Map<string, string>();
  if (options?.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      headersMap.set(k.toLowerCase(), v);
    }
  }
  return {
    url,
    method: options?.method ?? "GET",
    headers: {
      get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
    },
    json: async () => {
      if (options?.body === undefined) throw new Error("No JSON body");
      return options.body;
    },
  };
}

describe("BlockchainVerificationService & Verification Status API (#221)", () => {
  let client: DefaultHorizonVerificationClient;
  let store: InMemoryVerificationStore;
  let service: BlockchainVerificationService;

  beforeEach(async () => {
    client = new DefaultHorizonVerificationClient();
    store = new InMemoryVerificationStore();
    service = new BlockchainVerificationService({
      configuredNetwork: "testnet",
      maxRetries: 3,
      stellarClient: client,
      store,
    });
    await blockchainVerificationService.store.clear();
    if (
      blockchainVerificationService.stellarClient instanceof
      DefaultHorizonVerificationClient
    ) {
      blockchainVerificationService.stellarClient.clearMocks();
    }
  });

  describe("Lifecycle states & Stellar transaction validation", () => {
    it("verifies a confirmed Stellar transaction and persists metadata", async () => {
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: 12345678,
        memo: "anchor:snippet_001",
        operations: [
          {
            type: "manage_data",
            operationType: "anchor",
            snippetId: "snippet_001",
          },
        ],
      });

      const result = await service.verifySnippetTransaction({
        snippetId: "snippet_001",
        transactionHash: VALID_TX_HASH,
        network: "testnet",
        expectedOperation: "anchor",
        expectedMemo: "anchor:snippet_001",
      });

      expect(result.snippetId).toBe("snippet_001");
      expect(result.verification.status).toBe("confirmed");
      expect(result.verification.transactionHash).toBe(VALID_TX_HASH);
      expect(result.verification.network).toBe("testnet");
      expect(result.verification.ledger).toBe(12345678);
      expect(result.verification.verifiedAt).toBeTruthy();
      expect(result.verification.retryCount).toBe(0);
      expect(result.verification.failureReason).toBeNull();
      expect(result.error).toBeUndefined();

      // Persisted in store
      const persisted = await store.getById(result.verification.id);
      expect(persisted?.status).toBe("confirmed");
      expect(persisted?.ledger).toBe(12345678);
    });

    it("handles pending verification status when confirmation is not yet available", async () => {
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: false,
        pending: true,
      });

      const result = await service.verifySnippetTransaction({
        snippetId: "snippet_001",
        transactionHash: VALID_TX_HASH,
        network: "testnet",
      });

      expect(result.verification.status).toBe("pending");
      expect(result.verification.verifiedAt).toBeNull();
      expect(result.verification.ledger).toBeNull();
    });

    it("marks missing transactions on Stellar as unverifiable and never confirmed", async () => {
      const result = await service.verifySnippetTransaction({
        snippetId: "snippet_missing",
        transactionHash: VALID_TX_HASH,
        network: "testnet",
      });

      expect(result.verification.status).toBe("unverifiable");
      expect(result.verification.verifiedAt).toBeNull();
      expect(result.error?.code).toBe("TRANSACTION_NOT_FOUND");
    });

    it("marks snippets without a transaction hash or malformed hash as unverifiable", async () => {
      const missingRef = await service.verifySnippetTransaction({
        snippetId: "snippet_no_tx",
        transactionHash: null,
      });
      expect(missingRef.verification.status).toBe("unverifiable");
      expect(missingRef.error?.code).toBe("MISSING_TRANSACTION_REFERENCE");

      const malformedRef = await service.verifySnippetTransaction({
        snippetId: "snippet_bad_tx",
        transactionHash: "not a valid hash!",
      });
      expect(malformedRef.verification.status).toBe("unverifiable");
      expect(malformedRef.error?.code).toBe("MISSING_TRANSACTION_REFERENCE");
    });

    it("marks failed on-chain transactions as failed and never confirmed", async () => {
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: false,
        ledger: 12345679,
      });

      const result = await service.verifySnippetTransaction({
        snippetId: "snippet_failed_tx",
        transactionHash: VALID_TX_HASH,
        network: "testnet",
      });

      expect(result.verification.status).toBe("failed");
      expect(result.verification.verifiedAt).toBeNull();
      expect(result.error?.code).toBe("TRANSACTION_FAILED");
    });

    it("rejects transactions from the wrong Stellar network", async () => {
      const wrongRequestNetwork = await service.verifySnippetTransaction({
        snippetId: "snippet_wrong_net",
        transactionHash: VALID_TX_HASH,
        network: "mainnet",
      });

      expect(wrongRequestNetwork.verification.status).toBe("failed");
      expect(wrongRequestNetwork.error?.code).toBe("WRONG_NETWORK");

      // Also test when Horizon returns a transaction from an unintended network
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "mainnet",
        exists: true,
        successful: true,
        ledger: 999,
      });

      const wrongTxNetwork = await service.verifySnippetTransaction({
        snippetId: "snippet_wrong_horizon_net",
        transactionHash: VALID_TX_HASH,
        network: "testnet",
      });

      expect(wrongTxNetwork.verification.status).toBe("failed");
      expect(wrongTxNetwork.error?.code).toBe("WRONG_NETWORK");
    });

    it("validates transaction operations and memo against the expected snippet operation", async () => {
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: 55555,
        memo: "anchor:other_snippet",
        operations: [
          {
            type: "payment",
            operationType: "transfer",
            snippetId: "other_snippet",
          },
        ],
      });

      const wrongSnippetResult = await service.verifySnippetTransaction({
        snippetId: "snippet_001",
        transactionHash: VALID_TX_HASH,
        expectedOperation: "anchor",
      });

      expect(wrongSnippetResult.verification.status).toBe("failed");
      expect(wrongSnippetResult.error?.code).toBe("OPERATION_MISMATCH");

      // Correct snippetId, but mismatched operation type
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: 55555,
        operations: [
          {
            type: "payment",
            operationType: "payment",
            snippetId: "snippet_001",
          },
        ],
      });

      const wrongOpTypeResult = await service.verifySnippetTransaction({
        snippetId: "snippet_001",
        transactionHash: VALID_TX_HASH,
        expectedOperation: "attest",
        forceRevalidate: true,
      });

      expect(wrongOpTypeResult.verification.status).toBe("failed");
      expect(wrongOpTypeResult.error?.code).toBe("OPERATION_MISMATCH");
    });

    it("marks transactions with missing or invalid ledger numbers as unverifiable", async () => {
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: null,
      });

      const result = await service.verifySnippetTransaction({
        snippetId: "snippet_no_ledger",
        transactionHash: VALID_TX_HASH,
      });

      expect(result.verification.status).toBe("unverifiable");
      expect(result.error?.code).toBe("INCONSISTENT_DATA");
    });
  });

  describe("Idempotency, duplicate prevention, and concurrency", () => {
    it("does not create duplicate verification records on repeated or concurrent requests", async () => {
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: 77777,
      });

      const [r1, r2, r3] = await Promise.all([
        service.verifySnippetTransaction({
          snippetId: "snippet_concurrent",
          transactionHash: VALID_TX_HASH,
        }),
        service.verifySnippetTransaction({
          snippetId: "snippet_concurrent",
          transactionHash: VALID_TX_HASH,
        }),
        service.verifySnippetTransaction({
          snippetId: "snippet_concurrent",
          transactionHash: VALID_TX_HASH,
        }),
      ]);

      expect(r1.verification.id).toBe(r2.verification.id);
      expect(r2.verification.id).toBe(r3.verification.id);

      // Subsequent sequential call also returns the same record ID and status
      const r4 = await service.verifySnippetTransaction({
        snippetId: "snippet_concurrent",
        transactionHash: VALID_TX_HASH,
      });
      expect(r4.verification.id).toBe(r1.verification.id);
      expect(r4.verification.status).toBe("confirmed");

      const statusCheck =
        await service.getSnippetVerificationStatus("snippet_concurrent");
      expect(statusCheck.verification.id).toBe(r1.verification.id);
      expect(statusCheck.verification.status).toBe("confirmed");
    });
  });

  describe("Network failures, retry scheduling, and retry exhaustion", () => {
    it("schedules retry on Horizon timeout, RPC failure, and network outage", async () => {
      // 1. Horizon timeout
      client.setSimulatedFailure(
        () =>
          new StellarVerificationNetworkError(
            "Horizon request timed out",
            "HORIZON_TIMEOUT",
            true,
          ),
      );

      const timeoutRes = await service.verifySnippetTransaction({
        snippetId: "snippet_timeout",
        transactionHash: VALID_TX_HASH,
      });
      expect(timeoutRes.verification.status).toBe("retry_scheduled");
      expect(timeoutRes.error?.code).toBe("HORIZON_TIMEOUT");

      // 2. RPC failure
      client.setSimulatedFailure(() => new Error("Temporary Stellar RPC error"));
      const rpcRes = await service.verifySnippetTransaction({
        snippetId: "snippet_rpc",
        transactionHash: VALID_TX_HASH,
      });
      expect(rpcRes.verification.status).toBe("retry_scheduled");
      expect(rpcRes.error?.code).toBe("RPC_FAILURE");

      // 3. Network outage
      client.setSimulatedFailure(() => {
        const err: any = new Error("Service Unavailable");
        err.status = 503;
        return err;
      });
      const outageRes = await service.verifySnippetTransaction({
        snippetId: "snippet_outage",
        transactionHash: VALID_TX_HASH,
      });
      expect(outageRes.verification.status).toBe("retry_scheduled");
      expect(outageRes.error?.code).toBe("NETWORK_UNAVAILABLE");
    });

    it("successfully recovers on retry when Stellar network comes back online", async () => {
      client.setSimulatedFailure(
        () =>
          new StellarVerificationNetworkError(
            "Unable to retrieve transaction details",
            "NETWORK_UNAVAILABLE",
            true,
          ),
      );

      const initial = await service.verifySnippetTransaction({
        snippetId: "snippet_recover",
        transactionHash: VALID_TX_HASH,
      });
      expect(initial.verification.status).toBe("retry_scheduled");
      const verificationId = initial.verification.id;

      // Network recovers and transaction is available
      client.setSimulatedFailure(null);
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: 88888,
      });

      const retried = await service.retryVerification(verificationId);
      expect(retried.verification.id).toBe(verificationId);
      expect(retried.verification.status).toBe("confirmed");
      expect(retried.verification.ledger).toBe(88888);
    });

    it("transitions to unverifiable with RETRY_EXHAUSTED when maxRetries is reached", async () => {
      client.setSimulatedFailure(
        () =>
          new StellarVerificationNetworkError(
            "Horizon unavailable",
            "NETWORK_UNAVAILABLE",
            true,
          ),
      );

      const initial = await service.verifySnippetTransaction({
        snippetId: "snippet_exhaust",
        transactionHash: VALID_TX_HASH,
      });
      const verificationId = initial.verification.id;
      expect(initial.verification.status).toBe("retry_scheduled");
      expect(initial.verification.retryCount).toBe(0);

      // Retry 1 -> retryCount = 1 (retry_scheduled)
      const r1 = await service.retryVerification(verificationId);
      expect(r1.verification.status).toBe("retry_scheduled");
      expect(r1.verification.retryCount).toBe(1);

      // Retry 2 -> retryCount = 2 (retry_scheduled)
      const r2 = await service.retryVerification(verificationId);
      expect(r2.verification.status).toBe("retry_scheduled");
      expect(r2.verification.retryCount).toBe(2);

      // Retry 3 -> retryCount = 3 === maxRetries (unverifiable / RETRY_EXHAUSTED)
      const r3 = await service.retryVerification(verificationId);
      expect(r3.verification.status).toBe("unverifiable");
      expect(r3.verification.retryCount).toBe(3);
      expect(r3.error?.code).toBe("RETRY_EXHAUSTED");

      // Further retry call immediately reports RETRY_EXHAUSTED
      const r4 = await service.retryVerification(verificationId);
      expect(r4.verification.status).toBe("unverifiable");
      expect(r4.error?.code).toBe("RETRY_EXHAUSTED");
    });
  });

  describe("Audit trail & Authorization enforcement", () => {
    it("records complete audit trail for verification lifecycle transitions", async () => {
      client.setSimulatedFailure(
        () =>
          new StellarVerificationNetworkError(
            "Timeout",
            "HORIZON_TIMEOUT",
            true,
          ),
      );

      const initial = await service.verifySnippetTransaction({
        snippetId: "snippet_audit",
        transactionHash: VALID_TX_HASH,
        actorWallet: OWNER_WALLET,
      });

      client.setSimulatedFailure(null);
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: 424242,
      });

      await service.retryVerification(initial.verification.id, {
        actorWallet: OWNER_WALLET,
      });

      const logs = await service.getAuditTrail({
        verificationId: initial.verification.id,
      });
      const actions = logs.map((l) => l.action);
      expect(actions).toEqual([
        "verification.requested",
        "verification.retry_scheduled",
        "verification.retried",
        "verification.confirmed",
      ]);
    });

    it("enforces authorization for private snippets and excludes sensitive fields in public responses", async () => {
      client.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: 10101,
      });

      const created = await service.verifySnippetTransaction({
        snippetId: "snippet_private",
        transactionHash: VALID_TX_HASH,
        actorWallet: OWNER_WALLET,
        ownerWallet: OWNER_WALLET,
        visibility: "private",
        allowedWallets: [COLLAB_WALLET],
      });

      // Sensitive fields (ownerWallet, allowedWallets) are stripped from public response
      expect((created.verification as any).ownerWallet).toBeUndefined();
      expect((created.verification as any).allowedWallets).toBeUndefined();

      // Unauthenticated user cannot view private verification
      await expect(
        service.getSnippetVerificationStatus("snippet_private"),
      ).rejects.toThrow(VerificationAuthorizationError);

      // Stranger wallet cannot view private verification
      await expect(
        service.getVerificationById(created.verification.id, {
          viewerWallet: STRANGER_WALLET,
        }),
      ).rejects.toThrow(VerificationAuthorizationError);

      // Authorized collaborator and owner can view
      const collabView = await service.getVerificationById(
        created.verification.id,
        { viewerWallet: COLLAB_WALLET },
      );
      expect(collabView.status).toBe("confirmed");

      const ownerView = await service.getSnippetVerificationStatus(
        "snippet_private",
        { viewerWallet: OWNER_WALLET },
      );
      expect(ownerView.verification.status).toBe("confirmed");
    });
  });

  describe("Next.js API Route Handlers", () => {
    it("handles POST /api/snippets/[id]/verify, GET /api/snippets/[id]/verification-status, GET /api/verifications/[verificationId], and POST /api/verifications/[verificationId]/retry", async () => {
      const defaultClient =
        blockchainVerificationService.stellarClient as DefaultHorizonVerificationClient;

      // 1. Simulate transient failure first
      defaultClient.setSimulatedFailure(
        () =>
          new StellarVerificationNetworkError(
            "Network outage",
            "NETWORK_UNAVAILABLE",
            true,
          ),
      );

      const postVerifyReq = makeMockRequest(
        "http://localhost/api/snippets/snippet_route_1/verify",
        {
          method: "POST",
          body: {
            transactionHash: VALID_TX_HASH,
            network: "testnet",
          },
        },
      );
      const postVerifyRes = await verifySnippetRoute(postVerifyReq, {
        params: Promise.resolve({ id: "snippet_route_1" }),
      });
      expect(postVerifyRes.status).toBe(202);
      const postVerifyBody = await postVerifyRes.json();
      expect(postVerifyBody.verification.status).toBe("retry_scheduled");
      expect(postVerifyBody.error.code).toBe("NETWORK_UNAVAILABLE");

      const verificationId = postVerifyBody.verification.id;

      // 2. GET /api/snippets/[id]/verification-status
      const getStatusReq = makeMockRequest(
        "http://localhost/api/snippets/snippet_route_1/verification-status",
      );
      const getStatusRes = await getSnippetVerificationStatusRoute(
        getStatusReq,
        {
          params: Promise.resolve({ id: "snippet_route_1" }),
        },
      );
      expect(getStatusRes.status).toBe(200);
      const getStatusBody = await getStatusRes.json();
      expect(getStatusBody.verification.id).toBe(verificationId);
      expect(getStatusBody.verification.status).toBe("retry_scheduled");

      // 3. Restore network and POST /api/verifications/[verificationId]/retry
      defaultClient.setSimulatedFailure(null);
      defaultClient.registerMockTransaction({
        hash: VALID_TX_HASH,
        network: "testnet",
        exists: true,
        successful: true,
        ledger: 900100,
      });

      const retryReq = makeMockRequest(
        `http://localhost/api/verifications/${verificationId}/retry`,
        { method: "POST", body: {} },
      );
      const retryRes = await retryVerificationRoute(retryReq, {
        params: Promise.resolve({ verificationId }),
      });
      expect(retryRes.status).toBe(200);
      const retryBody = await retryRes.json();
      expect(retryBody.verification.status).toBe("confirmed");
      expect(retryBody.verification.ledger).toBe(900100);

      // 4. GET /api/verifications/[verificationId]
      const getByIdReq = makeMockRequest(
        `http://localhost/api/verifications/${verificationId}`,
      );
      const getByIdRes = await getVerificationByIdRoute(getByIdReq, {
        params: Promise.resolve({ verificationId }),
      });
      expect(getByIdRes.status).toBe(200);
      const getByIdBody = await getByIdRes.json();
      expect(getByIdBody.verification.id).toBe(verificationId);
      expect(getByIdBody.verification.status).toBe("confirmed");
    });

    it("returns 404 when verificationId does not exist", async () => {
      const req = makeMockRequest(
        "http://localhost/api/verifications/ver_nonexistent",
      );
      const res = await getVerificationByIdRoute(req, {
        params: Promise.resolve({ verificationId: "ver_nonexistent" }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });
  });
});
