import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        videoPlayer: "video-player.html",
      },
    },
  },
  server: {
    watch: {
      ignored: [
        "src-tauri/target",
        "src-tauri/target/**",
        "**/src-tauri/target/**",
        /(?:^|[\\/])manual-smoke(?:[\\/]|$)/,
      ],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
