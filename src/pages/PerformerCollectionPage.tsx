import { useEffect, useState } from "react";
import { collectionConfigs } from "../lib/collectionData";
import type { CollectionConfig } from "../lib/collectionData";
import { buildPerformerCollectionConfig } from "../lib/performerIntegration";
import CollectionPage from "./CollectionPage";
import {
  isPerformerRuntimeAvailable,
  listPerformers,
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

  return <CollectionPage config={config} />;
}

export default PerformerCollectionPage;
