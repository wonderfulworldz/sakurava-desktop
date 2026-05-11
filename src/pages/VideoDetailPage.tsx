import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import { buildVideoDetailConfig } from "../lib/videoIntegration";
import DetailPage from "./DetailPage";
import { getVideo, isVideoRuntimeAvailable } from "../runtime/videoCommands";

function VideoDetailPage() {
  const { itemKey } = useParams();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.videos);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!itemKey || !isVideoRuntimeAvailable()) {
      setConfig(detailConfigs.videos);
      setMissing(false);
      return;
    }

    getVideo(itemKey)
      .then((video) => {
        if (cancelled) {
          return;
        }

        if (!video) {
          setMissing(true);
          return;
        }

        setMissing(false);
        setConfig(buildVideoDetailConfig(video));
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
          Video Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This video could not be found.
        </p>
      </section>
    );
  }

  return <DetailPage config={config} />;
}

export default VideoDetailPage;

