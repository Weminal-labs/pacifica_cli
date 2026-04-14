const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4242";

export async function fetchFeed() {
  const res = await fetch(`${API_BASE}/api/intelligence/feed`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error("Failed to fetch feed");
  return res.json();
}

export async function fetchPatterns() {
  const res = await fetch(`${API_BASE}/api/intelligence/patterns`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error("Failed to fetch patterns");
  return res.json();
}

export async function fetchReputation() {
  const res = await fetch(`${API_BASE}/api/intelligence/reputation`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error("Failed to fetch reputation");
  return res.json();
}

export async function fetchSnapshot(market: string) {
  const res = await fetch(`${API_BASE}/api/intelligence/snapshot/${market}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error("Failed to fetch snapshot");
  return res.json();
}
