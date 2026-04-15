"use client";

import { useState } from "react";
import { saveWalletAddress } from "../../lib/pacifica-signed";
import { OrangeLabel } from "../ui/OrangeLabel";

interface Props {
  onSaved: (address: string) => void;
}

export function ApiKeyGate({ onSaved }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleLoad() {
    const addr = value.trim();
    if (!addr || addr.length < 32) {
      setError("Paste your Pacifica wallet address (the long one from test-app.pacifica.fi/subaccount).");
      return;
    }
    saveWalletAddress(addr);
    onSaved(addr);
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-20 flex flex-col gap-6">
      <OrangeLabel text="/ MY PORTFOLIO" />
      <h2 className="text-2xl font-bold text-white">Enter your wallet address</h2>
      <p className="text-neutral-400 text-sm leading-relaxed">
        Paste your Pacifica wallet address to load your live positions. Find it at{" "}
        <a
          href="https://test-app.pacifica.fi/subaccount"
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-400 hover:text-orange-300"
        >
          test-app.pacifica.fi/subaccount ↗
        </a>
      </p>

      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          placeholder="H3i9odnz7b2qKG6d..."
          className="w-full bg-[#111] border border-neutral-700 focus:border-orange-500/60 outline-none px-3 py-2 text-sm font-mono text-white placeholder-neutral-600"
        />
        {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
        <button
          onClick={handleLoad}
          className="text-black bg-orange-500 px-4 py-2 text-sm font-semibold hover:bg-orange-400 transition-colors"
        >
          Load Portfolio
        </button>
      </div>
    </div>
  );
}
