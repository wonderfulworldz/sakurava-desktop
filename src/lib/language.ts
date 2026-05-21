export type LanguageCode = string;

export type SupportedLanguage = {
  code: string;
  label: string;
  nativeLabel: string;
};

export const languageStorageKey = "sakurava.language.selected.v1";
export const defaultLanguageCode: LanguageCode = "en";

const builtInLanguages: SupportedLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English" },
];

export { builtInLanguages };

export function getSupportedLanguages(): SupportedLanguage[] {
  if (typeof window === "undefined") {
    return builtInLanguages;
  }

  try {
    // Get removed bundled languages
    const removedRaw = window.localStorage.getItem("sakurava.removedBundledLanguages.v1");
    const removedBundled: string[] = removedRaw ? JSON.parse(removedRaw) ?? [] : [];

    // Include bundled languages that haven't been removed
    const bundled: SupportedLanguage[] = [
      { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
    ].filter((b) => !removedBundled.includes(b.code));

    // Get custom languages from storage
    const raw = window.localStorage.getItem("sakurava.customLanguages.v1");
    if (!raw) {
      return [...builtInLanguages, ...bundled];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...builtInLanguages, ...bundled];
    }
    const allBuiltInAndBundled = [...builtInLanguages, ...bundled];
    const customEntries: SupportedLanguage[] = parsed
      .filter(
        (item: unknown): item is { code: string; label: string } =>
          !!item &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).code === "string" &&
          typeof (item as Record<string, unknown>).label === "string" &&
          !allBuiltInAndBundled.some((b) => b.code === (item as Record<string, unknown>).code),
      )
      .map((lang) => ({
        code: lang.code,
        label: lang.label,
        nativeLabel: lang.label,
      }));
    return [...allBuiltInAndBundled, ...customEntries];
  } catch {
    return builtInLanguages;
  }
}

/** @deprecated Use getSupportedLanguages() for dynamic list */
export const supportedLanguages = builtInLanguages;

type TranslationDictionary = Partial<Record<string, string>>;

