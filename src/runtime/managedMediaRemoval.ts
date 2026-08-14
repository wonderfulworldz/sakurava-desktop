import { invokeTauriCommand } from "./tauriClient";

export type ManagedMediaRemovalPreview = {
  previewToken: string;
  automaticPolicyState: "unsynchronized" | "off" | "on";
  sourceSlotCountConsidered: number;
  removableSourceSlotCount: number;
  removablePhysicalVariantCount: number;
  recordedRemovableBytes: number;
  protectedOriginalUnavailableSourceCount: number;
  protectedOriginalUnavailableVariantCount: number;
  alreadyMissingManagedFileCount: number;
  conflictingNonterminalLifecycleWorkCount: number;
  unresolvedRecoveryPublicationConflictCount: number;
  validationFailedSourceCount: number;
  skippedSourceSlotCount: number;
  lifecycleConflictSourceCount: number;
  recoveryConflictSourceCount: number;
};

export type ManagedMediaRemovalResult = {
  removedSourceSlotCount: number;
  removedVariantCount: number;
  protectedOriginalUnavailableSourceCount: number;
  protectedOriginalUnavailableVariantCount: number;
  alreadyMissingReconciledCount: number;
  failedSourceSlotCount: number;
  failedVariantCount: number;
  skippedSourceSlotCount: number;
  lockedOrUnmovableVariantCount: number;
  staleSourceSlotCount: number;
  lifecycleConflictSourceCount: number;
  recoveryConflictSourceCount: number;
  validationFailedSourceCount: number;
  reclaimedBytes: number;
  stale: boolean;
};

export function previewManagedMediaRemoval() {
  return invokeTauriCommand<ManagedMediaRemovalPreview>(
    "managed_media_removal_preview",
  );
}

export function executeManagedMediaRemoval(previewToken: string) {
  return invokeTauriCommand<ManagedMediaRemovalResult>(
    "managed_media_removal_execute",
    { request: { previewToken } },
  );
}
