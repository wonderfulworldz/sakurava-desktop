import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type WatcherMatchResult = {
  readonly manualSmokeWindows: boolean;
  readonly manualSmokeSlash: boolean;
  readonly tauriTarget: boolean;
  readonly settingsSource: boolean;
  readonly viteConfig: boolean;
  readonly pluginCount: number;
  readonly testEnvironment: string | undefined;
};

describe("Vite development watcher configuration", () => {
  it("ignores disposable manual-smoke evidence without excluding source paths", () => {
    const script = `
      import anymatch from "anymatch";
      import { loadConfigFromFile } from "vite";

      const loaded = await loadConfigFromFile(
        { command: "serve", mode: "test" },
        "vite.config.ts",
        process.cwd(),
        "silent",
      );
      if (!loaded) throw new Error("Vite configuration did not load.");

      const ignored = loaded.config.server?.watch?.ignored;
      if (!ignored) throw new Error("Vite watcher ignore configuration is missing.");

      const matchesIgnored = anymatch(Array.isArray(ignored) ? ignored : [ignored]);
      console.log(JSON.stringify({
        manualSmokeWindows: matchesIgnored("D:\\\\sakurava-desktop\\\\manual-smoke\\\\example\\\\webview2-user-data\\\\EBWebView\\\\file"),
        manualSmokeSlash: matchesIgnored("D:/sakurava-desktop/manual-smoke/example/webview2-user-data/EBWebView/file"),
        tauriTarget: matchesIgnored("src-tauri/target/debug/example"),
        settingsSource: matchesIgnored("src/pages/SettingsPage.tsx"),
        viteConfig: matchesIgnored("vite.config.ts"),
        pluginCount: loaded.config.plugins?.length ?? 0,
        testEnvironment: loaded.config.test?.environment,
      }));
    `;

    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const result = JSON.parse(output) as WatcherMatchResult;

    expect(result.manualSmokeWindows).toBe(true);
    expect(result.manualSmokeSlash).toBe(true);
    expect(result.tauriTarget).toBe(true);
    expect(result.settingsSource).toBe(false);
    expect(result.viteConfig).toBe(false);
    expect(result.pluginCount).toBe(1);
    expect(result.testEnvironment).toBe("jsdom");
  });
});
