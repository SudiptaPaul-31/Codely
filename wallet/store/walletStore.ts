/**
 * Wallet session store — lightweight reactive state for wallet connection lifecycle.
 * Provides a simple pub/sub pattern for the UI to react to connection changes.
 */

import { WalletConnectionState, WalletProviderType } from "@/wallet/types/wallet";

type Listener = () => void;

function createStore(initial: WalletConnectionState) {
  let state = { ...initial };
  const listeners = new Set<Listener>();

  return {
    getState: (): WalletConnectionState => state,
    setState: (partial: Partial<WalletConnectionState>) => {
      state = { ...state, ...partial };
      listeners.forEach((l) => l());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset: () => {
      state = {
        connected: false,
        publicKey: null,
        walletName: null,
        walletProvider: null,
        token: null,
        connecting: false,
        reconnecting: false,
        error: null,
      };
      listeners.forEach((l) => l());
    },
  };
}

export const walletStore = createStore({
  connected: false,
  publicKey: null,
  walletName: null,
  walletProvider: null as WalletProviderType | null,
  token: null,
  connecting: false,
  reconnecting: false,
  error: null,
});