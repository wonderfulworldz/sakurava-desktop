import { useEffect, useState } from "react";
import { collectionConfigs } from "../lib/collectionData";
import type { CollectionConfig } from "../lib/collectionData";
import { buildVideoCollectionConfig } from "../lib/videoIntegration";
import CollectionPage from "./CollectionPage";
import { isVideoRuntimeAvailable, listVideos, updateVideo } from "../runtime/videoCommands";

function VideoCollectionPage() {
  const [config, setConfig] = useState<CollectionConfig>(() =>
    isVideoRuntimeAvailable()
      ? { ...collectionConfigs.videos, items: [], countLabel: "0 videos" }
      : collectionConfigs.videos,
  );

  useEffect(() => {
    let cancelled = false;

    if (!isVideoRuntimeAvailable()) {
      setConfig(collectionConfigs.videos);
      return;
    }

    listVideos()
      .then((videos) => {
        if (!cancelled) {
          setConfig(buildVideoCollectionConfig(videos));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfig({ ...collectionConfigs.videos, items: [], countLabel: "0 videos" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleFavoriteToggle(key: string, currentFavorite: boolean) {
    setConfig((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.key === key ? { ...item, favorite: !currentFavorite } : item,
      ),
    }));

    if (isVideoRuntimeAvailable()) {
      updateVideo(key, { favorite: !currentFavorite }).catch(() => {
        setConfig((prev) => ({
          ...prev,
          items: prev.items.map((item) =>
            item.key === key ? { ...item, favorite: currentFavorite } : item,
          ),
        }));
      });
    }
  }

  return <CollectionPage config={config} onFavoriteToggle={handleFavoriteToggle} />;
}

export default VideoCollectionPage;

