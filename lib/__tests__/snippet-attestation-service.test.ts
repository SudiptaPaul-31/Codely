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

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import {
  SnippetAttestationService,
  SnippetAttestationAuthError,
  SnippetAttestationValidationError,
  computeDeterministicSnippetHash,
  snippetAttestationService,
} from "@/lib/snippet-attestation-service";
import { POST as attestRoute } from "@/app/api/snippets/[id]/attest/route";
import { GET as getSnippetAttestationsRoute } from "@/app/api/snippets/[id]/attestation/route";
import { GET as verifySnippetRoute } from "@/app/api/snippets/[id]/verify/route";
import { GET as getAttestationByIdRoute } from "@/app/api/attestations/[attestationId]/route";

const OWNER_WALLET = "GOWNER" + "A".repeat(50);
const COLLAB_WALLET = "GCOLLAB" + "B".repeat(49);
const STRANGER_WALLET = "GSTRANG" + "C".repeat(49);
const TX_HASH_1 =
  "4f8c2e7a9b1d3c5e7f9a0b2c4d6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e";
const TX_HASH_2 =
  "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b";

function makeReq(
  url: string,
  opts?: { body?: unknown; headers?: Record<string, string> },
) {
  return new NextRequest(url, {
    headers: new Headers(opts?.headers ?? {}),
    body:
      opts?.body === undefined
        ? undefined
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body),
  } as any);
}

