import { useEffect, useState } from "react";
import { collectionConfigs } from "../lib/collectionData";
import type { CollectionConfig } from "../lib/collectionData";
import { buildVideoCollectionConfig } from "../lib/videoIntegration";
import CollectionPage from "./CollectionPage";
import { isVideoRuntimeAvailable, listVideos, updateVideo } from "../runtime/videoCommands";
import {
  descriptorAssetPath,
  primaryVisualDescriptorRequest,
  resolveManagedMediaDescriptors,
} from "../runtime/managedMediaDescriptors";

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
      .then(async (videos) => {
        if (!cancelled) {
          const descriptors = await resolveManagedMediaDescriptors(
            videos.flatMap((video) => [
              primaryVisualDescriptorRequest({
                requestId: `video-collection-${video.id}`,
                ownerKind: "video",
                ownerId: video.id,
                sourcePath: video.coverPath,
                roleId: "video_collection_full_card",
                cssWidth: 320,
                cssHeight: 180,
              }),
              primaryVisualDescriptorRequest({
                requestId: `video-table-${video.id}`,
                ownerKind: "video",
                ownerId: video.id,
                sourcePath: video.coverPath,
                roleId: "video_table",
                cssWidth: 80,
                cssHeight: 48,
              }),
            ]),
          );
          if (!cancelled) {
            setConfig(
              buildVideoCollectionConfig(
                videos.map((video) => ({
                  ...video,
                  coverPath:
                    descriptorAssetPath(descriptors.get(`video-collection-${video.id}`)) ?? "",
                  tableCoverPath:
                    descriptorAssetPath(descriptors.get(`video-table-${video.id}`)) ?? "",
                })),
              ),
            );
          }
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

