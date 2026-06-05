import type { Availability } from "../backend/types";
import { stringifyGalleryImagePathArray } from "../backend/json";
import { probeMediaMetadata } from "../runtime/mediaMetadataCommands";
import { DETAIL_EMPTY_VALUE } from "./detailData";

type FormValues = Record<string, string | boolean>;

const GALLERY_PROBE_LIMIT = 100;

export async function detectVideoTechInfo(values: FormValues) {
  const mediaPath = textValue(values.mediaPath);
  const probe = await probeMediaMetadata(mediaPath);
  const nextValues: FormValues = {
    ...values,
    availability: availabilityFromSinglePath(mediaPath, probe.status),
    durationMinutes:
      positiveIntegerText(probe.durationMinutes) ||
      positiveIntegerFormText(values.durationMinutes),
    fileSizeBytes: numberText(probe.fileSizeBytes),
    fileType: probe.fileType,
  };

  if (probe.resolution) {
    nextValues.resolution = probe.resolution;
  }

  return nextValues;
}

export async function detectImageTechInfo(
  values: FormValues,
  galleryImagePaths: string[],
) {
  const normalizedPaths = parseGalleryPaths(galleryImagePaths);
  const sourcePaths = normalizedPaths.length > 0 ? normalizedPaths : [textValue(values.coverPath)];
  const probes = [];

  for (const path of sourcePaths.slice(0, GALLERY_PROBE_LIMIT)) {
    if (path) {
      probes.push(await probeMediaMetadata(path));
    }
  }

  const existingProbes = probes.filter(
    (probe) => probe.status === "exists" && probe.kind === "file",
  );
  const mainProbe =
    existingProbes.find((probe) => probe.resolution) ?? existingProbes[0] ?? null;
  const totalFileSizeBytes = existingProbes.reduce(
    (total, probe) => total + (probe.fileSizeBytes ?? 0),
    0,
  );

  return {
    ...values,
    availability: availabilityFromManyPaths(sourcePaths, existingProbes.length),
    imageCount: normalizedPaths.length > 0 ? String(normalizedPaths.length) : "",
    mainResolution: mainProbe?.resolution ?? "",
    totalFileSizeBytes: totalFileSizeBytes > 0 ? String(totalFileSizeBytes) : "",
    mainFileType: mainProbe?.fileType ?? "",
  };
}

export async function prepareVideoValuesForSave(values: FormValues) {
  return detectVideoTechInfo(values);
}

export async function prepareImageValuesForSave(
  values: FormValues,
  galleryImagePaths: string[],
) {
  return detectImageTechInfo(values, galleryImagePaths);
}

export function formatFileSize(bytes: number | null | undefined) {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
    return DETAIL_EMPTY_VALUE;
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const displayValue = value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1);
  return `${displayValue} ${units[unitIndex]}`;
}

export function formatOptionalText(value: string | null | undefined) {
  return value?.trim() || DETAIL_EMPTY_VALUE;
}

function availabilityFromSinglePath(
  path: string,
  status: "notSet" | "exists" | "missing" | "inaccessible" | "unknown",
): Availability {
  if (!path.trim()) {
    return "Not Owned";
  }

  return status === "exists" ? "Owned" : "Missing";
}

function availabilityFromManyPaths(paths: string[], existingCount: number): Availability {
  const hasPath = paths.some((path) => path.trim());
  if (!hasPath) {
    return "Not Owned";
  }

  return existingCount > 0 ? "Owned" : "Missing";
}

function parseGalleryPaths(paths: string[]) {
  return JSON.parse(stringifyGalleryImagePathArray(paths)) as string[];
}

function numberText(value: number | null | undefined) {
  return Number.isFinite(value) && value && value > 0 ? String(value) : "";
}

function positiveIntegerText(value: number | null | undefined) {
  return Number.isInteger(value) && value && value > 0 ? String(value) : "";
}

function positiveIntegerFormText(value: FormValues[string]) {
  if (typeof value !== "string" || value.trim() === "") {
    return "";
  }

  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? String(number) : "";
}

function textValue(value: FormValues[string]) {
  return typeof value === "string" ? value.trim() : "";
}
