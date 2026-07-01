/**
 * Wallet adapters — abstracts provider-specific connection and signing.
 * Supports Freighter, Albedo, and Lobstr (placeholder).
 */

import { WalletProviderType } from "@/wallet/types/wallet";

declare global {
  interface Window {
    freighter?: any;
    freighterApi?: any;
  }
}

/** Get the public key from a wallet provider. */
export async function getPublicKey(
  provider: WalletProviderType
): Promise<string> {
  switch (provider) {
    case "freighter":
      return getFreighterPublicKey();
    case "albedo":
      return getAlbedoPublicKey();
    case "lobstr":
      throw new Error(
        "Lobstr wallet integration coming soon (requires WalletConnect)."
      );
    default:
      throw new Error(`Unsupported wallet provider: ${provider}`);
  }
}

/** Sign a message with a wallet provider. */
export async function signMessage(
  provider: WalletProviderType,
  message: string
): Promise<string> {
  switch (provider) {
    case "freighter":
      return signWithFreighter(message);
    case "albedo":
      return signWithAlbedo(message);
    case "lobstr":
      throw new Error("Message signing not supported for Lobstr yet.");
    default:
      throw new Error(`Unsupported wallet provider: ${provider}`);
  }
}

// ─── Freighter ───────────────────────────────────────────────

async function getFreighterPublicKey(): Promise<string> {
  const freighter = await waitForFreighter();
  const pubKey = await freighter.getPublicKey();
  if (!pubKey) throw new Error("Failed to retrieve public key from Freighter.");
  return pubKey;
}

async function signWithFreighter(message: string): Promise<string> {
  const freighter = await waitForFreighter();
  return freighter.signMessage(message, { domain: "codely.app" });
}

async function waitForFreighter(): Promise<any> {
  for (let i = 0; i < 50; i++) {
    if (window.freighter || window.freighterApi) {
      return window.freighter || window.freighterApi;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Freighter wallet not detected. Please install from https://www.freighter.app/ and refresh the page."
  );
}

// ─── Albedo ──────────────────────────────────────────────────

async function getAlbedoPublicKey(): Promise<string> {
  const albedo = await import("@albedo-link/intent");
  const result = await albedo.default.publicKey({});
  return result.pubkey;
}

async function signWithAlbedo(message: string): Promise<string> {
  const albedo = await import("@albedo-link/intent");
  const result = await albedo.default.signMessage({ message });
  return result.message_signature;
}