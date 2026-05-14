import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import AppShell from "./layouts/AppShell";
import { collectionConfigs } from "./lib/collectionData";
import { detailConfigs } from "./lib/detailData";
import { formConfigs } from "./lib/formData";
import CollectionPage from "./pages/CollectionPage";
import DetailPage from "./pages/DetailPage";
import FormPage from "./pages/FormPage";
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

function App() {
  const [mediaAssetScopeReady, setMediaAssetScopeReady] = useState(
    () => !isTauriRuntimeAvailable() || getStoredMediaAssetRoots().length === 0,
  );

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

  return (
    <MediaAssetScopeReadyContext.Provider value={mediaAssetScopeReady}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />

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
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </MediaAssetScopeReadyContext.Provider>
  );
}

export default App;
