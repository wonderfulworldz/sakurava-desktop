import { describe, expect, it } from "vitest";
import { translate } from "./language";

describe("language coverage - batch 34.11.1", () => {
  it("Indonesian changes Sidebar labels", () => {
    expect(translate("id", "nav.home")).toBe("Beranda");
    expect(translate("id", "nav.videos")).toBe("Video");
    expect(translate("id", "nav.images")).toBe("Gambar");
    expect(translate("id", "nav.performers")).toBe("Performer");
    expect(translate("id", "nav.categories")).toBe("Kategori");
    expect(translate("id", "nav.settings")).toBe("Pengaturan");
    expect(translate("id", "app.sidebar.subtitle")).toBe("Katalog lokal pribadi");
  });

  it("Indonesian changes Settings section labels", () => {
    expect(translate("id", "settings.title")).toBe("Pengaturan");
    expect(translate("id", "settings.appearance.title")).toBe("Tampilan");
    expect(translate("id", "settings.appearance.theme")).toBe("Tema");
    expect(translate("id", "settings.appearance.light")).toBe("Terang");
    expect(translate("id", "settings.appearance.dark")).toBe("Gelap");
    expect(translate("id", "settings.language.title")).toBe("Bahasa");
    expect(translate("id", "settings.optimization.title")).toBe("Optimasi");
    expect(translate("id", "settings.optimization.clearCache")).toBe("Hapus Cache");
    expect(translate("id", "settings.dataSafety.title")).toBe("Keamanan Data & Migrasi");
    expect(translate("id", "settings.dataSafety.backupDatabase")).toBe("Cadangkan Database");
    expect(translate("id", "settings.dataSafety.restoreDatabase")).toBe("Pulihkan Database");
    expect(translate("id", "settings.dataSafety.importData")).toBe("Impor Data");
    expect(translate("id", "settings.dataSafety.exportData")).toBe("Ekspor Data");
    expect(translate("id", "settings.appInformation.title")).toBe("Informasi Aplikasi");
  });

  it("Indonesian changes Home static labels", () => {
    expect(translate("id", "home.welcome")).toBe("Selamat Datang di Sakurava");
    expect(translate("id", "home.getStarted")).toBe("Mulai");
    expect(translate("id", "home.quickActions")).toBe("Aksi Cepat");
    expect(translate("id", "home.continueCataloging")).toBe("Lanjutkan Katalog");
    expect(translate("id", "home.recentlyAdded")).toBe("Baru Ditambahkan");
    expect(translate("id", "home.summaryVideos")).toBe("Video");
    expect(translate("id", "home.summaryImages")).toBe("Gambar");
    expect(translate("id", "home.summaryPerformers")).toBe("Performer");
    expect(translate("id", "home.summaryFavorites")).toBe("Favorit");
    expect(translate("id", "home.addVideo")).toBe("Tambah Video");
    expect(translate("id", "home.addImage")).toBe("Tambah Gambar");
    expect(translate("id", "home.addPerformer")).toBe("Tambah Performer");
  });

  it("Indonesian changes collection chrome labels", () => {
    expect(translate("id", "collection.title.videos")).toBe("Video");
    expect(translate("id", "collection.title.images")).toBe("Gambar");
    expect(translate("id", "collection.title.performers")).toBe("Performer");
    expect(translate("id", "collection.subtitle.videos")).toBe("Kelola katalog video lokal Anda");
    expect(translate("id", "collection.filter")).toBe("Filter");
    expect(translate("id", "collection.view")).toBe("Tampilan");
    expect(translate("id", "collection.sorting")).toBe("Urutan");
    expect(translate("id", "collection.pageSize")).toBe("Ukuran halaman");
    expect(translate("id", "collection.perPage")).toBe("per halaman");
    expect(translate("id", "collection.previous")).toBe("Sebelumnya");
    expect(translate("id", "collection.next")).toBe("Berikutnya");
    expect(translate("id", "collection.noMatchingItems")).toBe("Tidak ada item yang cocok");
    expect(translate("id", "collection.noSavedRecords")).toBe("Tidak ada catatan tersimpan");
    expect(translate("id", "collection.searchPlaceholder.videos")).toBe("Cari video...");
    expect(translate("id", "collection.addVideo")).toBe("Tambah Video");
    expect(translate("id", "collection.addImage")).toBe("Tambah Gambar");
    expect(translate("id", "collection.addPerformer")).toBe("Tambah Performer");
    expect(translate("id", "collection.clearAllFilters")).toBe("Hapus semua filter");
    expect(translate("id", "collection.clearAll")).toBe("Hapus semua");
  });

  it("catalog data remains unchanged by language selection", () => {
    // User catalog data (titles, names, categories) should never be translated.
    // This test verifies that translation keys for catalog data do not exist.
    expect(translate("id", "Sample Video Title")).toBe("Sample Video Title");
    expect(translate("id", "Original Title Placeholder")).toBe("Original Title Placeholder");
    expect(translate("id", "Category A")).toBe("Category A");
  });

  it("English selection restores English labels", () => {
    expect(translate("en", "nav.home")).toBe("Home");
    expect(translate("en", "nav.videos")).toBe("Videos");
    expect(translate("en", "settings.title")).toBe("Settings");
    expect(translate("en", "settings.appearance.title")).toBe("Appearance");
    expect(translate("en", "home.welcome")).toBe("Welcome to Sakurava");
    expect(translate("en", "home.quickActions")).toBe("Quick Actions");
    expect(translate("en", "collection.title.videos")).toBe("Videos");
    expect(translate("en", "collection.filter")).toBe("Filter");
    expect(translate("en", "collection.previous")).toBe("Previous");
    expect(translate("en", "collection.next")).toBe("Next");
  });
});
