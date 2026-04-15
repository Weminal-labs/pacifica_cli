"use client";

import { useState, useEffect, useCallback } from "react";

const KEY = "pacifica_sub_labels";

export function useSubaccountLabels() {
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLabels(JSON.parse(raw) as Record<string, string>);
    } catch { /* ignore parse errors */ }
  }, []);

  const rename = useCallback((address: string, name: string) => {
    setLabels((prev) => {
      const next = { ...prev, [address]: name };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { labels, rename };
}
