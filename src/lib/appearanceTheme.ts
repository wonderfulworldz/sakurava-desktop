export const appearanceThemeStorageKey = "sakurava.appearance.theme.v1";
export const appearanceAccentStorageKey = "sakurava.appearance.accent.v1";
export const appearanceDensityStorageKey = "sakurava.appearance.density.v1";
export const appearanceUiScaleStorageKey = "sakurava.appearance.uiScale.v1";

export type AppearanceTheme = "light" | "dark" | "system";
export type AppearanceAccent =
  | { type: "sakura" }
  | { type: "blue" }
  | { type: "purple" }
  | { type: "custom"; color: string };
export type AppearanceDensity = "comfortable" | "compact";
export type AppearanceUiScale = "90" | "100" | "110";

const fallbackTheme: AppearanceTheme = "light";
export const fallbackAppearanceAccent: AppearanceAccent = { type: "sakura" };
const fallbackDensity: AppearanceDensity = "comfortable";
const fallbackUiScale: AppearanceUiScale = "100";
const systemDarkQuery = "(prefers-color-scheme: dark)";
let removeSystemThemeListener: (() => void) | null = null;
const accentColors = {
  sakura: "#f16f9b",
  blue: "#3b82f6",
  purple: "#8b5cf6",
} as const;

export function normalizeAppearanceTheme(value: unknown): AppearanceTheme {
  return value === "dark" || value === "light" || value === "system"
    ? value
    : fallbackTheme;
}

export function getStoredAppearanceTheme(): AppearanceTheme {
  if (typeof window === "undefined") {
    return fallbackTheme;
  }

  return normalizeAppearanceTheme(
    window.localStorage.getItem(appearanceThemeStorageKey),
  );
}

export function normalizeCustomAccentColor(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance >= 0.1 && luminance <= 0.65 ? value.toLowerCase() : null;
}

export function normalizeAppearanceAccent(value: unknown): AppearanceAccent {
  if (!value || typeof value !== "object") return fallbackAppearanceAccent;
  const candidate = value as { type?: unknown; color?: unknown };
  if (candidate.type === "sakura" || candidate.type === "blue" || candidate.type === "purple") {
    return { type: candidate.type };
  }
  const color = normalizeCustomAccentColor(candidate.color);
  return candidate.type === "custom" && color
    ? { type: "custom", color }
    : fallbackAppearanceAccent;
}

export function getStoredAppearanceAccent(): AppearanceAccent {
  if (typeof window === "undefined") return fallbackAppearanceAccent;
  try {
    return normalizeAppearanceAccent(JSON.parse(window.localStorage.getItem(appearanceAccentStorageKey) ?? ""));
  } catch {
    return fallbackAppearanceAccent;
  }
}

export function applyAppearanceAccent(accent: AppearanceAccent) {
  if (typeof document === "undefined") return;
  const normalized = normalizeAppearanceAccent(accent);
  const color = normalized.type === "custom" ? normalized.color : accentColors[normalized.type];
  document.documentElement.dataset.accent = normalized.type;
  document.documentElement.style.setProperty("--appearance-accent", color);
}

export function storeAppearanceAccent(accent: AppearanceAccent) {
  const normalized = normalizeAppearanceAccent(accent);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(appearanceAccentStorageKey, JSON.stringify(normalized));
  }
  applyAppearanceAccent(normalized);
}

export function normalizeAppearanceDensity(value: unknown): AppearanceDensity {
  return value === "compact" || value === "comfortable" ? value : fallbackDensity;
}

export function getStoredAppearanceDensity(): AppearanceDensity {
  if (typeof window === "undefined") return fallbackDensity;
  return normalizeAppearanceDensity(window.localStorage.getItem(appearanceDensityStorageKey));
}

export function applyAppearanceDensity(density: AppearanceDensity) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.density = normalizeAppearanceDensity(density);
  }
}

export function normalizeAppearanceUiScale(value: unknown): AppearanceUiScale {
  return value === "90" || value === "100" || value === "110"
    ? value
    : fallbackUiScale;
}

export function getStoredAppearanceUiScale(): AppearanceUiScale {
  if (typeof window === "undefined") return fallbackUiScale;
  return normalizeAppearanceUiScale(
    window.localStorage.getItem(appearanceUiScaleStorageKey),
  );
}

export function applyAppearanceUiScale(scale: AppearanceUiScale) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.uiScale = normalizeAppearanceUiScale(scale);
  }
}

export function storeAppearanceUiScale(scale: AppearanceUiScale) {
  const normalized = normalizeAppearanceUiScale(scale);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(appearanceUiScaleStorageKey, normalized);
  }
  applyAppearanceUiScale(normalized);
}

export function storeAppearanceDensity(density: AppearanceDensity) {
  const normalized = normalizeAppearanceDensity(density);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(appearanceDensityStorageKey, normalized);
  }
  applyAppearanceDensity(normalized);
}

export function applyAppearanceTheme(theme: AppearanceTheme) {
  if (typeof document === "undefined") {
    return;
  }

  const normalized = normalizeAppearanceTheme(theme);
  removeSystemThemeListener?.();
  removeSystemThemeListener = null;

  const applyResolvedTheme = () => {
    const isSystemDark =
      normalized === "system" &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(systemDarkQuery).matches;
    document.documentElement.dataset.theme =
      normalized === "system" ? (isSystemDark ? "dark" : "light") : normalized;
    document.documentElement.dataset.themePreference = normalized;
  };
  applyResolvedTheme();

  if (
    normalized === "system" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    const mediaQuery = window.matchMedia(systemDarkQuery);
    mediaQuery.addEventListener?.("change", applyResolvedTheme);
    removeSystemThemeListener = () =>
      mediaQuery.removeEventListener?.("change", applyResolvedTheme);
  }
}

export function storeAppearanceTheme(theme: AppearanceTheme) {
  const normalized = normalizeAppearanceTheme(theme);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(appearanceThemeStorageKey, normalized);
  }

  applyAppearanceTheme(normalized);
}

export function initializeStoredAppearance() {
  applyAppearanceTheme(getStoredAppearanceTheme());
  applyAppearanceAccent(getStoredAppearanceAccent());
  applyAppearanceDensity(getStoredAppearanceDensity());
  applyAppearanceUiScale(getStoredAppearanceUiScale());
}