const englishDictionary: TranslationDictionary = {
  // Sidebar
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

  // Settings
  "settings.title": "Settings",
  "settings.description":
    "Manage application preferences, optimization, data safety, and app information.",
  "settings.resetToDefaults": "Reset to Defaults",
  "settings.appearance.title": "Appearance",
  "settings.appearance.description": "Customize how Sakurava looks and feels.",
  "settings.appearance.theme": "Theme",
  "settings.appearance.themeHelper": "Choose your preferred application theme.",
  "settings.appearance.light": "Light",
  "settings.appearance.dark": "Dark",
  "settings.appearance.accentStyle": "Accent Style",
  "settings.appearance.accentStyleHelper": "Select the accent color used across the app.",
  "settings.appearance.sakuraPinkSelected": "Sakura Pink selected",
  "settings.appearance.uiDensity": "UI Density",
  "settings.appearance.uiDensityHelper": "Control the size of UI elements and spacing.",
  "settings.appearance.compact": "Compact",
  "settings.appearance.comfortable": "Comfortable",
  "settings.appearance.spacious": "Spacious",
  "settings.language.title": "Language",
  "settings.language.description":
    "Choose app language and prepare local translation editing.",
  "settings.language.appLanguage": "App Language",
  "settings.language.appLanguageHelper":
    "Choose the language used in the application.",
  "settings.language.catalogDataHelper":
    "Changes apply to app UI only. Catalog data is not translated.",
  "settings.language.installedLanguages": "Installed Languages",
  "settings.language.installedLanguagesHelper": "Manage installed language packs.",
  "settings.language.upToDate": "Up to date",
  "settings.optimization.title": "Optimization",
  "settings.optimization.description":
    "Manage media access, cache status, and future library optimization.",
  "settings.optimization.mediaLibrary": "Media & Library",
  "settings.optimization.mediaLibraryHelper": "Manage how media files are loaded and processed.",
  "settings.optimization.addMediaRoot": "Add Media Root",
  "settings.optimization.addingMediaRoot": "Adding Media Root...",
  "settings.optimization.cache": "Cache",
  "settings.optimization.cacheHelper": "Manage temporary files used to speed up the app.",
  "settings.optimization.clearCache": "Clear Cache",
  "settings.optimization.clearingCache": "Clearing Cache...",
  "settings.optimization.catalogPreferences": "Catalog Preferences",
  "settings.optimization.catalogPreferencesHelper": "Control how your catalog data is displayed.",
  "settings.dataSafety.title": "Data Safety & Migration",
  "settings.dataSafety.description": "Back up, restore, import, and export data safely.",
  "settings.dataSafety.backupDatabase": "Backup Database",
  "settings.dataSafety.backingUp": "Backing Up...",
  "settings.dataSafety.restoreDatabase": "Restore Database",
  "settings.dataSafety.restoring": "Restoring...",
  "settings.dataSafety.importData": "Import Data",
  "settings.dataSafety.exportData": "Export Data",
  "settings.appInformation.title": "App Information",
  "settings.appInformation.description":
    "Review local runtime status, system safety, and diagnostics.",

  // Home
  "home.welcome": "Welcome to Sakurava",
  "home.welcomeDescription":
    "Manage your local video, image, and performer catalog in one private desktop app.",
  "home.getStarted": "Get Started",
  "home.quickActions": "Quick Actions",
  "home.continueCataloging": "Continue Cataloging",
  "home.recentlyAdded": "Recently Added",
  "home.loadingCatalog": "Loading catalog items...",
  "home.noRecordsYet": "No records yet.",
  "home.noRecentRecords":
    "No recent records yet. Videos, Images, and Performers will appear here after they are saved.",
  "home.summaryVideos": "Videos",
  "home.summaryImages": "Images",
  "home.summaryPerformers": "Performers",
  "home.summaryFavorites": "Favorites",
  "home.addVideo": "Add Video",
  "home.addVideoDetail": "Create a new video catalog item",
  "home.addImage": "Add Image",
  "home.addImageDetail": "Create a new image catalog item",
  "home.addPerformer": "Add Performer",
  "home.addPerformerDetail": "Create a new performer profile",

  // Collection chrome
  "collection.searchPlaceholder.videos": "Search videos...",
  "collection.searchPlaceholder.images": "Search images...",
  "collection.searchPlaceholder.performers": "Search performers...",
  "collection.title.videos": "Videos",
  "collection.title.images": "Images",
  "collection.title.performers": "Performers",
  "collection.subtitle.videos": "Manage your local video catalog",
  "collection.subtitle.images": "Manage your local image catalog",
  "collection.subtitle.performers": "Manage your local performer catalog",
  "collection.addVideo": "Add Video",
  "collection.addImage": "Add Image",
  "collection.addPerformer": "Add Performer",
  "collection.filter": "Filter",
  "collection.view": "View",
  "collection.switchToListView": "Switch to list view",
  "collection.switchToGridView": "Switch to grid view",
  "collection.sorting": "Sorting",
  "collection.categories": "Categories",
  "collection.clearAllFilters": "Clear all filters",
  "collection.clearAll": "Clear all",
  "collection.categoryLimitReached": "Up to 5 category filters can be active.",
  "collection.addCategoryFilter": "Add category filter",
  "collection.pageSize": "Page size",
  "collection.perPage": "per page",
  "collection.previous": "Previous",
  "collection.next": "Next",
  "collection.noMatchingItems": "No matching items",
  "collection.noMatchingItemsHint": "Try a different search term or sort option.",
  "collection.noSavedRecords": "No saved records",
  "collection.noSavedRecordsHint":
    "Collection cards will appear here when saved items are available.",
  "collection.itemsPerPage": "Items per page",
};

