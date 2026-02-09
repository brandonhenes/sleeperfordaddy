import type { Config } from "tailwindcss";

export default {
  content: ["./client/src/**/*.{ts,tsx}", "./client/index.html"],
  theme: {
    extend: {
      colors: {
        sleeper: {
          dark: "#1a1d2e",
          darker: "#151829",
          accent: "#00b4d8",
          surface: "#252942",
          border: "#2d3154",
          text: "#e2e8f0",
          muted: "#94a3b8",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
