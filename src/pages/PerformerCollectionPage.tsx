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
      .then((performers) => {
        if (!cancelled) {
          setConfig(buildPerformerCollectionConfig(performers));
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
