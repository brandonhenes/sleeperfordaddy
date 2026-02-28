import type { Config } from "tailwindcss";

export default {
  content: ["./client/src/**/*.{ts,tsx}", "./client/index.html"],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: "#0a0f1a",
          base: "#0f172a",
        },
        card: {
          DEFAULT: "#1e293b",
          hover: "#263548",
        },
        border: "#334155",
        amber: {
          DEFAULT: "#f59e0b",
          dark: "#d97706",
        },
        primary: "#f1f5f9",
        dim: "#94a3b8",
        muted: "#64748b",
        pos: {
          qb: "#60a5fa",
          rb: "#4ade80",
          wr: "#f59e0b",
          te: "#c084fc",
        },
        green: "#4ade80",
        red: "#f87171",
        blue: "#60a5fa",
        purple: "#c084fc",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        body: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
