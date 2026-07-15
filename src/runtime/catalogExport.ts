import {
  buildCsvExportArtifacts,
  buildXlsxExportArtifact,
  type ExportArtifact,
  type ExportOperationResult,
} from "../lib/exportArtifacts";
import type { ExportFormat } from "../lib/exportCsv";
import type { ExportDataSelection } from "../lib/exportWorkbook";
import {
  selectCatalogCsvExportFolder,
  selectCatalogExportDestination,
} from "./dialogCommands";
import { writeExportArtifact, writeExportArtifactSet } from "./exportCommands";

type CatalogExportDependencies = {
  selectFile: typeof selectCatalogExportDestination;
  selectFolder: typeof selectCatalogCsvExportFolder;
  writeOne: typeof writeExportArtifact;
  writeMany: typeof writeExportArtifactSet;
};

const defaultDependencies: CatalogExportDependencies = {
  selectFile: selectCatalogExportDestination,
  selectFolder: selectCatalogCsvExportFolder,
  writeOne: writeExportArtifact,
  writeMany: writeExportArtifactSet,
};

export async function runCatalogExport({
  format,
  selections,
  locale,
  date = new Date(),
  template = false,
  dependencies = defaultDependencies,
}: {
  format: ExportFormat;
  selections: ExportDataSelection[];
  locale: string;
  date?: Date;
  template?: boolean;
  dependencies?: CatalogExportDependencies;
}): Promise<ExportOperationResult> {
  const selectedDataTypes = selections.map((selection) => selection.dataType);
  const recordCounts = Object.fromEntries(
    selections.map((selection) => [selection.dataType, selection.records.length]),
  );
  const base = {
    format,
    selectedDataTypes,
    recordCounts,
    warnings: [] as string[],
  };

  try {
    if (format === "xlsx") {
      const artifact = await buildXlsxExportArtifact({ selections, locale, date, template });
      const destinationPath = await dependencies.selectFile(
        selectedDataTypes,
        "xlsx",
        date,
      );
      if (!destinationPath) return cancelledResult(base);
      const result = await dependencies.writeOne(destinationPath, artifact);
      return {
        ...base,
        cancelled: false,
        exportedFileCount: 1,
        displayNames: [result.displayName],
        errors: [],
        destinationPath: result.destinationPath,
      };
    }

    const artifacts = buildCsvExportArtifacts({ selections, locale, date });
    if (artifacts.length === 1) {
      const destinationPath = await dependencies.selectFile(
        selectedDataTypes,
        "csv",
        date,
      );
      if (!destinationPath) return cancelledResult(base);
      const result = await dependencies.writeOne(destinationPath, artifacts[0]);
      return {
        ...base,
        cancelled: false,
        exportedFileCount: 1,
        displayNames: [result.displayName],
        errors: [],
        destinationPath: result.destinationPath,
      };
    }

    const destinationFolder = await dependencies.selectFolder();
    if (!destinationFolder) return cancelledResult(base);
    const result = await dependencies.writeMany(destinationFolder, artifacts);
    return {
      ...base,
      cancelled: false,
      exportedFileCount: result.filesWritten,
      displayNames: result.displayNames,
      errors: [],
      destinationPath: result.destinationPath,
    };
  } catch (error) {
    return {
      ...base,
      cancelled: false,
      exportedFileCount: 0,
      displayNames: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function cancelledResult(base: Pick<
  ExportOperationResult,
  "format" | "selectedDataTypes" | "recordCounts" | "warnings"
>): ExportOperationResult {
  return {
    ...base,
    cancelled: true,
    exportedFileCount: 0,
    displayNames: [],
    errors: [],
  };
}

export function isTemplateExport(selections: ExportDataSelection[]) {
  return selections.length === 1 && selections[0].records.length === 0;
}

export type { ExportArtifact };
