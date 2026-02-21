"use client";

import { WalletProvider } from "@/components/WalletConnect";

export default function ClientWalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      {children}
    </WalletProvider>
  );
}