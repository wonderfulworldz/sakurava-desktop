import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import { buildPerformerDetailConfig } from "../lib/performerIntegration";
import DetailPage from "./DetailPage";
import {
  getPerformer,
  isPerformerRuntimeAvailable,
} from "../runtime/performerCommands";

function PerformerDetailPage() {
  const { itemKey } = useParams();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.performers);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!itemKey || !isPerformerRuntimeAvailable()) {
      setConfig(detailConfigs.performers);
      setMissing(false);
      return;
    }

    getPerformer(itemKey)
      .then((performer) => {
        if (cancelled) {
          return;
        }

        if (!performer) {
          setMissing(true);
          return;
        }

        setMissing(false);
        setConfig(buildPerformerDetailConfig(performer));
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [itemKey]);

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Performer Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This performer could not be found.
        </p>
      </section>
    );
  }

  return <DetailPage config={config} />;
}

export default PerformerDetailPage;
