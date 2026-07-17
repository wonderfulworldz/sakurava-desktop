import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import ConfirmDialog from "./components/ConfirmDialog";
import AppShell from "./layouts/AppShell";
import {
  applyAppearanceAccent,
  applyAppearanceDensity,
  applyAppearanceTheme,
  applyAppearanceUiScale,
  getStoredAppearanceAccent,
  getStoredAppearanceDensity,
  getStoredAppearanceTheme,
  getStoredAppearanceUiScale,
} from "./lib/appearanceTheme";
import { LanguageProvider } from "./lib/LanguageContext";
import { collectionConfigs } from "./lib/collectionData";
import { detailConfigs } from "./lib/detailData";
import { formConfigs } from "./lib/formData";
import CollectionPage from "./pages/CollectionPage";
import CategoryManagementPage from "./pages/CategoryManagementPage";
import GlobalImageViewerWindow from "./components/gallery/GlobalImageViewerWindow";
import DetailPage from "./pages/DetailPage";
import FormPage from "./pages/FormPage";
import GlossaryPage from "./pages/GlossaryPage";
import HomePage from "./pages/HomePage";
import ImageCollectionPage from "./pages/ImageCollectionPage";
import ImageDetailPage from "./pages/ImageDetailPage";
import ImageFormPage from "./pages/ImageFormPage";
import PerformerCollectionPage from "./pages/PerformerCollectionPage";
import PerformerDetailPage from "./pages/PerformerDetailPage";
import PerformerFormPage from "./pages/PerformerFormPage";
import SettingsPage from "./pages/SettingsPage";
import VideoCollectionPage from "./pages/VideoCollectionPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import VideoFormPage from "./pages/VideoFormPage";
import { MediaAssetScopeReadyContext } from "./runtime/MediaAssetScopeContext";
import {
  getStoredMediaAssetRoots,
  restoreStoredMediaAssetRoots,
} from "./runtime/mediaAssetScope";
import { isTauriRuntimeAvailable } from "./runtime/tauriClient";
import {
  applySakuravaRefMigration,
  getSakuravaRefMigrationStatus,
  type SakuravaRefMigrationStatus,
} from "./runtime/sakuravaRefCommands";
import { useTranslation } from "./lib/LanguageContext";
import {
  AUTOMATIC_BACKUP_CHECK_INTERVAL_MS,
  AUTOMATIC_BACKUP_SETTINGS_EVENT,
  runAutomaticBackupIfDue,
} from "./lib/automaticBackup";

function App() {
  const isImageViewerWindow =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("sakuravaWindow") ===
      "image-viewer";
  const [appearanceTheme] = useState(() => getStoredAppearanceTheme());
  const [appearanceAccent] = useState(() => getStoredAppearanceAccent());
  const [appearanceDensity] = useState(() => getStoredAppearanceDensity());
  const [appearanceUiScale] = useState(() => getStoredAppearanceUiScale());
  const [mediaAssetScopeReady, setMediaAssetScopeReady] = useState(
    () => !isTauriRuntimeAvailable() || getStoredMediaAssetRoots().length === 0,
  );
  const [refMigrationStatus, setRefMigrationStatus] = useState<SakuravaRefMigrationStatus | null>(null);
  const [refMigrationPending, setRefMigrationPending] = useState(false);
  const [refMigrationFailed, setRefMigrationFailed] = useState(false);
  const [refMigrationSucceeded, setRefMigrationSucceeded] = useState(false);
  const [refMigrationValidationFailed, setRefMigrationValidationFailed] = useState(false);
  const [refRecoveryViewAllowed, setRefRecoveryViewAllowed] = useState(false);
  const [refUpgradePromptDismissed, setRefUpgradePromptDismissed] = useState(false);

  useEffect(() => {
    applyAppearanceTheme(appearanceTheme);
    applyAppearanceAccent(appearanceAccent);
    applyAppearanceDensity(appearanceDensity);
    applyAppearanceUiScale(appearanceUiScale);
  }, [appearanceAccent, appearanceDensity, appearanceTheme, appearanceUiScale]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable() || getStoredMediaAssetRoots().length === 0) {
      setMediaAssetScopeReady(true);
      return;
    }

    setMediaAssetScopeReady(false);
    void restoreStoredMediaAssetRoots().finally(() => {
      setMediaAssetScopeReady(true);
    });
  }, []);

  useEffect(() => {
    if (isImageViewerWindow || !isTauriRuntimeAvailable()) {
      return;
    }

    const checkDueBackup = () => {
      void runAutomaticBackupIfDue();
    };
    checkDueBackup();
    window.addEventListener(
      AUTOMATIC_BACKUP_SETTINGS_EVENT,
      checkDueBackup,
    );
    const intervalId = window.setInterval(
      checkDueBackup,
      AUTOMATIC_BACKUP_CHECK_INTERVAL_MS,
    );
    return () => {
      window.removeEventListener(
        AUTOMATIC_BACKUP_SETTINGS_EVENT,
        checkDueBackup,
      );
      window.clearInterval(intervalId);
    };
  }, [isImageViewerWindow]);

  const refreshRefMigrationStatus = () => {
    if (isImageViewerWindow || !isTauriRuntimeAvailable()) return Promise.resolve();
    setRefMigrationValidationFailed(false);
    return getSakuravaRefMigrationStatus()
      .then((status) => {
        if (status && typeof status.required === "boolean") {
          setRefMigrationStatus({
            ...status,
            state: status.state ?? (status.required ? "legacy" : "migrated"),
          });
        }
      })
      .catch(() => {
        setRefMigrationStatus(null);
        setRefMigrationValidationFailed(true);
      });
  };

  useEffect(() => {
    void refreshRefMigrationStatus();
  }, [isImageViewerWindow]);

  useEffect(() => {
    const showUpgradePrompt = () => setRefUpgradePromptDismissed(false);
    window.addEventListener("sakurava-ref-upgrade-requested", showUpgradePrompt);
    return () => window.removeEventListener("sakurava-ref-upgrade-requested", showUpgradePrompt);
  }, []);

  const applyRefMigration = async () => {
    if (refMigrationPending) return;
    setRefMigrationPending(true);
    setRefMigrationFailed(false);
    try {
      await applySakuravaRefMigration();
      await refreshRefMigrationStatus();
      window.dispatchEvent(new Event("sakurava-ref-state-changed"));
      setRefMigrationSucceeded(true);
    } catch {
      setRefMigrationFailed(true);
    } finally {
      setRefMigrationPending(false);
    }
  };

  if (isImageViewerWindow) {
    return (
      <LanguageProvider>
        <GlobalImageViewerWindow />
      </LanguageProvider>
    );
  }

  return (
    <MediaAssetScopeReadyContext.Provider value={mediaAssetScopeReady}>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route
                path="categories"
                element={<Navigate to="/settings/category-management" replace />}
              />

              <Route path="videos" element={<VideoCollectionPage />} />
              <Route path="videos/new" element={<VideoFormPage mode="create" />} />
              <Route path="videos/:itemKey" element={<VideoDetailPage />} />
              <Route
                path="videos/:itemKey/edit"
                element={<VideoFormPage mode="edit" />}
              />

              <Route path="images" element={<ImageCollectionPage />} />
              <Route path="images/new" element={<ImageFormPage mode="create" />} />
              <Route path="images/:itemKey" element={<ImageDetailPage />} />
              <Route
                path="images/:itemKey/edit"
                element={<ImageFormPage mode="edit" />}
              />

              <Route path="performers" element={<PerformerCollectionPage />} />
              <Route
                path="performers/new"
                element={<PerformerFormPage mode="create" />}
              />
              <Route path="performers/:itemKey" element={<PerformerDetailPage />} />
              <Route
                path="performers/:itemKey/edit"
                element={<PerformerFormPage mode="edit" />}
              />

              <Route path="settings" element={<SettingsPage />} />
              <Route
                path="settings/category-management"
                element={<CategoryManagementPage />}
              />
              <Route path="glossary" element={<GlossaryPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <SakuravaRefMigrationDialog
            status={refMigrationStatus}
            validationFailed={refMigrationValidationFailed}
            recoveryViewAllowed={refRecoveryViewAllowed}
            upgradePromptDismissed={refUpgradePromptDismissed}
            pending={refMigrationPending}
            failed={refMigrationFailed}
            onRetry={() => void refreshRefMigrationStatus()}
            onOpenRecovery={() => setRefRecoveryViewAllowed(true)}
            onDismissUpgrade={() => setRefUpgradePromptDismissed(true)}
            onConfirm={() => void applyRefMigration()}
          />
          <SakuravaRefMigrationToast
            visible={refMigrationSucceeded}
            onDismiss={() => setRefMigrationSucceeded(false)}
          />
        </BrowserRouter>
      </LanguageProvider>
    </MediaAssetScopeReadyContext.Provider>
  );
}

