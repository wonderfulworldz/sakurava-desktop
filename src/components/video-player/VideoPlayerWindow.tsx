import { useEffect, useState } from "react";
import { isTauriRuntimeAvailable } from "../../runtime/tauriClient";
import {
  listenForVideoPlayerPayload,
  readStoredVideoPlayerPayload,
  type VideoPlayerWindowPayload,
} from "../../runtime/videoPlayerWindows";
import VideoPlayerPrototype from "./VideoPlayerPrototype";

const fallbackPayload: VideoPlayerWindowPayload = {
  displayName: "Video",
  resolution: "N/A",
  durationLabel: "N/A",
  requestId: "video-player-fallback",
};

export default function VideoPlayerWindow() {
  const [payload, setPayload] = useState(
    () => readStoredVideoPlayerPayload() ?? fallbackPayload,
  );

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return;
    let unlisten: (() => void) | undefined;
    void listenForVideoPlayerPayload(setPayload).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });
    return () => unlisten?.();
  }, []);

  return (
    <VideoPlayerPrototype
      displayName={payload.displayName}
      resolution={payload.resolution}
      durationLabel={payload.durationLabel}
    />
  );
}
