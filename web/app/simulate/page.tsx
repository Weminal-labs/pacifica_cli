// ---------------------------------------------------------------------------
// /simulate — Server wrapper for edge runtime (Cloudflare Pages requires
// every route to declare `runtime = "edge"` at the server boundary).
// The actual page UI lives in `_client.tsx` ("use client").
// ---------------------------------------------------------------------------

export const runtime = "edge";

import SimulateClient from "./_client";

export default function SimulatePage() {
  return <SimulateClient />;
}
