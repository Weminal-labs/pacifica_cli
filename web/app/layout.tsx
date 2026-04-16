import type { Metadata } from "next";
import { Red_Hat_Display } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const redHat = Red_Hat_Display({
  variable: "--font-red-hat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Pacifica — Code your trading instinct",
  description: "Composable AI patterns for perp DEX traders. CLI + MCP + pattern primitive.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${redHat.variable} antialiased bg-[#0A0A0A]`}>
        <header className="h-16 fixed z-50 w-full bg-[#0A0A0A] border-b border-neutral-500/20 flex justify-center">
          <div className="max-w-content w-full flex items-center justify-between px-4 border-x border-neutral-500/20">
            <Link
              href="/"
              className="text-base font-semibold tracking-tight text-white flex items-center gap-1.5"
            >
              <span>Pacifica</span>
              <span className="bg-orange-500 px-1.5 py-px text-black text-xs font-bold rounded">
                PATTERNS
              </span>
            </Link>

            <nav className="flex items-center gap-6 text-sm text-neutral-400 font-medium">
              <Link href="/patterns" className="hover:text-white transition-colors">
                Patterns
              </Link>
              <Link href="/simulate" className="hover:text-white transition-colors">
                Simulate
              </Link>
              <a
                href="https://github.com/Weminal-labs/pacifica_cli"
                target="_blank"
                rel="noopener noreferrer"
                className="text-black bg-orange-500 px-3 py-1 text-xs font-semibold hover:bg-orange-400 transition-colors rounded-sm"
              >
                Install CLI →
              </a>
            </nav>
          </div>
        </header>

        <div className="pt-16 relative bg-[#0A0A0A]">
          <div className="max-w-content mx-auto border-x border-neutral-500/20 min-h-[calc(100dvh-4rem)]">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
