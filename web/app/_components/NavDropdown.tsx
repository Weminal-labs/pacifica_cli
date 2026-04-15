"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  description?: string;
}

interface NavGroupProps {
  label: string;
  items: NavItem[];
}

export function NavDropdown({ label, items }: NavGroupProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const isActive = items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        className={`flex items-center gap-1 text-sm font-medium transition-colors ${
          isActive ? "text-white" : "text-neutral-400 hover:text-white"
        }`}
      >
        {label}
        <svg
          className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-44 bg-[#111111] border border-neutral-500/20 py-1 z-50"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
        >
          {/* corner brackets */}
          <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/60" />
          <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/60" />
          <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/60" />
          <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/60" />

          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex flex-col px-3 py-2 transition-colors border-b border-neutral-500/10 last:border-0 ${
                  active
                    ? "text-orange-400 bg-orange-500/5"
                    : "text-neutral-300 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="text-sm font-medium">{item.label}</span>
                {item.description && (
                  <span className="text-[10px] font-mono text-neutral-600 mt-0.5">{item.description}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
