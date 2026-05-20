export type LanguageCode = "en" | "id";

export type SupportedLanguage = {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
};

export const languageStorageKey = "sakurava.language.selected.v1";
export const defaultLanguageCode: LanguageCode = "en";

export const supportedLanguages: SupportedLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
];

type TranslationDictionary = Partial<Record<string, string>>;

const englishDictionary: TranslationDictionary = {
  "app.sidebar.subtitle": "Private local catalog",
  "app.sidebar.expand": "Expand sidebar",
  "app.sidebar.collapse": "Collapse sidebar",
  "app.sidebar.navigateTo": "Navigate to {label}",
  "nav.home": "Home",
  "nav.videos": "Videos",
  "nav.images": "Images",
  "nav.performers": "Performers",
  "nav.categories": "Categories",
  "nav.settings": "Settings",
  "settings.title": "Settings",
  "settings.description":
    "Manage application preferences, optimization, data safety, and app information.",
  "settings.resetToDefaults": "Reset to Defaults",
  "settings.appearance.title": "Appearance",
  "settings.appearance.description": "Customize how Sakurava looks and feels.",
  "settings.language.title": "Language",
  "settings.language.description":
    "Choose app language and prepare local translation editing.",
  "settings.language.appLanguage": "App Language",
  "settings.language.appLanguageHelper":
    "Choose the language used in the application.",
  "settings.language.catalogDataHelper":
    "Changes apply to app UI only. Catalog data is not translated.",
  "settings.language.editorTitle": "Translation Tools / Language Editor",
  "settings.language.editorHelper":
    "Create and edit translations for supported languages.",
  "settings.language.openEditor": "Open Language Editor",
  "settings.language.editorPlanned":
    "Language Editor remains planned for Batch 34.12.",
  "settings.language.csvPlanned":
    "Language CSV Export/Import remains planned for Batch 34.13.",
  "settings.language.customLanguagePlanned":
    "Custom Language Add/Manage remains planned for Batch 34.14.",
  "settings.language.installedLanguages": "Installed Languages",
  "settings.language.installedLanguagesHelper": "Manage installed language packs.",
  "settings.language.upToDate": "Up to date",
  "settings.optimization.title": "Optimization",
  "settings.optimization.description":
    "Manage media access, cache status, and future library optimization.",
  "settings.dataSafety.title": "Data Safety & Migration",
  "settings.dataSafety.description": "Back up, restore, import, and export data safely.",
  "settings.appInformation.title": "App Information",
  "settings.appInformation.description":
    "Review local runtime status, system safety, and diagnostics.",
};

const indonesianDictionary: TranslationDictionary = {
  "app.sidebar.subtitle": "Katalog lokal pribadi",
  "app.sidebar.expand": "Perluas sidebar",
  "app.sidebar.collapse": "Ciutkan sidebar",
  "app.sidebar.navigateTo": "Buka {label}",
  "nav.home": "Beranda",
  "nav.videos": "Video",
  "nav.images": "Gambar",
  "nav.performers": "Performer",
  "nav.categories": "Kategori",
  "nav.settings": "Pengaturan",
  "settings.title": "Pengaturan",
  "settings.description":
    "Kelola preferensi aplikasi, optimasi, keamanan data, dan informasi aplikasi.",
  "settings.appearance.title": "Tampilan",
  "settings.appearance.description": "Sesuaikan tampilan dan nuansa Sakurava.",
  "settings.language.title": "Bahasa",
  "settings.language.description":
    "Pilih bahasa aplikasi dan siapkan pengeditan terjemahan lokal.",
  "settings.language.appLanguage": "Bahasa Aplikasi",
  "settings.language.appLanguageHelper": "Pilih bahasa yang digunakan di aplikasi.",
  "settings.language.catalogDataHelper":
    "Perubahan hanya berlaku untuk UI aplikasi. Data katalog tidak diterjemahkan.",
  "settings.language.editorTitle": "Alat Terjemahan / Editor Bahasa",
  "settings.language.editorHelper":
    "Buat dan edit terjemahan untuk bahasa yang didukung.",
  "settings.language.openEditor": "Buka Editor Bahasa",
  "settings.language.editorPlanned":
    "Editor Bahasa tetap direncanakan untuk Batch 34.12.",
  "settings.language.csvPlanned":
    "Ekspor/Impor CSV Bahasa tetap direncanakan untuk Batch 34.13.",
  "settings.language.customLanguagePlanned":
    "Tambah/Kelola Bahasa Kustom tetap direncanakan untuk Batch 34.14.",
  "settings.language.installedLanguages": "Bahasa Terpasang",
  "settings.language.installedLanguagesHelper": "Kelola paket bahasa terpasang.",
  "settings.language.upToDate": "Terbaru",
  "settings.optimization.title": "Optimasi",
  "settings.optimization.description":
    "Kelola akses media, status cache, dan optimasi pustaka mendatang.",
  "settings.dataSafety.title": "Keamanan Data & Migrasi",
  "settings.dataSafety.description":
    "Cadangkan, pulihkan, impor, dan ekspor data dengan aman.",
  "settings.appInformation.title": "Informasi Aplikasi",
  "settings.appInformation.description":
    "Tinjau status runtime lokal, keamanan sistem, dan diagnostik.",
};

const dictionaries: Record<LanguageCode, TranslationDictionary> = {
  en: englishDictionary,
  id: indonesianDictionary,
};

export function normalizeLanguageCode(value: unknown): LanguageCode {
  if (typeof value !== "string") {
    return defaultLanguageCode;
  }

  const normalized = value.trim().toLowerCase();
  return supportedLanguages.some((language) => language.code === normalized)
    ? (normalized as LanguageCode)
    : defaultLanguageCode;
}

export function getStoredLanguageCode(): LanguageCode {
  if (typeof window === "undefined") {
    return defaultLanguageCode;
  }

  try {
    return normalizeLanguageCode(window.localStorage.getItem(languageStorageKey));
  } catch {
    return defaultLanguageCode;
  }
}

export function storeLanguageCode(languageCode: LanguageCode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(languageStorageKey, languageCode);
  } catch {
    // Language is a low-risk UI preference. Failed persistence should not block the app.
  }
}

export function translate(
  languageCode: LanguageCode,
  key: string,
  replacements: Record<string, string> = {},
) {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  const translated =
    dictionaries[normalizedLanguage][key] ?? dictionaries[defaultLanguageCode][key] ?? key;

  return Object.entries(replacements).reduce(
    (text, [replacementKey, replacementValue]) =>
      text.split(`{${replacementKey}}`).join(replacementValue),
    translated,
  );
}
