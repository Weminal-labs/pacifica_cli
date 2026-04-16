// ---------------------------------------------------------------------------
// /mcp — Server wrapper for edge runtime (Cloudflare Pages requires every
// route to declare `runtime = "edge"` at the server boundary).
// The actual page UI lives in `_client.tsx` ("use client").
// ---------------------------------------------------------------------------

export const runtime = "edge";

import McpClient from "./_client";

export default function McpPage() {
  return <McpClient />;
}
