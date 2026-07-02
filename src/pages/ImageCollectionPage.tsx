import { useEffect, useState } from "react";
import { collectionConfigs } from "../lib/collectionData";
import type { CollectionConfig } from "../lib/collectionData";
import { buildImageCollectionConfig } from "../lib/imageIntegration";
import CollectionPage from "./CollectionPage";
import { isImageRuntimeAvailable, listImages, updateImage } from "../runtime/imageCommands";

function ImageCollectionPage() {
  const [config, setConfig] = useState<CollectionConfig>(() =>
    isImageRuntimeAvailable()
      ? { ...collectionConfigs.images, items: [], countLabel: "0 images" }
      : collectionConfigs.images,
  );

  useEffect(() => {
    let cancelled = false;

    if (!isImageRuntimeAvailable()) {
      setConfig(collectionConfigs.images);
      return;
    }

    listImages()
      .then((images) => {
        if (!cancelled) {
          setConfig(buildImageCollectionConfig(images));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfig({ ...collectionConfigs.images, items: [], countLabel: "0 images" });
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

    if (isImageRuntimeAvailable()) {
      updateImage(key, { favorite: !currentFavorite }).catch(() => {
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

export default ImageCollectionPage;
