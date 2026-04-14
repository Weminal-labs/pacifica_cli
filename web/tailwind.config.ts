import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Pacifica design tokens
        bg: { primary: "#0A0A0A", surface: "#141414", card: "#1C1C1C" },
        accent: "#F97316",
        border: "#1F1F1F",
        muted: "#6B7280",
        // Neutral scale (mirrors Tailwind default — needed for border-neutral-500/20 etc.)
        neutral: {
          50:  "#fafafa",
          100: "#f5f5f5",
          200: "#e5e5e5",
          300: "#d4d4d4",
          400: "#a3a3a3",
          500: "#737373",
          600: "#525252",
          700: "#404040",
          800: "#262626",
          900: "#171717",
          950: "#0a0a0a",
        },
        // Orange scale (for bg-orange-500 / hover:bg-orange-400)
        orange: {
          400: "#fb923c",
          500: "#f97316",
          900: "#7c2d12",
        },
      },
      fontFamily: {
        sans:  ["var(--font-red-hat)", "Inter", "system-ui", "sans-serif"],
        mono:  ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        redhat: ["var(--font-red-hat)", "sans-serif"],
      },
      maxWidth: {
        "content": "81.25rem",   // 1300px — matches reference w-325
      },
      // min-h / h helpers
      minHeight: {
        dvh: "100dvh",
      },
      height: {
        dvh: "100dvh",
      },
    },
  },
  plugins: [],
};

export default config;