describe("SnippetAttestationService & Attestation API (#218)", () => {
  let service: SnippetAttestationService;

  beforeEach(() => {
    service = new SnippetAttestationService({
      configuredNetwork: "testnet",
      maxNetworkRetries: 2,
    });
    snippetAttestationService.clearAll();
  });

  describe("SHA-256 hash generation & deterministic calculation", () => {
    it("computes deterministic SHA-256 hashes and normalizes line endings", () => {
      const unixHash = computeDeterministicSnippetHash(
        "function greet() {\n  return 'hi';\n}",
      );
      const crlfHash = computeDeterministicSnippetHash(
        "function greet() {\r\n  return 'hi';\r\n}",
      );

      expect(unixHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(unixHash).toBe(crlfHash);

      const modifiedHash = computeDeterministicSnippetHash(
        "function greet() {\n  return 'bye';\n}",
      );
      expect(modifiedHash).not.toBe(unixHash);
    });

    it("rejects client-provided content hashes that do not match server-computed SHA-256", async () => {
      await expect(
        service.createAttestation({
          snippetId: "snippet_spoof",
          code: "const x = 1;",
          attestedBy: OWNER_WALLET,
          clientProvidedHash: "sha256:" + "0".repeat(64),
        }),
      ).rejects.toThrow(SnippetAttestationValidationError);
    });
  });

  describe("Attestation creation, immutability, and verification states", () => {
    it("creates an immutable attestation linked to Stellar metadata and verifies unchanged snippet content", async () => {
      const code = "export const add = (a: number, b: number) => a + b;";
      const attestation = await service.createAttestation({
        snippetId: "snippet_123",
        code,
        attestedBy: OWNER_WALLET,
        stellarTransactionHash: TX_HASH_1,
        network: "testnet",
        ledger: 12345678,
      });

      expect(attestation.snippetId).toBe("snippet_123");
      expect(attestation.contentHash).toBe(
        computeDeterministicSnippetHash(code),
      );
      expect(attestation.stellarTransactionHash).toBe(TX_HASH_1);
      expect(attestation.network).toBe("testnet");
      expect(attestation.ledger).toBe(12345678);
      expect(attestation.attestedBy).toBe(OWNER_WALLET);
      expect(attestation.verificationStatus).toBe("verified");
      expect(Object.isFrozen(attestation)).toBe(true);

      // Verify unchanged snippet content
      const outcome = await service.verifySnippetAttestation("snippet_123");
      expect(outcome.status).toBe("verified");
      expect(outcome.verified).toBe(true);
      expect(outcome.contentIntegrity).toBe("match");
      expect(outcome.ledger).toBe(12345678);
    });

    it("detects modified snippet content when current code differs from attested hash", async () => {
      await service.createAttestation({
        snippetId: "snippet_mod",
        code: "const version = 1;",
        attestedBy: OWNER_WALLET,
        stellarTransactionHash: TX_HASH_1,
      });

      // Modify snippet content in store
      service.upsertSnippetContent({
        id: "snippet_mod",
        code: "const version = 2; // modified!",
        ownerWalletAddress: OWNER_WALLET,
      });

      const outcome = await service.verifySnippetAttestation("snippet_mod");
      expect(outcome.status).toBe("modified");
      expect(outcome.verified).toBe(false);
      expect(outcome.contentIntegrity).toBe("mismatch");
      expect(outcome.currentContentHash).not.toBe(outcome.attestedContentHash);
    });

    it("supports multiple historical attestations across revisions and retrieves full history", async () => {
      const rev1 = await service.createAttestation({
        snippetId: "snippet_hist",
        code: "const v = 1;",
        attestedBy: OWNER_WALLET,
        stellarTransactionHash: TX_HASH_1,
        ledger: 1001,
      });

      const rev2 = await service.createAttestation({
        snippetId: "snippet_hist",
        code: "const v = 2;",
        attestedBy: OWNER_WALLET,
        stellarTransactionHash: TX_HASH_2,
        ledger: 1002,
      });

      const { latestAttestation, history } =
        await service.getSnippetAttestations("snippet_hist");
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe(rev1.id);
      expect(history[0].revisionNumber).toBe(1);
      expect(history[1].id).toBe(rev2.id);
      expect(history[1].revisionNumber).toBe(2);
      expect(latestAttestation?.id).toBe(rev2.id);

      // Current content matches rev2 (latest), but is modified relative to rev1
      const verifyLatest =
        await service.verifySnippetAttestation("snippet_hist");
      expect(verifyLatest.status).toBe("verified");

      const verifyOldRev = await service.verifySnippetAttestation(
        "snippet_hist",
        { attestationId: rev1.id },
      );
      expect(verifyOldRev.status).toBe("modified");
    });

    it("handles pending, failed, missing, and wrong-network Stellar transactions", async () => {
      // 1. Wrong network rejected during creation
      await expect(
        service.createAttestation({
          snippetId: "snippet_net",
          code: "const net = 1;",
          attestedBy: OWNER_WALLET,
          network: "mainnet",
        }),
      ).rejects.toThrow(SnippetAttestationValidationError);

      // 2. Pending transaction scenario
      const pendingTx = "b".repeat(64);
      service.registerOnChainTransaction({
        hash: pendingTx,
        network: "testnet",
        exists: true,
        pending: true,
        ledger: null,
      });

      const pendingAtt = await service.createAttestation({
        snippetId: "snippet_pending",
        code: "const p = 1;",
        attestedBy: OWNER_WALLET,
        stellarTransactionHash: pendingTx,
      });
      expect(pendingAtt.verificationStatus).toBe("pending");

      const pendingCheck =
        await service.verifySnippetAttestation("snippet_pending");
      expect(pendingCheck.status).toBe("pending");
      expect(pendingCheck.verified).toBe(false);

      // 3. Failed transaction on-chain during verification
      service.registerOnChainTransaction({
        hash: pendingTx,
        network: "testnet",
        exists: true,
        successful: false,
        pending: false,
        ledger: 5000,
      });
      const failedCheck =
        await service.verifySnippetAttestation("snippet_pending");
      expect(failedCheck.status).toBe("failed");

      // 4. Missing transaction on-chain -> unverifiable
      service.registerOnChainTransaction({
        hash: pendingTx,
        network: "testnet",
        exists: false,
      });
      const missingCheck =
        await service.verifySnippetAttestation("snippet_pending");
      expect(missingCheck.status).toBe("unverifiable");
    });

    it("handles concurrent and duplicate attestation requests idempotently and enforces authorization", async () => {
      service.upsertSnippetContent({
        id: "snippet_auth",
        code: "const sec = true;",
        ownerWalletAddress: OWNER_WALLET,
        collaboratorWallets: [COLLAB_WALLET],
      });

      // Unauthorized user rejected
      await expect(
        service.createAttestation({
          snippetId: "snippet_auth",
          attestedBy: STRANGER_WALLET,
          stellarTransactionHash: TX_HASH_1,
        }),
      ).rejects.toThrow(SnippetAttestationAuthError);

      // Concurrent identical attestation requests return the same record without duplicates
      const [a1, a2, a3] = await Promise.all([
        service.createAttestation({
          snippetId: "snippet_auth",
          attestedBy: COLLAB_WALLET,
          stellarTransactionHash: TX_HASH_1,
        }),
        service.createAttestation({
          snippetId: "snippet_auth",
          attestedBy: COLLAB_WALLET,
          stellarTransactionHash: TX_HASH_1,
        }),
        service.createAttestation({
          snippetId: "snippet_auth",
          attestedBy: COLLAB_WALLET,
          stellarTransactionHash: TX_HASH_1,
        }),
      ]);

      expect(a1.id).toBe(a2.id);
      expect(a2.id).toBe(a3.id);

      const { history } = await service.getSnippetAttestations("snippet_auth");
      expect(history).toHaveLength(1);
    });

    it("recovers verification after temporary Stellar network failures and records audit logs", async () => {
      await service.createAttestation({
        snippetId: "snippet_net_rec",
        code: "const ok = true;",
        attestedBy: OWNER_WALLET,
        stellarTransactionHash: TX_HASH_1,
      });

      // Temporary network outage -> unverifiable
      service.setNetworkFailureGenerator(
        () => new Error("Horizon 503 Unavailable"),
      );
      const outageOutcome =
        await service.verifySnippetAttestation("snippet_net_rec");
      expect(outageOutcome.status).toBe("unverifiable");

      // Network recovers -> verified
      service.setNetworkFailureGenerator(null);
      const recoveredOutcome =
        await service.verifySnippetAttestation("snippet_net_rec");
      expect(recoveredOutcome.status).toBe("verified");
      expect(recoveredOutcome.verified).toBe(true);

      const logs = service.getAuditLogs("snippet_net_rec");
      expect(logs.map((l) => l.action)).toEqual([
        "attestation.created",
        "attestation.verified",
      ]);
    });
  });

  describe("Next.js API Route Handlers", () => {
    it("supports POST /api/snippets/[id]/attest, GET /api/snippets/[id]/attestation, GET /api/snippets/[id]/verify, and GET /api/attestations/[attestationId]", async () => {
      const createRes = await attestRoute(
        makeReq("http://localhost/api/snippets/snippet_route_218/attest", {
          body: {
            code: "export const magic = 42;",
            attestedBy: OWNER_WALLET,
            stellarTransactionHash: TX_HASH_1,
            network: "testnet",
            ledger: 7654321,
          },
        }),
        { params: Promise.resolve({ id: "snippet_route_218" }) },
      );
      expect(createRes.status).toBe(201);
      const { attestation } = await createRes.json();
      expect(attestation.id).toBeDefined();

      // GET /api/snippets/[id]/attestation
      const listRes = await getSnippetAttestationsRoute(
        makeReq("http://localhost/api/snippets/snippet_route_218/attestation"),
        { params: Promise.resolve({ id: "snippet_route_218" }) },
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.latestAttestation.id).toBe(attestation.id);
      expect(listBody.history).toHaveLength(1);

      // GET /api/snippets/[id]/verify
      const verifyRes = await verifySnippetRoute(
        makeReq("http://localhost/api/snippets/snippet_route_218/verify"),
        { params: Promise.resolve({ id: "snippet_route_218" }) },
      );
      expect(verifyRes.status).toBe(200);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.status).toBe("verified");
      expect(verifyBody.verified).toBe(true);
      expect(verifyBody.contentIntegrity).toBe("match");

      // GET /api/attestations/[attestationId]
      const byIdRes = await getAttestationByIdRoute(
        makeReq(`http://localhost/api/attestations/${attestation.id}`),
        { params: Promise.resolve({ attestationId: attestation.id }) },
      );
      expect(byIdRes.status).toBe(200);
      const byIdBody = await byIdRes.json();
      expect(byIdBody.attestation.id).toBe(attestation.id);
    });
  });
});