const indonesianDictionary: TranslationDictionary = {
  // Sidebar
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

  // Settings
  "settings.title": "Pengaturan",
  "settings.description":
    "Kelola preferensi aplikasi, optimasi, keamanan data, dan informasi aplikasi.",
  "settings.resetToDefaults": "Atur Ulang ke Default",
  "settings.appearance.title": "Tampilan",
  "settings.appearance.description": "Sesuaikan tampilan dan nuansa Sakurava.",
  "settings.appearance.theme": "Tema",
  "settings.appearance.themeHelper": "Pilih tema aplikasi yang Anda inginkan.",
  "settings.appearance.light": "Terang",
  "settings.appearance.dark": "Gelap",
  "settings.appearance.accentStyle": "Gaya Aksen",
  "settings.appearance.accentStyleHelper": "Pilih warna aksen yang digunakan di seluruh aplikasi.",
  "settings.appearance.sakuraPinkSelected": "Sakura Pink dipilih",
  "settings.appearance.uiDensity": "Kepadatan UI",
  "settings.appearance.uiDensityHelper": "Kontrol ukuran elemen UI dan jarak.",
  "settings.appearance.compact": "Kompak",
  "settings.appearance.comfortable": "Nyaman",
  "settings.appearance.spacious": "Luas",
  "settings.language.title": "Bahasa",
  "settings.language.description":
    "Pilih bahasa aplikasi dan siapkan pengeditan terjemahan lokal.",
  "settings.language.appLanguage": "Bahasa Aplikasi",
  "settings.language.appLanguageHelper": "Pilih bahasa yang digunakan di aplikasi.",
  "settings.language.catalogDataHelper":
    "Perubahan hanya berlaku untuk UI aplikasi. Data katalog tidak diterjemahkan.",
  "settings.language.installedLanguages": "Bahasa Terpasang",
  "settings.language.installedLanguagesHelper": "Kelola paket bahasa terpasang.",
  "settings.language.upToDate": "Terbaru",
  "settings.optimization.title": "Optimasi",
  "settings.optimization.description":
    "Kelola akses media, status cache, dan optimasi pustaka mendatang.",
  "settings.optimization.mediaLibrary": "Media & Pustaka",
  "settings.optimization.mediaLibraryHelper": "Kelola cara file media dimuat dan diproses.",
  "settings.optimization.addMediaRoot": "Tambah Root Media",
  "settings.optimization.addingMediaRoot": "Menambahkan Root Media...",
  "settings.optimization.cache": "Cache",
  "settings.optimization.cacheHelper": "Kelola file sementara yang digunakan untuk mempercepat aplikasi.",
  "settings.optimization.clearCache": "Hapus Cache",
  "settings.optimization.clearingCache": "Menghapus Cache...",
  "settings.optimization.catalogPreferences": "Preferensi Katalog",
  "settings.optimization.catalogPreferencesHelper": "Kontrol bagaimana data katalog Anda ditampilkan.",
  "settings.dataSafety.title": "Keamanan Data & Migrasi",
  "settings.dataSafety.description":
    "Cadangkan, pulihkan, impor, dan ekspor data dengan aman.",
  "settings.dataSafety.backupDatabase": "Cadangkan Database",
  "settings.dataSafety.backingUp": "Mencadangkan...",
  "settings.dataSafety.restoreDatabase": "Pulihkan Database",
  "settings.dataSafety.restoring": "Memulihkan...",
  "settings.dataSafety.importData": "Impor Data",
  "settings.dataSafety.exportData": "Ekspor Data",
  "settings.appInformation.title": "Informasi Aplikasi",
  "settings.appInformation.description":
    "Tinjau status runtime lokal, keamanan sistem, dan diagnostik.",

  // Home
  "home.welcome": "Selamat Datang di Sakurava",
  "home.welcomeDescription":
    "Kelola katalog video, gambar, dan performer lokal Anda dalam satu aplikasi desktop pribadi.",
  "home.getStarted": "Mulai",
  "home.quickActions": "Aksi Cepat",
  "home.continueCataloging": "Lanjutkan Katalog",
  "home.recentlyAdded": "Baru Ditambahkan",
  "home.loadingCatalog": "Memuat item katalog...",
  "home.noRecordsYet": "Belum ada catatan.",
  "home.noRecentRecords":
    "Belum ada catatan terbaru. Video, Gambar, dan Performer akan muncul di sini setelah disimpan.",
  "home.summaryVideos": "Video",
  "home.summaryImages": "Gambar",
  "home.summaryPerformers": "Performer",
  "home.summaryFavorites": "Favorit",
  "home.addVideo": "Tambah Video",
  "home.addVideoDetail": "Buat item katalog video baru",
  "home.addImage": "Tambah Gambar",
  "home.addImageDetail": "Buat item katalog gambar baru",
  "home.addPerformer": "Tambah Performer",
  "home.addPerformerDetail": "Buat profil performer baru",

  // Collection chrome
  "collection.searchPlaceholder.videos": "Cari video...",
  "collection.searchPlaceholder.images": "Cari gambar...",
  "collection.searchPlaceholder.performers": "Cari performer...",
  "collection.title.videos": "Video",
  "collection.title.images": "Gambar",
  "collection.title.performers": "Performer",
  "collection.subtitle.videos": "Kelola katalog video lokal Anda",
  "collection.subtitle.images": "Kelola katalog gambar lokal Anda",
  "collection.subtitle.performers": "Kelola katalog performer lokal Anda",
  "collection.addVideo": "Tambah Video",
  "collection.addImage": "Tambah Gambar",
  "collection.addPerformer": "Tambah Performer",
  "collection.filter": "Filter",
  "collection.view": "Tampilan",
  "collection.switchToListView": "Beralih ke tampilan daftar",
  "collection.switchToGridView": "Beralih ke tampilan grid",
  "collection.sorting": "Urutan",
  "collection.categories": "Kategori",
  "collection.clearAllFilters": "Hapus semua filter",
  "collection.clearAll": "Hapus semua",
  "collection.categoryLimitReached": "Maksimal 5 filter kategori dapat aktif.",
  "collection.addCategoryFilter": "Tambah filter kategori",
  "collection.pageSize": "Ukuran halaman",
  "collection.perPage": "per halaman",
  "collection.previous": "Sebelumnya",
  "collection.next": "Berikutnya",
  "collection.noMatchingItems": "Tidak ada item yang cocok",
  "collection.noMatchingItemsHint": "Coba kata pencarian atau opsi urutan yang berbeda.",
  "collection.noSavedRecords": "Tidak ada catatan tersimpan",
  "collection.noSavedRecordsHint":
    "Kartu koleksi akan muncul di sini ketika item tersimpan tersedia.",
  "collection.itemsPerPage": "Item per halaman",
};

