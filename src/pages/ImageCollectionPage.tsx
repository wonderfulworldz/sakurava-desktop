import { useEffect, useState } from "react";
import { collectionConfigs } from "../lib/collectionData";
import type { CollectionConfig } from "../lib/collectionData";
import { buildImageCollectionConfig } from "../lib/imageIntegration";
import CollectionPage from "./CollectionPage";
import { isImageRuntimeAvailable, listImages } from "../runtime/imageCommands";

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

  return <CollectionPage config={config} />;
}

export default ImageCollectionPage;
