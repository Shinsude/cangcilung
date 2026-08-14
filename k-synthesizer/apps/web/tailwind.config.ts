import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        card: "#111827",
        border: "#1f2937",
        primary: "#3b82f6",
        bullish: "#22c55e",
        bearish: "#ef4444",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
