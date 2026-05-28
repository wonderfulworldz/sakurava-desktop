import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sakura: {
          50: "#fff4f7",
          100: "#ffe6ee",
          200: "#ffc7d8",
          300: "#ffa3bf",
          400: "#f87da3",
          500: "#f16f9b",
          600: "#d84f7f",
          700: "#b83d66",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
