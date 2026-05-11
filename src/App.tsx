import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import { collectionConfigs } from "./lib/collectionData";
import { detailConfigs } from "./lib/detailData";
import { formConfigs } from "./lib/formData";
import CollectionPage from "./pages/CollectionPage";
import DetailPage from "./pages/DetailPage";
import FormPage from "./pages/FormPage";
import HomePage from "./pages/HomePage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />

          <Route
            path="videos"
            element={<CollectionPage config={collectionConfigs.videos} />}
          />
          <Route
            path="videos/new"
            element={<FormPage config={formConfigs.videos} mode="create" />}
          />
          <Route
            path="videos/:itemKey"
            element={<DetailPage config={detailConfigs.videos} />}
          />
          <Route
            path="videos/:itemKey/edit"
            element={<FormPage config={formConfigs.videos} mode="edit" />}
          />

          <Route
            path="images"
            element={<CollectionPage config={collectionConfigs.images} />}
          />
          <Route
            path="images/new"
            element={<FormPage config={formConfigs.images} mode="create" />}
          />
          <Route
            path="images/:itemKey"
            element={<DetailPage config={detailConfigs.images} />}
          />
          <Route
            path="images/:itemKey/edit"
            element={<FormPage config={formConfigs.images} mode="edit" />}
          />

          <Route
            path="performers"
            element={<CollectionPage config={collectionConfigs.performers} />}
          />
          <Route
            path="performers/new"
            element={
              <FormPage config={formConfigs.performers} mode="create" />
            }
          />
          <Route
            path="performers/:itemKey"
            element={<DetailPage config={detailConfigs.performers} />}
          />
          <Route
            path="performers/:itemKey/edit"
            element={
              <FormPage config={formConfigs.performers} mode="edit" />
            }
          />

          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
