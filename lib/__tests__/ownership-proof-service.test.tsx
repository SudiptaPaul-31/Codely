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

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  OwnershipProofService,
  OwnershipProofAuthError,
  OwnershipProofValidationError,
  ownershipProofService,
  serializeCanonicalProofPayload,
} from "@/lib/ownership-proof-service";
import { OwnershipProofPanel } from "@/components/snippets/OwnershipProofPanel";
import {
  POST as generateProofRoute,
  GET as getSnippetProofRoute,
} from "@/app/api/snippets/[id]/ownership-proof/route";
import { GET as getProofByIdRoute } from "@/app/api/ownership-proofs/[proofId]/route";
import { POST as verifyProofRoute } from "@/app/api/ownership-proofs/verify/route";
import { NextRequest } from "next/server";

const OWNER_WALLET = "GOWNER" + "A".repeat(50);
const OTHER_WALLET = "GOTHER" + "B".repeat(50);
const VALID_TX_HASH =
  "4f8c2e7a9b1d3c5e7f9a0b2c4d6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e";

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

describe("OwnershipProofService, API Routes & OwnershipProofPanel (#219)", () => {
  let service: OwnershipProofService;

  beforeEach(() => {
    service = new OwnershipProofService({
      configuredNetwork: "testnet",
      signingSecret: "test-secret-key-219",
      baseUrl: "https://app.example.com",
    });
    ownershipProofService.clearAll();
  });

  describe("Proof generation, immutability, and export formats", () => {
    it("generates an immutable ownership proof with JSON, Signed JSON, and Verification Link formats", async () => {
      service.registerEligibleSnippet({
        id: "snippet_001",
        ownerWalletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
        network: "testnet",
      });

      const bundle = await service.generateOwnershipProof({
        snippetId: "snippet_001",
        walletAddress: OWNER_WALLET,
        actorWallet: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
        network: "testnet",
        verificationTimestamp: "2026-10-12T10:00:00Z",
      });

      expect(bundle.proof.snippetId).toBe("snippet_001");
      expect(bundle.proof.walletAddress).toBe(OWNER_WALLET);
      expect(bundle.proof.transactionHash).toBe(VALID_TX_HASH);
      expect(bundle.proof.network).toBe("testnet");
      expect(bundle.proof.proofVersion).toBe("1.0");
      expect(bundle.proof.status).toBe("verified");
      expect(bundle.proof.signature).toMatch(/^[a-f0-9]{64}$/);

      // Immutable record check
      expect(Object.isFrozen(bundle.proof)).toBe(true);
      expect(() => {
        (bundle.proof as any).walletAddress = OTHER_WALLET;
      }).toThrow();

      // Export formats check
      expect(bundle.json).toEqual({
        proofId: bundle.proof.proofId,
        snippetId: "snippet_001",
        walletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
        network: "testnet",
        verificationTimestamp: "2026-10-12T10:00:00Z",
        proofVersion: "1.0",
        status: "verified",
      });

      expect(bundle.signedJson.payload.snippetId).toBe("snippet_001");
      expect(bundle.signedJson.signature).toBe(bundle.proof.signature);
      expect(bundle.verificationLink).toBe(
        `https://app.example.com/proofs/${bundle.proof.proofId}`,
      );
    });

    it("handles duplicate proof generation idempotently without creating inconsistent records", async () => {
      const b1 = await service.generateOwnershipProof({
        snippetId: "snippet_dup",
        walletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
      });
      const b2 = await service.generateOwnershipProof({
        snippetId: "snippet_dup",
        walletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
      });

      expect(b1.proof.proofId).toBe(b2.proof.proofId);
      expect(b1.proof.signature).toBe(b2.proof.signature);
    });

    it("uses deterministic canonical serialization for proof payloads", () => {
      const canonical = serializeCanonicalProofPayload({
        network: "testnet",
        proofVersion: "1.0",
        snippetId: "snippet_001",
        transactionHash: VALID_TX_HASH.toUpperCase(),
        verificationTimestamp: "2026-10-12T10:00:00Z",
        walletAddress: OWNER_WALLET,
      });

      expect(canonical).toContain(`"transactionHash":"${VALID_TX_HASH}"`);
      expect(canonical.startsWith('{"network":"testnet"')).toBe(true);
    });
  });

  describe("Authorization & Validation checks", () => {
    it("prevents unauthorized users from generating proofs for snippets or wallets they do not control", async () => {
      service.registerEligibleSnippet({
        id: "snippet_owned",
        ownerWalletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
      });

      // Actor wallet differs from requested walletAddress
      await expect(
        service.generateOwnershipProof({
          snippetId: "snippet_owned",
          walletAddress: OWNER_WALLET,
          actorWallet: OTHER_WALLET,
          transactionHash: VALID_TX_HASH,
        }),
      ).rejects.toThrow(OwnershipProofAuthError);

      // Actor tries to claim ownership of another user's snippet with their own wallet
      await expect(
        service.generateOwnershipProof({
          snippetId: "snippet_owned",
          walletAddress: OTHER_WALLET,
          actorWallet: OTHER_WALLET,
          transactionHash: VALID_TX_HASH,
        }),
      ).rejects.toThrow(OwnershipProofAuthError);
    });

    it("rejects wrong Stellar networks during proof generation and verification", async () => {
      await expect(
        service.generateOwnershipProof({
          snippetId: "snippet_net",
          walletAddress: OWNER_WALLET,
          transactionHash: VALID_TX_HASH,
          network: "mainnet",
        }),
      ).rejects.toThrow(OwnershipProofValidationError);

      const bundle = await service.generateOwnershipProof({
        snippetId: "snippet_net",
        walletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
        network: "testnet",
      });

      const wrongNetVerify = await service.verifyOwnershipProof({
        ...bundle.proof,
        network: "mainnet",
      });
      expect(wrongNetVerify.status).toBe("invalid");
      expect(wrongNetVerify.verified).toBe(false);
      expect(wrongNetVerify.checks.networkVerified).toBe(false);
    });
  });

  describe("Independent verification & Verification states (verified, tampered, invalid, pending, unverifiable)", () => {
    it("independently verifies valid proofs and returns reproducible results across repeated checks", async () => {
      const bundle = await service.generateOwnershipProof({
        snippetId: "snippet_ver",
        walletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
      });

      const res1 = await service.verifyOwnershipProof(bundle.signedJson);
      const res2 = await service.verifyOwnershipProof(bundle.proof);

      expect(res1.status).toBe("verified");
      expect(res1.verified).toBe(true);
      expect(res1.checks).toEqual({
        walletVerified: true,
        transactionVerified: true,
        snippetMatchConfirmed: true,
        networkVerified: true,
        signatureVerified: true,
      });
      expect(res2).toEqual(res1);
    });

    it("detects tampered proofs when payload fields or signatures are modified", async () => {
      const bundle = await service.generateOwnershipProof({
        snippetId: "snippet_tamper",
        walletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
      });

      // Modify snippetId on signedJson without updating signature
      const tamperedSnippet = await service.verifyOwnershipProof({
        payload: {
          ...bundle.signedJson.payload,
          snippetId: "snippet_hacked",
        },
        signature: bundle.signedJson.signature,
      });
      expect(tamperedSnippet.status).toBe("tampered");
      expect(tamperedSnippet.verified).toBe(false);

      // Modify signature directly
      const tamperedSig = await service.verifyOwnershipProof({
        ...bundle.proof,
        signature: "0".repeat(64),
      });
      expect(tamperedSig.status).toBe("tampered");
      expect(tamperedSig.verified).toBe(false);
    });

    it("distinguishes pending and unverifiable states during verification", async () => {
      const pendingTxHash = "a".repeat(64);
      service.registerTransaction({
        hash: pendingTxHash,
        network: "testnet",
        exists: true,
        pending: true,
        sourceWallet: OWNER_WALLET,
        snippetId: "snippet_pending",
      });

      const pendingBundle = await service.generateOwnershipProof({
        snippetId: "snippet_pending",
        walletAddress: OWNER_WALLET,
        transactionHash: pendingTxHash,
      });
      expect(pendingBundle.proof.status).toBe("pending");

      const pendingVerify = await service.verifyOwnershipProof(
        pendingBundle.proof,
      );
      expect(pendingVerify.status).toBe("pending");
      expect(pendingVerify.verified).toBe(false);

      // Simulate Stellar network outage -> unverifiable
      service.setTransientNetworkFailure(
        () => new Error("Horizon unreachable"),
      );
      const unverifiableRes = await service.verifyOwnershipProof(
        pendingBundle.proof,
      );
      expect(unverifiableRes.status).toBe("unverifiable");
      expect(unverifiableRes.verified).toBe(false);
    });

    it("records audit logs for generation, unauthorized attempts, and verification", async () => {
      const bundle = await service.generateOwnershipProof({
        snippetId: "snippet_audit_219",
        walletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
      });
      await service.verifyOwnershipProof(bundle.proof);

      const logs = service.getAuditLogs("snippet_audit_219");
      expect(logs.map((l) => l.action)).toEqual([
        "proof.generated",
        "proof.verified",
      ]);
    });
  });

  describe("Next.js API Route Handlers", () => {
    it("supports POST/GET /api/snippets/[id]/ownership-proof, GET /api/ownership-proofs/[proofId], and POST /api/ownership-proofs/verify", async () => {
      const createRes = await generateProofRoute(
        makeReq("http://localhost/api/snippets/snippet_api_219/ownership-proof", {
          body: {
            walletAddress: OWNER_WALLET,
            transactionHash: VALID_TX_HASH,
            network: "testnet",
          },
          headers: { "x-wallet-address": OWNER_WALLET },
        }),
        { params: Promise.resolve({ id: "snippet_api_219" }) },
      );
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.proof.proofId).toBeDefined();

      // GET snippet ownership proof in signed_json format
      const getSnippetRes = await getSnippetProofRoute(
        makeReq(
          "http://localhost/api/snippets/snippet_api_219/ownership-proof?format=signed_json",
        ),
        { params: Promise.resolve({ id: "snippet_api_219" }) },
      );
      expect(getSnippetRes.status).toBe(200);
      const signedJson = await getSnippetRes.json();
      expect(signedJson.signature).toBe(created.proof.signature);

      // GET by proofId
      const getByIdRes = await getProofByIdRoute(
        makeReq(
          `http://localhost/api/ownership-proofs/${created.proof.proofId}?format=verification_link`,
        ),
        { params: Promise.resolve({ proofId: created.proof.proofId }) },
      );
      expect(getByIdRes.status).toBe(200);
      const linkBody = await getByIdRes.json();
      expect(linkBody.verificationLink).toContain(created.proof.proofId);

      // POST /api/ownership-proofs/verify
      const verifyRes = await verifyProofRoute(
        makeReq("http://localhost/api/ownership-proofs/verify", {
          body: signedJson,
        }),
      );
      expect(verifyRes.status).toBe(200);
      const verifiedBody = await verifyRes.json();
      expect(verifiedBody.status).toBe("verified");
      expect(verifiedBody.verified).toBe(true);
    });
  });

  describe("OwnershipProofPanel UI Component", () => {
    it("renders proof metadata, triggers export/link callbacks, and displays verification checklist", async () => {
      const bundle = await service.generateOwnershipProof({
        snippetId: "snippet_ui_001",
        walletAddress: OWNER_WALLET,
        transactionHash: VALID_TX_HASH,
      });

      const onExportJson = jest.fn();
      const onCopyLink = jest.fn();
      const onVerify = jest
        .fn()
        .mockImplementation((p) => service.verifyOwnershipProof(p));

      render(
        <OwnershipProofPanel
          proof={bundle.proof}
          signedJson={bundle.signedJson}
          verificationLink={bundle.verificationLink}
          onExportJson={onExportJson}
          onCopyVerificationLink={onCopyLink}
          onVerifyProof={onVerify}
        />,
      );

      expect(screen.getByTestId("proof-wallet").textContent).toBe(OWNER_WALLET);
      expect(screen.getByTestId("proof-snippet").textContent).toBe(
        "snippet_ui_001",
      );
      expect(screen.getByTestId("proof-network").textContent).toBe(
        "Stellar Testnet",
      );
      expect(screen.getByTestId("proof-status").textContent).toBe("Verified");

      fireEvent.click(screen.getByText("Export JSON"));
      expect(onExportJson).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("Copy Verification Link"));
      expect(onCopyLink).toHaveBeenCalledWith(bundle.verificationLink);

      fireEvent.click(screen.getByText("Verify Proof"));
      await waitFor(() => {
        expect(
          screen.getByTestId("proof-verification-result").textContent,
        ).toContain("Ownership Proof Verified");
      });
      const resultText =
        screen.getByTestId("proof-verification-result").textContent || "";
      expect(resultText).toContain("✓ Wallet verified");
      expect(resultText).toContain("✓ Transaction verified");
      expect(resultText).toContain("✓ Snippet match confirmed");
      expect(resultText).toContain("✓ Network verified");
    });
  });
});
