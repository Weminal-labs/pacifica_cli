import type { Metadata } from "next";
import { Red_Hat_Display } from "next/font/google";
import "./globals.css";
import { WalletButton } from "./_components/WalletButton";
import { NavDropdown } from "./_components/NavDropdown";

const redHat = Red_Hat_Display({
  variable: "--font-red-hat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Pacifica Intelligence",
  description: "Agent-readable market intelligence layer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${redHat.variable} antialiased bg-[#0A0A0A]`}>
        {/* ── Fixed navbar — full-width outer, border-column inner ── */}
        <header className="h-16 fixed z-50 w-full bg-[#0A0A0A] border-b border-neutral-500/20 flex justify-center">
          <div className="max-w-content w-full flex items-center justify-between px-4 border-x border-neutral-500/20">
            {/* Logo */}
            <div className="text-base font-semibold tracking-tight text-white flex items-center gap-1.5">
              <span>Pacifica</span>
              <span className="bg-orange-500 px-1.5 py-px text-black text-xs font-bold rounded">
                INTELLIGENCE
              </span>
            </div>

            {/* Nav links */}
            <nav className="flex items-center gap-6 text-sm text-neutral-400 font-medium">
              <NavDropdown
                label="Intel"
                items={[
                  { label: "Feed",     href: "/",         description: "Live market signals" },
                  { label: "Patterns", href: "/patterns", description: "Verified trade patterns" },
                  { label: "Watch",    href: "/watch",    description: "Monitor markets" },
                ]}
              />
              <NavDropdown
                label="Traders"
                items={[
                  { label: "Reputation",  href: "/reputation",  description: "On-chain rep scores" },
                  { label: "Leaderboard", href: "/leaderboard", description: "Top PnL traders" },
                ]}
              />
              <NavDropdown
                label="Tools"
                items={[
                  { label: "Simulate", href: "/simulate", description: "Risk simulator" },
                  { label: "Copy",     href: "/copy",     description: "Copy top traders" },
                  { label: "Guide",    href: "/guide",    description: "How to use the dashboard" },
                  { label: "Install CLI", href: "/install", description: "Get the trading terminal" },
                ]}
              />
              <a
                href="/snapshot"
                className="text-black bg-orange-500 px-3 py-1 text-xs font-semibold hover:bg-orange-400 transition-colors rounded-sm"
              >
                Scanner →
              </a>
              <WalletButton />
            </nav>
          </div>
        </header>

        {/* ── Page content — border-column wrapper ── */}
        <div className="pt-16 relative bg-[#0A0A0A]">
          <div className="max-w-content mx-auto border-x border-neutral-500/20 min-h-[calc(100dvh-4rem)]">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
