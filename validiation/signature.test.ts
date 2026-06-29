import { NextRequest, NextResponse } from "next/server";
import { SignatureMiddleware } from "../app/api/snippets/signature.middleware";
import * as StellarSdk from "stellar-sdk";

// Mock the OwnershipMiddleware since it's used internally by SignatureMiddleware
jest.mock("../app/api/snippets/ownership.middleware", () => ({
  OwnershipMiddleware: {
    extractWalletAddress: jest.fn().mockImplementation((req: NextRequest) => {
      return req.headers.get("x-wallet-address");
    }),
  },
}));

describe("SignatureMiddleware", () => {
  let middleware: SignatureMiddleware;
  let keypair: StellarSdk.Keypair;
  
  beforeAll(() => {
    // Generate a random keypair for testing
    keypair = StellarSdk.Keypair.random();
  });

  beforeEach(() => {
    middleware = new SignatureMiddleware();
    jest.clearAllMocks();
  });

  const createMockRequest = (headers: Record<string, string>) => {
    const mockHeaders = new Headers();
    Object.entries(headers).forEach(([k, v]) => mockHeaders.set(k, v));
    
    return {
      headers: mockHeaders,
      // Add other required NextRequest properties as needed for the mock
    } as unknown as NextRequest;
  };

  const generateValidSignature = (action: string, resourceId: string, nonce: string, timestamp: number) => {
    const message = `Codely signature request\nAction: ${action}\nResource: ${resourceId}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
    return keypair.sign(Buffer.from(message, "utf8")).toString("base64");
  };

  it("should fail if signature headers are missing", async () => {
    const req = createMockRequest({
      "x-wallet-address": keypair.publicKey(),
    });

    const result = await middleware.verifySignature(req, "delete_snippet", "123");
    
    expect(result.isValid).toBe(false);
    expect(result.error?.status).toBe(401);
  });

  it("should fail if timestamp is too old (replay attack)", async () => {
    const action = "delete_snippet";
    const resourceId = "123";
    const nonce = "test-nonce-123";
    // 10 minutes ago
    const timestamp = Date.now() - 10 * 60 * 1000; 
    const signature = generateValidSignature(action, resourceId, nonce, timestamp);

    const req = createMockRequest({
      "x-wallet-address": keypair.publicKey(),
      "x-wallet-signature": signature,
      "x-wallet-nonce": nonce,
      "x-wallet-timestamp": timestamp.toString(),
    });

    const result = await middleware.verifySignature(req, action, resourceId);
    
    expect(result.isValid).toBe(false);
    expect(result.error?.status).toBe(401);
  });

  it("should fail if signature is invalid", async () => {
    const action = "delete_snippet";
    const resourceId = "123";
    const nonce = "test-nonce-123";
    const timestamp = Date.now();
    
    // Generate signature with a DIFFERENT keypair
    const wrongKeypair = StellarSdk.Keypair.random();
    const message = `Codely signature request\nAction: ${action}\nResource: ${resourceId}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
    const invalidSignature = wrongKeypair.sign(Buffer.from(message, "utf8")).toString("base64");

    const req = createMockRequest({
      "x-wallet-address": keypair.publicKey(),
      "x-wallet-signature": invalidSignature,
      "x-wallet-nonce": nonce,
      "x-wallet-timestamp": timestamp.toString(),
    });

    const result = await middleware.verifySignature(req, action, resourceId);
    
    expect(result.isValid).toBe(false);
    expect(result.error?.status).toBe(403);
  });

  it("should succeed with valid signature and recent timestamp", async () => {
    const action = "delete_snippet";
    const resourceId = "123";
    const nonce = "test-nonce-123";
    const timestamp = Date.now();
    const signature = generateValidSignature(action, resourceId, nonce, timestamp);

    const req = createMockRequest({
      "x-wallet-address": keypair.publicKey(),
      "x-wallet-signature": signature,
      "x-wallet-nonce": nonce,
      "x-wallet-timestamp": timestamp.toString(),
    });

    const result = await middleware.verifySignature(req, action, resourceId);
    
    expect(result.isValid).toBe(true);
    expect(result.walletAddress).toBe(keypair.publicKey());
  });
});
