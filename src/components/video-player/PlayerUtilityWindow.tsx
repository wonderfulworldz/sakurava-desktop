import { useEffect, useState } from "react";
import { useTranslation } from "../../lib/LanguageContext";
import {
  loadVideoPlayerPreferences,
  saveVideoPlayerPreferences,
  type VideoPlayerPreferences,
} from "../../lib/videoPlayerPreferences";
import { useVideoPlayerBridge } from "../../runtime/videoPlayerBridge";
import SubtitleSettingsDialog from "./SubtitleSettingsDialog";
import { ShortcutDialog } from "./VideoPlayerPrototype";

export type PlayerUtilityKind = "subtitle-appearance" | "shortcuts";

export default function PlayerUtilityWindow({ kind }: { kind: PlayerUtilityKind }) {
  const t = useTranslation();
  const bridge = useVideoPlayerBridge();
  const [preferences, setPreferences] = useState<VideoPlayerPreferences>(() => loadVideoPlayerPreferences());
  const [subtitleDelay, setSubtitleDelay] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (bridge.snapshot) setSubtitleDelay(bridge.snapshot.subtitleDelaySeconds);
  }, [bridge.snapshot?.sessionId]);

  useEffect(() => {
    if (bridge.commandResult?.status !== "error") return;
    setFeedback(bridge.commandResult.message ?? t("videoPlayer.subtitleFeedback.failed"));
    bridge.clearCommandResult();
  }, [bridge.commandResult, bridge.clearCommandResult, t]);

  function persist(next: VideoPlayerPreferences) {
    if (!saveVideoPlayerPreferences(next)) {
      setFeedback(t("videoPlayer.preferences.saveFailed"));
      return false;
    }
    setPreferences(next);
    return true;
  }

  if (kind === "subtitle-appearance") {
    return <SubtitleSettingsDialog
      value={preferences.subtitles}
      delay={subtitleDelay}
      feedback={feedback}
      onChange={(subtitles) => {
        const next = { ...preferences, subtitles };
        if (persist(next)) bridge.setSubtitleAppearance(subtitles);
      }}
      onDelayChange={(seconds) => {
        setSubtitleDelay(seconds);
        bridge.setSubtitleDelay(seconds);
      }}
      onClose={() => bridge.close()}
    />;
  }

  return <ShortcutDialog
    shortcuts={preferences.shortcuts}
    feedback={feedback}
    onCancel={() => bridge.close()}
    onSave={(shortcuts) => {
      if (persist({ ...preferences, shortcuts })) bridge.close();
    }}
  />;
}
