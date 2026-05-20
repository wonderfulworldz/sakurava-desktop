export const appearanceThemeStorageKey = "sakurava.appearance.theme.v1";

export type AppearanceTheme = "light" | "dark";

const fallbackTheme: AppearanceTheme = "light";

export function normalizeAppearanceTheme(value: unknown): AppearanceTheme {
  return value === "dark" || value === "light" ? value : fallbackTheme;
}

export function getStoredAppearanceTheme(): AppearanceTheme {
  if (typeof window === "undefined") {
    return fallbackTheme;
  }

  return normalizeAppearanceTheme(
    window.localStorage.getItem(appearanceThemeStorageKey),
  );
}

export function applyAppearanceTheme(theme: AppearanceTheme) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
}

export function storeAppearanceTheme(theme: AppearanceTheme) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(appearanceThemeStorageKey, theme);
  }

  applyAppearanceTheme(theme);
}
