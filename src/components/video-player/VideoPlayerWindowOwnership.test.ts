import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import appShellSource from "../../layouts/AppShell.tsx?raw";
import detailSource from "../../pages/DetailPage.tsx?raw";
import appearanceSource from "../../lib/appearanceTheme.ts?raw";
import videoPlayerSource from "./VideoPlayerPrototype.tsx?raw";
import contactSheetSource from "./ContactSheetWindow.tsx?raw";
import videoCapabilitySource from "../../../src-tauri/capabilities/video-player.json?raw";
import contactCapabilitySource from "../../../src-tauri/capabilities/contact-sheet.json?raw";

describe("Video Player auxiliary-window ownership", () => {
  it("keeps Notification UI in the main AppShell and branches auxiliary roots before it", () => {
    expect(appShellSource).toContain("<NotificationCenter />");
    expect(appSource).toContain("sakuravaWindowKind === VIDEO_PLAYER_WINDOW_KIND");
    expect(appSource).toContain("<VideoPlayerWindow />");
    expect(appSource).toContain("sakuravaWindowKind === CONTACT_SHEET_WINDOW_KIND");
    expect(appSource).toContain("<ContactSheetWindow />");
    expect(appSource).toContain("if (isImageViewerWindow)");
    expect(appSource.indexOf("<VideoPlayerWindow />")).toBeLessThan(
      appSource.indexOf("<Route element={<AppShell />}>"),
    );
    expect(appSource.indexOf("<ContactSheetWindow />")).toBeLessThan(
      appSource.indexOf("<Route element={<AppShell />}>"),
    );
    expect(videoPlayerSource).not.toContain("NotificationCenter");
    expect(contactSheetSource).not.toContain("NotificationCenter");
  });

  it("preserves cover to Image Viewer and gives Play the Video Player seam", () => {
    expect(detailSource).toContain("<LargePlaceholder");
    expect(detailSource).toContain("openGlobalImageViewerWindow");
    expect(detailSource).toContain("openVideoPlayerWindow({");
    expect(detailSource).toContain("sourceIdentity: config.recordId");
    expect(detailSource).not.toContain("<VideoPlayerPrototype");
  });

  it("uses shared Sakurava appearance state and dark/accent utility tokens", () => {
    expect(appSource).toContain("applyAppearanceTheme(appearanceTheme)");
    expect(appearanceSource).toContain("document.documentElement.dataset.theme =");
    expect(videoPlayerSource).toContain('data-theme-source="sakurava-appearance"');
    expect(contactSheetSource).toContain('data-theme-source="sakurava-appearance"');
    expect(videoPlayerSource).toContain("dark:bg-slate-900");
    expect(videoPlayerSource).toContain("focus-visible:ring-sakura-400");
    expect(contactSheetSource).toContain("dark:bg-slate-900");
  });

  it("grants only narrow window-label capabilities", () => {
    const videoCapability = JSON.parse(videoCapabilitySource);
    const contactCapability = JSON.parse(contactCapabilitySource);
    expect(videoCapability.windows).toEqual(["video-player"]);
    expect(videoCapability.permissions).toEqual([
      "core:default",
      "core:webview:allow-create-webview-window",
      "core:window:allow-set-focus",
      "core:window:allow-set-fullscreen",
      "core:window:allow-set-always-on-top",
    ]);
    expect(contactCapability.windows).toEqual(["contact-sheet"]);
    expect(contactCapability.permissions).toEqual([
      "core:default",
      "core:window:allow-close",
      "core:window:allow-destroy",
      "core:window:allow-set-focus",
      "dialog:allow-save",
    ]);
  });

  it("cleans Contact Sheet artifacts before native window close completes", () => {
    expect(contactSheetSource).toContain("onCloseRequested");
    expect(contactSheetSource).toContain("event.preventDefault()");
    expect(contactSheetSource).toContain("await cancelContactSheet(null)");
    expect(contactSheetSource).toContain("await cleanupContactSheet(previewRef.current)");
    expect(contactSheetSource.indexOf("await cleanupContactSheet(previewRef.current)")).toBeLessThan(
      contactSheetSource.indexOf("await appWindow.destroy()"),
    );
  });
});
