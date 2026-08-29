import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import VideoPlayerProductionRoot from "./components/video-player/VideoPlayerProductionRoot";
import "./index.css";
import { initializeStoredAppearance } from "./lib/appearanceTheme";
import { LanguageProvider } from "./lib/LanguageContext";

initializeStoredAppearance();
document.documentElement.dataset.windowHost = "composition";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <VideoPlayerProductionRoot />
    </LanguageProvider>
  </StrictMode>,
);
