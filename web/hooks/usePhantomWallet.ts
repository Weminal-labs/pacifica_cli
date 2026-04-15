"use client";

// ---------------------------------------------------------------------------
// Direct Phantom wallet hook — no Privy, no backend auth.
// The portfolio page only reads public Pacifica data, so all we need is the
// wallet's public key. This talks to Phantom's injected provider directly,
// exactly how test-app.pacifica.fi connects.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";

interface PhantomProvider {
  isPhantom: boolean;
  publicKey: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  on(event: string, cb: () => void): void;
  off(event: string, cb: () => void): void;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

export interface UsePhantomWallet {
  address: string | null;
  connected: boolean;
  ready: boolean;
  isInstalled: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function usePhantomWallet(): UsePhantomWallet {
  const [ready, setReady]           = useState(false);
  const [isInstalled, setInstalled] = useState(false);
  const [address, setAddress]       = useState<string | null>(null);

  // On mount — mark ready and try a silent reconnect if Phantom was previously trusted
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = window.solana;
      setInstalled(!!p?.isPhantom);
      setReady(true);
      if (!p?.isPhantom) return;
      // Already connected (publicKey populated without prompting)
      if (p.publicKey) {
        setAddress(p.publicKey.toString());
        return;
      }
      // Try silent reconnect (works when user has previously connected this origin)
      p.connect({ onlyIfTrusted: true })
        .then((r) => setAddress(r.publicKey.toString()))
        .catch(() => { /* not trusted / not previously connected — stay disconnected */ });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // React to Phantom account / connection changes
  useEffect(() => {
    const p = window.solana;
    if (!p?.isPhantom) return;

    const onConnect       = () => { if (p.publicKey) setAddress(p.publicKey.toString()); };
    const onDisconnect    = () => setAddress(null);
    const onAccountChange = () => setAddress(p.publicKey ? p.publicKey.toString() : null);

    p.on("connect",        onConnect);
    p.on("disconnect",     onDisconnect);
    p.on("accountChanged", onAccountChange);

    return () => {
      p.off("connect",        onConnect);
      p.off("disconnect",     onDisconnect);
      p.off("accountChanged", onAccountChange);
    };
  }, []);

  const connect = useCallback(async () => {
    const p = window.solana;
    if (!p?.isPhantom) {
      // Phantom not installed — open download page
      window.open("https://phantom.app", "_blank");
      return;
    }
    const resp = await p.connect();
    setAddress(resp.publicKey.toString());
  }, []);

  const disconnect = useCallback(async () => {
    const p = window.solana;
    if (p?.isPhantom) await p.disconnect();
    setAddress(null);
  }, []);

  return {
    address,
    connected: address !== null,
    ready,
    isInstalled,
    connect,
    disconnect,
  };
}
