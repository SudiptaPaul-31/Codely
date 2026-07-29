/**
 * Network Detection — identifies whether the connected Stellar wallet
 * is on Testnet, Mainnet, or an unknown/unsupported network.
 *
 * Detection strategy per wallet:
 * - Freighter: uses `getNetwork()` or `getNetworkDetails()` from the browser extension
 * - Albedo:  defaults to the env-configured network (Albedo doesn't expose a network API)
 * - Lobstr:  not yet supported — returns "unknown"
 */

import { StellarNetwork, WalletProviderType } from "@/wallet/types/wallet";

/** Stellar passphrase constants */
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

// Future-proof: also accept the newer testnet passphrase
const TESTNET_PASSPHRASE_V2 = "Test SDF Future Network ; October 2025";

/**
 * Map a Stellar network passphrase to our StellarNetwork type.
 */
export function passphraseToNetwork(
  passphrase: string | undefined | null
): StellarNetwork {
  if (!passphrase) return "unknown";

  if (
    passphrase === TESTNET_PASSPHRASE ||
    passphrase === TESTNET_PASSPHRASE_V2
  ) {
    return "testnet";
  }

  if (passphrase === MAINNET_PASSPHRASE) {
    return "mainnet";
  }

  return "unknown";
}

/**
 * Detect the current network from a wallet provider.
 *
 * For Freighter, queries the extension for the current network.
 * For Albedo/Lobstr, falls back to the NEXT_PUBLIC_STELLAR_NETWORK env var.
 */
export async function detectWalletNetwork(
  provider: WalletProviderType
): Promise<StellarNetwork> {
  switch (provider) {
    case "freighter":
      return detectFreighterNetwork();
    case "albedo":
      return getEnvNetwork();
    case "lobstr":
      return getEnvNetwork();
    default:
      return getEnvNetwork();
  }
}

/**
 * Query the Freighter extension for its current network passphrase.
 */
async function detectFreighterNetwork(): Promise<StellarNetwork> {
  try {
    const freighter = window.freighter ?? window.freighterApi;
    if (!freighter) {
      // Freighter not installed — fall back to env
      return getEnvNetwork();
    }

    // Try getNetworkDetails first (returns structured data)
    if (typeof freighter.getNetworkDetails === "function") {
      const details = await freighter.getNetworkDetails();
      if (details?.networkPassphrase) {
        return passphraseToNetwork(details.networkPassphrase);
      }
      if (details?.network) {
        const upper = String(details.network).toUpperCase();
        if (upper === "TESTNET") return "testnet";
        if (upper === "PUBLIC") return "mainnet";
      }
    }

    // Fallback: getNetwork() returns the passphrase directly
    if (typeof freighter.getNetwork === "function") {
      const passphrase = await freighter.getNetwork();
      return passphraseToNetwork(passphrase);
    }

    return getEnvNetwork();
  } catch (err) {
    console.warn("[NetworkDetection] Failed to detect Freighter network:", err);
    return getEnvNetwork();
  }
}

/**
 * Get the network from the NEXT_PUBLIC_STELLAR_NETWORK env var.
 * Defaults to "testnet" when not set or unrecognised.
 */
export function getEnvNetwork(): StellarNetwork {
  const env = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  if (env === "mainnet") return "mainnet";
  if (env === "testnet") return "testnet";
  return "testnet"; // default to testnet for development safety
}

/**
 * Returns the expected (env-configured) network as a readable label.
 */
export function getExpectedNetwork(): StellarNetwork {
  return getEnvNetwork();
}

/**
 * Returns whether the given network matches the expected (env-configured) network.
 */
export function isNetworkSupported(network: StellarNetwork): boolean {
  const expected = getExpectedNetwork();
  return network === expected;
}

/**
 * Returns a human-readable label for a network.
 */
export function networkLabel(network: StellarNetwork): string {
  switch (network) {
    case "mainnet":
      return "Mainnet";
    case "testnet":
      return "Testnet";
    case "unknown":
      return "Unknown Network";
  }
}

/**
 * Returns a short code/abbreviation for a network.
 */
export function networkShortLabel(network: StellarNetwork): string {
  switch (network) {
    case "mainnet":
      return "MAIN";
    case "testnet":
      return "TEST";
    case "unknown":
      return "UNKN";
  }
}
