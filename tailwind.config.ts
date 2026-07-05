import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sakura: {
          50: "var(--appearance-accent-50)",
          100: "var(--appearance-accent-100)",
          200: "var(--appearance-accent-200)",
          300: "var(--appearance-accent-300)",
          400: "var(--appearance-accent-400)",
          500: "var(--appearance-accent-500)",
          600: "var(--appearance-accent-600)",
          700: "var(--appearance-accent-700)",
          800: "var(--appearance-accent-800)",
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