const dictionaries: Record<LanguageCode, TranslationDictionary> = {
  en: englishDictionary,
  id: indonesianDictionary,
};

export function getAllTranslationKeys(): string[] {
  const keySet = new Set<string>();
  for (const dictionary of Object.values(dictionaries)) {
    for (const key of Object.keys(dictionary)) {
      keySet.add(key);
    }
  }
  return [...keySet].sort();
}

export function getBuiltInText(
  languageCode: LanguageCode,
  key: string,
): string | undefined {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  const dict = dictionaries[normalizedLanguage as keyof typeof dictionaries];
  return dict?.[key];
}

export function getKeyDescription(key: string): string {
  const parts = key.split(".");
  if (parts.length <= 1) {
    return key;
  }
  // Use the section prefix as a readable description
  return parts.slice(0, -1).join(" > ");
}

export function normalizeLanguageCode(value: unknown): LanguageCode {
  if (typeof value !== "string") {
    return defaultLanguageCode;
  }

  const normalized = value.trim().toLowerCase();
  const allLanguages = getSupportedLanguages();
  return allLanguages.some((language) => language.code === normalized)
    ? normalized
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
  overrides: Partial<Record<string, string>> = {},
) {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  const builtInDict = dictionaries[normalizedLanguage as keyof typeof dictionaries];
  const translated =
    overrides[key] ??
    builtInDict?.[key] ??
    dictionaries[defaultLanguageCode][key] ??
    key;

  return Object.entries(replacements).reduce(
    (text, [replacementKey, replacementValue]) =>
      text.split(`{${replacementKey}}`).join(replacementValue),
    translated,
  );
}
