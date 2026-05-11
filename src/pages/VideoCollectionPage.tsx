import { useEffect, useState } from "react";
import { collectionConfigs } from "../lib/collectionData";
import type { CollectionConfig } from "../lib/collectionData";
import { buildVideoCollectionConfig } from "../lib/videoIntegration";
import CollectionPage from "./CollectionPage";
import { isVideoRuntimeAvailable, listVideos } from "../runtime/videoCommands";

function VideoCollectionPage() {
  const [config, setConfig] = useState<CollectionConfig>(collectionConfigs.videos);

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

  return <CollectionPage config={config} />;
}

export default VideoCollectionPage;

