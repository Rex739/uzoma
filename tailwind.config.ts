import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
      colors: {
        ink: "#070b11",
        panel: "#0c121b",
        line: "#1d2937",
        cyan: "#23d5f5",
        gold: "#e9b949",
        emerald: "#34d399",
      },
      boxShadow: { glow: "0 0 40px rgba(35,213,245,.1)" },
    },
  },
  plugins: [],
} satisfies Config;
