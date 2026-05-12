import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import { buildImageDetailConfig } from "../lib/imageIntegration";
import DetailPage from "./DetailPage";
import { getImage, isImageRuntimeAvailable } from "../runtime/imageCommands";

function ImageDetailPage() {
  const { itemKey } = useParams();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.images);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!itemKey || !isImageRuntimeAvailable()) {
      setConfig(detailConfigs.images);
      setMissing(false);
      return;
    }

    getImage(itemKey)
      .then((image) => {
        if (cancelled) {
          return;
        }

        if (!image) {
          setMissing(true);
          return;
        }

        setMissing(false);
        setConfig(buildImageDetailConfig(image));
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
          Image Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This image could not be found.
        </p>
      </section>
    );
  }

  return <DetailPage config={config} />;
}

export default ImageDetailPage;
