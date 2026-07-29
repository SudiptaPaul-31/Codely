/**
 * Wallet Types — Session persistence types
 */

export type WalletProviderType = "freighter" | "albedo" | "lobstr";

/**
 * Detected Stellar network.
 * - testnet / mainnet: known, supported networks
 * - unknown: the wallet is on a network we cannot identify (e.g. futurenet, standalone)
 */
export type StellarNetwork = "testnet" | "mainnet" | "unknown";

export interface WalletSession {
  publicKey: string;
  walletName: string;
  token: string;
  expiresAt: number; // epoch ms
  walletProvider: WalletProviderType;
}

export interface EncryptedWalletData {
  iv: string;        // base64
  ciphertext: string; // base64
  salt: string;       // base64
  version: number;
}

export interface WalletConnectionState {
  connected: boolean;
  publicKey: string | null;
  walletName: string | null;
  walletProvider: WalletProviderType | null;
  token: string | null;
  connecting: boolean;
  reconnecting: boolean;
  error: string | null;
  network: StellarNetwork;
}

export interface WalletActions {
  connect: (provider: WalletProviderType) => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  signAction: (action: string, resourceId: string) => Promise<{
    signature: string;
    nonce: string;
    timestamp: number;
  }>;
}

export type WalletContextValue = WalletConnectionState & WalletActions;

export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const STORAGE_KEY = "codely_wallet_session";
export const ENCRYPTION_VERSION = 1;