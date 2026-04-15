"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

export function PrivyProviders({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Only wallet login — no email/SMS
        loginMethods: ["wallet"],

        appearance: {
          theme: "dark",
          accentColor: "#F97316",
          walletChainType: "solana-only",
          // Phantom pinned first; detected_wallets catches any other Solana wallet installed
          walletList: ["phantom"],
        },

        // Wire up Solana wallet connectors (Phantom, WalletConnect, etc.)
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
