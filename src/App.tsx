import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import AppShell from "./layouts/AppShell";
import {
  applyAppearanceAccent,
  applyAppearanceDensity,
  applyAppearanceTheme,
  applyAppearanceUiScale,
  getStoredAppearanceAccent,
  getStoredAppearanceDensity,
  getStoredAppearanceTheme,
  getStoredAppearanceUiScale,
} from "./lib/appearanceTheme";
import { LanguageProvider } from "./lib/LanguageContext";
import { collectionConfigs } from "./lib/collectionData";
import { detailConfigs } from "./lib/detailData";
import { formConfigs } from "./lib/formData";
import CollectionPage from "./pages/CollectionPage";
import CategoryManagementPage from "./pages/CategoryManagementPage";
import GlobalImageViewerWindow from "./components/gallery/GlobalImageViewerWindow";
import DetailPage from "./pages/DetailPage";
import FormPage from "./pages/FormPage";
import GlossaryPage from "./pages/GlossaryPage";
import HomePage from "./pages/HomePage";
import ImageCollectionPage from "./pages/ImageCollectionPage";
import ImageDetailPage from "./pages/ImageDetailPage";
import ImageFormPage from "./pages/ImageFormPage";
import PerformerCollectionPage from "./pages/PerformerCollectionPage";
import PerformerDetailPage from "./pages/PerformerDetailPage";
import PerformerFormPage from "./pages/PerformerFormPage";
import SettingsPage from "./pages/SettingsPage";
import VideoCollectionPage from "./pages/VideoCollectionPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import VideoFormPage from "./pages/VideoFormPage";
import { MediaAssetScopeReadyContext } from "./runtime/MediaAssetScopeContext";
import {
  getStoredMediaAssetRoots,
  restoreStoredMediaAssetRoots,
} from "./runtime/mediaAssetScope";
import { isTauriRuntimeAvailable } from "./runtime/tauriClient";
import {
  AUTOMATIC_BACKUP_CHECK_INTERVAL_MS,
  AUTOMATIC_BACKUP_SETTINGS_EVENT,
  runAutomaticBackupIfDue,
} from "./lib/automaticBackup";

function App() {
  const isImageViewerWindow =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("sakuravaWindow") ===
      "image-viewer";
  const [appearanceTheme] = useState(() => getStoredAppearanceTheme());
  const [appearanceAccent] = useState(() => getStoredAppearanceAccent());
  const [appearanceDensity] = useState(() => getStoredAppearanceDensity());
  const [appearanceUiScale] = useState(() => getStoredAppearanceUiScale());
  const [mediaAssetScopeReady, setMediaAssetScopeReady] = useState(
    () => !isTauriRuntimeAvailable() || getStoredMediaAssetRoots().length === 0,
  );

  useEffect(() => {
    applyAppearanceTheme(appearanceTheme);
    applyAppearanceAccent(appearanceAccent);
    applyAppearanceDensity(appearanceDensity);
    applyAppearanceUiScale(appearanceUiScale);
  }, [appearanceAccent, appearanceDensity, appearanceTheme, appearanceUiScale]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable() || getStoredMediaAssetRoots().length === 0) {
      setMediaAssetScopeReady(true);
      return;
    }

    setMediaAssetScopeReady(false);
    void restoreStoredMediaAssetRoots().finally(() => {
      setMediaAssetScopeReady(true);
    });
  }, []);

  useEffect(() => {
    if (isImageViewerWindow || !isTauriRuntimeAvailable()) {
      return;
    }

    const checkDueBackup = () => {
      void runAutomaticBackupIfDue();
    };
    checkDueBackup();
    window.addEventListener(
      AUTOMATIC_BACKUP_SETTINGS_EVENT,
      checkDueBackup,
    );
    const intervalId = window.setInterval(
      checkDueBackup,
      AUTOMATIC_BACKUP_CHECK_INTERVAL_MS,
    );
    return () => {
      window.removeEventListener(
        AUTOMATIC_BACKUP_SETTINGS_EVENT,
        checkDueBackup,
      );
      window.clearInterval(intervalId);
    };
  }, [isImageViewerWindow]);

  if (isImageViewerWindow) {
    return (
      <LanguageProvider>
        <GlobalImageViewerWindow />
      </LanguageProvider>
    );
  }

  return (
    <MediaAssetScopeReadyContext.Provider value={mediaAssetScopeReady}>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route
                path="categories"
                element={<Navigate to="/settings/category-management" replace />}
              />

              <Route path="videos" element={<VideoCollectionPage />} />
              <Route path="videos/new" element={<VideoFormPage mode="create" />} />
              <Route path="videos/:itemKey" element={<VideoDetailPage />} />
              <Route
                path="videos/:itemKey/edit"
                element={<VideoFormPage mode="edit" />}
              />

              <Route path="images" element={<ImageCollectionPage />} />
              <Route path="images/new" element={<ImageFormPage mode="create" />} />
              <Route path="images/:itemKey" element={<ImageDetailPage />} />
              <Route
                path="images/:itemKey/edit"
                element={<ImageFormPage mode="edit" />}
              />

              <Route path="performers" element={<PerformerCollectionPage />} />
              <Route
                path="performers/new"
                element={<PerformerFormPage mode="create" />}
              />
              <Route path="performers/:itemKey" element={<PerformerDetailPage />} />
              <Route
                path="performers/:itemKey/edit"
                element={<PerformerFormPage mode="edit" />}
              />

              <Route path="settings" element={<SettingsPage />} />
              <Route
                path="settings/category-management"
                element={<CategoryManagementPage />}
              />
              <Route path="glossary" element={<GlossaryPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </MediaAssetScopeReadyContext.Provider>
  );
}

export default App;
