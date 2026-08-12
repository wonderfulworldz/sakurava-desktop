import { useEffect, useState } from "react";
import { collectionConfigs } from "../lib/collectionData";
import type { CollectionConfig } from "../lib/collectionData";
import { buildPerformerCollectionConfig } from "../lib/performerIntegration";
import CollectionPage from "./CollectionPage";
import {
  isPerformerRuntimeAvailable,
  listPerformers,
  updatePerformer,
} from "../runtime/performerCommands";
import {
  descriptorAssetPath,
  primaryVisualDescriptorRequest,
  resolveManagedMediaDescriptors,
} from "../runtime/managedMediaDescriptors";

function PerformerCollectionPage() {
  const [config, setConfig] = useState<CollectionConfig>(() =>
    isPerformerRuntimeAvailable()
      ? { ...collectionConfigs.performers, items: [], countLabel: "0 performers" }
      : collectionConfigs.performers,
  );

  useEffect(() => {
    let cancelled = false;

    if (!isPerformerRuntimeAvailable()) {
      setConfig(collectionConfigs.performers);
      return;
    }

    listPerformers()
      .then(async (performers) => {
        if (!cancelled) {
          const descriptors = await resolveManagedMediaDescriptors(
            performers.flatMap((performer) => [
              primaryVisualDescriptorRequest({
                requestId: `performer-collection-${performer.id}`,
                ownerKind: "performer",
                ownerId: performer.id,
                sourcePath: performer.coverPath,
                roleId: "performer_collection_full_card",
                cssWidth: 320,
                cssHeight: 320,
              }),
              primaryVisualDescriptorRequest({
                requestId: `performer-table-${performer.id}`,
                ownerKind: "performer",
                ownerId: performer.id,
                sourcePath: performer.coverPath,
                roleId: "performer_table",
                cssWidth: 44,
                cssHeight: 56,
              }),
            ]),
          );
          if (!cancelled) {
            setConfig(
              buildPerformerCollectionConfig(
                performers.map((performer) => ({
                  ...performer,
                  coverPath:
                    descriptorAssetPath(
                      descriptors.get(`performer-collection-${performer.id}`),
                    ) ?? "",
                  tableCoverPath:
                    descriptorAssetPath(
                      descriptors.get(`performer-table-${performer.id}`),
                    ) ?? "",
                })),
              ),
            );
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfig({
            ...collectionConfigs.performers,
            items: [],
            countLabel: "0 performers",
          });
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

    if (isPerformerRuntimeAvailable()) {
      updatePerformer(key, { favorite: !currentFavorite }).catch(() => {
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

export default PerformerCollectionPage;
