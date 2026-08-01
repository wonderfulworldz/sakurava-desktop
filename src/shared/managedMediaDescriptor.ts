export type ManagedMediaOwnerKind =
  | "video"
  | "image"
  | "performer"
  | "category"
  | "glossary";

export type ManagedMediaSlotKind = "primary_visual" | "gallery_tile" | "mini_row";

export type ManagedMediaRoleId =
  | "video_collection_full_card"
  | "image_collection_full_card"
  | "video_detail_primary"
  | "image_detail_primary"
  | "video_table"
  | "image_table"
  | "video_lite_card"
  | "image_lite_card"
  | "performer_lite_card"
  | "related_video_active"
  | "related_image_active"
  | "related_performer_active"
  | "performer_collection_full_card"
  | "image_gallery_tile"
  | "category_active_card"
  | "category_table"
  | "glossary_table"
  | "performer_detail_primary"
  | "performer_mini_row"
  | "performer_table";

export type ManagedMediaRenderingIntent = "ordinary_role" | "full_viewer";

export type ManagedMediaDescriptorRequest = {
  requestId: string;
  ownerKind: ManagedMediaOwnerKind;
  ownerId: string;
  slotKind: ManagedMediaSlotKind;
  slotToken?: string;
  sourcePath?: string;
  roleId: ManagedMediaRoleId;
  intent: ManagedMediaRenderingIntent;
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
};

export type ManagedMediaSelectedSourceClass =
  | "managed_standard"
  | "managed_native_fallback"
  | "original"
  | "placeholder";

export type ManagedMediaDescriptor = {
  requestId: string;
  selectedSourceClass: ManagedMediaSelectedSourceClass;
  assetPath: string | null;
  family: string | null;
  tier: string | null;
  width: number | null;
  height: number | null;
  mediaKind: "image";
  originalAvailable: boolean;
  managedAvailable: boolean;
  fallbackReason: string;
  staleLastValid: boolean;
  placeholder: boolean;
  revision: string;
};

export function descriptorPlaceholder(
  requestId: string,
  fallbackReason = "invalid_descriptor_response",
): ManagedMediaDescriptor {
  return {
    requestId,
    selectedSourceClass: "placeholder",
    assetPath: null,
    family: null,
    tier: null,
    width: null,
    height: null,
    mediaKind: "image",
    originalAvailable: false,
    managedAvailable: false,
    fallbackReason,
    staleLastValid: false,
    placeholder: true,
    revision: "",
  };
}

export function parseManagedMediaDescriptor(
  value: unknown,
  requestId: string,
): ManagedMediaDescriptor {
  if (!isRecord(value) || value.requestId !== requestId) {
    return descriptorPlaceholder(requestId);
  }
  const selectedSourceClass = value.selectedSourceClass;
  if (
    selectedSourceClass !== "managed_standard" &&
    selectedSourceClass !== "managed_native_fallback" &&
    selectedSourceClass !== "original" &&
    selectedSourceClass !== "placeholder"
  ) {
    return descriptorPlaceholder(requestId);
  }
  const assetPath = nullableString(value.assetPath);
  const managed =
    selectedSourceClass === "managed_standard" ||
    selectedSourceClass === "managed_native_fallback";
  if ((managed || selectedSourceClass === "original") && !assetPath) {
    return descriptorPlaceholder(requestId, "unsafe_descriptor_response");
  }
  if (managed && (!isSafeManagedAssetPath(assetPath) || value.placeholder !== false)) {
    return descriptorPlaceholder(requestId, "unsafe_descriptor_response");
  }
  if (
    typeof value.placeholder !== "boolean" ||
    typeof value.staleLastValid !== "boolean" ||
    typeof value.originalAvailable !== "boolean" ||
    typeof value.managedAvailable !== "boolean" ||
    typeof value.fallbackReason !== "string" ||
    typeof value.revision !== "string" ||
    value.mediaKind !== "image"
  ) {
    return descriptorPlaceholder(requestId);
  }
  return {
    requestId,
    selectedSourceClass,
    assetPath,
    family: nullableString(value.family),
    tier: nullableString(value.tier),
    width: nullablePositiveInteger(value.width),
    height: nullablePositiveInteger(value.height),
    mediaKind: "image",
    originalAvailable: value.originalAvailable,
    managedAvailable: value.managedAvailable,
    fallbackReason: value.fallbackReason,
    staleLastValid: value.staleLastValid,
    placeholder: value.placeholder,
    revision: value.revision,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullablePositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function isSafeManagedAssetPath(path: string | null) {
  return Boolean(path && !path.includes("..") && !/[\r\n\0]/.test(path));
}
