import { useEffect, useState } from "react";
import { collectionConfigs } from "../lib/collectionData";
import type { CollectionConfig } from "../lib/collectionData";
import { buildImageCollectionConfig } from "../lib/imageIntegration";
import CollectionPage from "./CollectionPage";
import { isImageRuntimeAvailable, listImages, updateImage } from "../runtime/imageCommands";
import {
  descriptorAssetPath,
  primaryVisualDescriptorRequest,
  resolveManagedMediaDescriptors,
} from "../runtime/managedMediaDescriptors";

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
      .then(async (images) => {
        if (!cancelled) {
          const descriptors = await resolveManagedMediaDescriptors(
            images.map((image) =>
              primaryVisualDescriptorRequest({
                requestId: `image-collection-${image.id}`,
                ownerKind: "image",
                ownerId: image.id,
                sourcePath: image.coverPath,
                roleId: "image_collection_full_card",
                cssWidth: 320,
                cssHeight: 180,
              }),
            ),
          );
          if (!cancelled) {
            setConfig(
              buildImageCollectionConfig(
                images.map((image) => ({
                  ...image,
                  coverPath:
                    descriptorAssetPath(descriptors.get(`image-collection-${image.id}`)) ?? "",
                })),
              ),
            );
          }
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