function SakuravaRefMigrationDialog({
  status,
  validationFailed,
  recoveryViewAllowed,
  upgradePromptDismissed,
  pending,
  failed,
  onRetry,
  onOpenRecovery,
  onDismissUpgrade,
  onConfirm,
}: {
  status: SakuravaRefMigrationStatus | null;
  validationFailed: boolean;
  recoveryViewAllowed: boolean;
  upgradePromptDismissed: boolean;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
  onOpenRecovery: () => void;
  onDismissUpgrade: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslation();
  const navigate = useNavigate();
  const state = validationFailed
    ? "invalid"
    : status
      ? status.state ?? (status.required ? "legacy" : "migrated")
      : "checking";
  if (state === "checking") {
    return null;
  }
  if (state === "migrated" || (state === "invalid" && recoveryViewAllowed)) return null;
  if (state === "invalid") {
    return (
      <ConfirmDialog
        open
        title={t("migration.ref.recoveryTitle")}
        description={t("migration.ref.recoveryBody")}
        cancelLabel={t("migration.ref.openRecovery")}
        confirmLabel={t("migration.ref.retryValidation")}
        pending={pending}
        onCancel={() => {
          onOpenRecovery();
          navigate("/settings");
        }}
        onConfirm={onRetry}
      />
    );
  }
  if (!status) return null;
  if (upgradePromptDismissed) return null;
  const total = Object.values(status.counts).reduce((sum, count) => sum + count, 0);
  return (
    <ConfirmDialog
      open
      title={t("migration.ref.title")}
      description={(
        <div className="space-y-2">
          <p>{t("migration.ref.body", { count: String(total) })}</p>
          <p>{t("migration.ref.safety")}</p>
          {status.issues.length > 0 ? <p role="alert" className="text-rose-700">{t("migration.ref.precondition")}</p> : null}
          {failed ? <p role="alert" className="text-rose-700">{t("migration.ref.failed")}</p> : null}
        </div>
      )}
      confirmLabel={t("migration.ref.confirm")}
      pendingLabel={t("migration.ref.pending")}
      pending={pending}
      onCancel={onDismissUpgrade}
      onConfirm={onConfirm}
    />
  );
}

function SakuravaRefMigrationToast({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const t = useTranslation();

  useEffect(() => {
    if (!visible) return;
    const timeoutId = window.setTimeout(onDismiss, 4_000);
    return () => window.clearTimeout(timeoutId);
  }, [onDismiss, visible]);

  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-[80] rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg"
    >
      {t("migration.ref.success")}
    </div>
  );
}

export default App;
