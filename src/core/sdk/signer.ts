// ---------------------------------------------------------------------------
// Pacifica DEX SDK -- Ed25519 Request Signer
// ---------------------------------------------------------------------------
// Implements the Pacifica signing protocol:
//   1. Build header  { timestamp, expiry_window, type }
//   2. Build payload (operation-specific fields)
//   3. Merge header + { data: payload }
//   4. Recursively sort ALL keys alphabetically at every nesting level
//   5. Compact JSON serialize (no whitespace)
//   6. UTF-8 encode, sign with Ed25519 private key
//   7. Encode signature as Base58
// ---------------------------------------------------------------------------

import nacl from "tweetnacl";
import bs58 from "bs58";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignerConfig {
  /** 64-byte Ed25519 secret key (seed + public concatenated, as per NaCl convention). */
  privateKey: Uint8Array;
  /** Base58-encoded public key (the on-chain account address). */
  publicKey: string;
  /** Optional agent wallet public key for delegated signing. */
  agentWallet?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a `SignerConfig` from a Base58-encoded Ed25519 secret key.
 *
 * The secret key must decode to exactly 64 bytes (NaCl convention: 32-byte
 * seed || 32-byte public key).  If a 32-byte seed is provided instead, the
 * full 64-byte key pair is derived automatically.
 */
/**
 * Create a signer from config, automatically setting up agent wallet delegation
 * when an `account` (main wallet public key) is provided.
 */
export function createSignerFromConfig(config: {
  private_key: string;
  account?: string;
}): SignerConfig {
  const signer = createSigner(config.private_key);
  if (config.account && config.account !== signer.publicKey) {
    // Agent wallet mode: sign with agent key, but use main account
    signer.agentWallet = signer.publicKey; // agent's public key
    signer.publicKey = config.account;     // main wallet's public key
  }
  return signer;
}

export function createSigner(secretKeyBase58: string): SignerConfig {
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(secretKeyBase58);
  } catch {
    throw new Error("Invalid Base58 secret key: decoding failed");
  }

  let keyPair: nacl.SignKeyPair;

  if (decoded.length === 64) {
    // Full NaCl signing key (seed + public). Reconstruct the key pair so we
    // can reliably extract the public key bytes.
    keyPair = nacl.sign.keyPair.fromSecretKey(decoded);
  } else if (decoded.length === 32) {
    // 32-byte seed -- derive the full key pair.
    keyPair = nacl.sign.keyPair.fromSeed(decoded);
  } else {
    throw new Error(
      `Invalid secret key length: expected 32 or 64 bytes, got ${decoded.length}`,
    );
  }

  const publicKey = bs58.encode(keyPair.publicKey);

  return {
    privateKey: keyPair.secretKey,
    publicKey,
  };
}

/**
 * Sign an API request payload for a given operation type.
 *
 * Returns the complete flat request body ready to POST, including `account`,
 * `signature`, `timestamp`, `expiry_window`, the operation-specific fields,
 * and optionally `agent_wallet`.
 */
export function signPayload(
  signer: SignerConfig,
  operationType: string,
  payload: Record<string, unknown>,
  expiryWindow = 30_000,
): Record<string, unknown> {
  const timestamp = Date.now();

  const header: Record<string, unknown> = {
    timestamp,
    expiry_window: expiryWindow,
    type: operationType,
  };

  // Build the message to sign: header + { data: payload }, then sort & serialize.
  const message = buildSignMessage(header, payload);
  const messageBytes = new TextEncoder().encode(message);

  // Ed25519 detached signature.
  const signatureBytes = nacl.sign.detached(messageBytes, signer.privateKey);
  const signature = bs58.encode(signatureBytes);

  // Flat merge for the final request body (no nested "data" wrapper).
  const body: Record<string, unknown> = {
    account: signer.publicKey,
    signature,
    timestamp,
    expiry_window: expiryWindow,
    ...payload,
  };

  if (signer.agentWallet) {
    body.agent_wallet = signer.agentWallet;
  }

  return body;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the canonical string that must be signed.
 *
 * Structure: merge `header` with `{ data: payload }`, recursively sort all
 * keys, then compact-JSON-serialize.
 */
function buildSignMessage(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  const combined: Record<string, unknown> = {
    ...header,
    data: { ...payload },
  };

  const sorted = sortKeysRecursive(combined);
  return JSON.stringify(sorted);
}

/**
 * Recursively sort all object keys alphabetically at every nesting level.
 *
 * - Arrays: each element is recursively sorted (but array order is preserved).
 * - Primitives / null: returned as-is.
 */
function sortKeysRecursive(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursive);
  }

  if (typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = sortKeysRecursive((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  // Primitive value (string, number, boolean).
  return obj;
}
