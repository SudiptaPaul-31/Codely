// Barrel exports for the wallet module

// Types
export type {
  WalletProviderType,
  StellarNetwork,
  WalletSession,
  EncryptedWalletData,
  WalletConnectionState,
  WalletActions,
  WalletContextValue,
} from "@/wallet/types/wallet";

export {
  SESSION_EXPIRY_MS,
  STORAGE_KEY,
  ENCRYPTION_VERSION,
} from "@/wallet/types/wallet";

// Store
export { walletStore } from "@/wallet/store/walletStore";

// Context
export { WalletProvider, useWallet } from "@/wallet/context/WalletContext";

// Session storage
export {
  persistSession,
  readSession,
  clearSession,
  hasSession,
} from "@/wallet/lib/sessionStorage";

// Adapters
export { getPublicKey, signMessage } from "@/wallet/lib/walletAdapters";

// Components
export { WalletConnectButton } from "@/wallet/components/WalletConnectButton";
export {
  NetworkStatusBadge,
  NetworkIndicator,
} from "@/wallet/components/NetworkStatusBadge";

// Network detection
export {
  detectWalletNetwork,
  getEnvNetwork,
  isNetworkSupported,
  networkLabel,
  networkShortLabel,
  passphraseToNetwork,
} from "@/wallet/lib/networkDetection";