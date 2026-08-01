import {
  descriptorPlaceholder,
  parseManagedMediaDescriptor,
  type ManagedMediaDescriptor,
  type ManagedMediaDescriptorRequest,
  type ManagedMediaOwnerKind,
  type ManagedMediaRenderingIntent,
  type ManagedMediaRoleId,
  type ManagedMediaSlotKind,
} from "../shared/managedMediaDescriptor";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export type DescriptorRequestOptions = {
  requestId: string;
  ownerKind: ManagedMediaOwnerKind;
  ownerId: string;
  slotKind: ManagedMediaSlotKind;
  roleId: ManagedMediaRoleId;
  sourcePath?: string;
  intent?: ManagedMediaRenderingIntent;
  cssWidth: number;
  cssHeight: number;
};

export function primaryVisualDescriptorRequest(
  options: Omit<DescriptorRequestOptions, "slotKind">,
): ManagedMediaDescriptorRequest {
  return descriptorRequest({ ...options, slotKind: "primary_visual" });
}

export function repeatedVisualDescriptorRequest(
  options: Omit<DescriptorRequestOptions, "slotKind">,
  slotKind: "gallery_tile" | "mini_row",
): ManagedMediaDescriptorRequest {
  return descriptorRequest({ ...options, slotKind });
}

export async function resolveManagedMediaDescriptors(
  requests: ManagedMediaDescriptorRequest[],
): Promise<Map<string, ManagedMediaDescriptor>> {
  const responseByRequestId = new Map<string, ManagedMediaDescriptor>();
  if (requests.length === 0) {
    return responseByRequestId;
  }
  if (!isTauriRuntimeAvailable()) {
    for (const request of requests) {
      responseByRequestId.set(request.requestId, localFallback(request));
    }
    return responseByRequestId;
  }

  const uniqueRequests = dedupeEquivalentRequests(requests);
  try {
    const raw = await invokeTauriCommand<unknown[]>(
      "managed_media_descriptor_resolve_batch",
      { requests: uniqueRequests },
    );
    const parsedByRequestId = new Map(
      uniqueRequests.map((request, index) => [
        request.requestId,
        parseManagedMediaDescriptor(raw[index], request.requestId),
      ]),
    );
    for (const request of requests) {
      const key = equivalentRequestKey(request);
      const original = uniqueRequests.find(
        (candidate) => equivalentRequestKey(candidate) === key,
      );
      const descriptor = original
        ? parsedByRequestId.get(original.requestId)
        : undefined;
      responseByRequestId.set(
        request.requestId,
        descriptor ? { ...descriptor, requestId: request.requestId } : descriptorPlaceholder(request.requestId),
      );
    }
  } catch {
    for (const request of requests) {
      responseByRequestId.set(request.requestId, localFallback(request));
    }
  }
  return responseByRequestId;
}

export function descriptorAssetPath(
  descriptor: ManagedMediaDescriptor | undefined,
): string | undefined {
  return descriptor?.placeholder ? undefined : descriptor?.assetPath ?? undefined;
}

export function descriptorRequest(options: DescriptorRequestOptions): ManagedMediaDescriptorRequest {
  return {
    requestId: options.requestId,
    ownerKind: options.ownerKind,
    ownerId: options.ownerId,
    slotKind: options.slotKind,
    slotToken: options.slotKind === "primary_visual" ? "primary_visual" : undefined,
    sourcePath: optionalPath(options.sourcePath),
    roleId: options.roleId,
    intent: options.intent ?? "ordinary_role",
    cssWidth: options.cssWidth,
    cssHeight: options.cssHeight,
    devicePixelRatio: effectiveDevicePixelRatio(),
  };
}

function dedupeEquivalentRequests(requests: ManagedMediaDescriptorRequest[]) {
  const seen = new Set<string>();
  return requests.filter((request) => {
    const key = equivalentRequestKey(request);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function equivalentRequestKey(request: ManagedMediaDescriptorRequest) {
  const { requestId: _requestId, ...identity } = request;
  return JSON.stringify(identity);
}

function localFallback(request: ManagedMediaDescriptorRequest): ManagedMediaDescriptor {
  const sourcePath = optionalPath(request.sourcePath);
  if (!sourcePath) {
    return descriptorPlaceholder(request.requestId, "local_source_unavailable");
  }
  return {
    ...descriptorPlaceholder(request.requestId, "local_original"),
    selectedSourceClass: "original",
    assetPath: sourcePath,
    originalAvailable: true,
    placeholder: false,
  };
}

function optionalPath(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function effectiveDevicePixelRatio() {
  const value = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return Number.isFinite(value) && value > 0 ? value : 1;
}
