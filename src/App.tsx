import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import { collectionConfigs } from "./lib/collectionData";
import CollectionPage from "./pages/CollectionPage";
import HomePage from "./pages/HomePage";
import RouteStubPage from "./pages/RouteStubPage";

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
            element={
              <RouteStubPage
                title="Add Video"
                subtitle="Create a new video catalog item"
                label="VideoCreatePage"
              />
            }
          />
          <Route
            path="videos/:itemKey"
            element={
              <RouteStubPage
                title="Video Detail"
                subtitle="View saved video catalog information"
                label="VideoDetailPage"
              />
            }
          />
          <Route
            path="videos/:itemKey/edit"
            element={
              <RouteStubPage
                title="Edit Video"
                subtitle="Update a video catalog item"
                label="VideoEditPage"
              />
            }
          />

          <Route
            path="images"
            element={<CollectionPage config={collectionConfigs.images} />}
          />
          <Route
            path="images/new"
            element={
              <RouteStubPage
                title="Add Image"
                subtitle="Create a new image catalog item"
                label="ImageCreatePage"
              />
            }
          />
          <Route
            path="images/:itemKey"
            element={
              <RouteStubPage
                title="Image Detail"
                subtitle="View a local image catalog item"
                label="ImageDetailPage"
              />
            }
          />
          <Route
            path="images/:itemKey/edit"
            element={
              <RouteStubPage
                title="Edit Image"
                subtitle="Update an image catalog item"
                label="ImageEditPage"
              />
            }
          />

          <Route
            path="performers"
            element={<CollectionPage config={collectionConfigs.performers} />}
          />
          <Route
            path="performers/new"
            element={
              <RouteStubPage
                title="Add Performer"
                subtitle="Create a new performer profile"
                label="PerformerCreatePage"
              />
            }
          />
          <Route
            path="performers/:itemKey"
            element={
              <RouteStubPage
                title="Performer Detail"
                subtitle="View profile, catalog summary, and personal notes"
                label="PerformerDetailPage"
              />
            }
          />
          <Route
            path="performers/:itemKey/edit"
            element={
              <RouteStubPage
                title="Edit Performer"
                subtitle="Update a performer profile"
                label="PerformerEditPage"
              />
            }
          />

          <Route
            path="settings"
            element={
              <RouteStubPage
                title="Settings"
                subtitle="Minimal local app settings"
                label="SettingsPage"
              />
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
