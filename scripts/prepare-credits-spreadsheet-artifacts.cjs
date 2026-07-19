#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const rootIndex = process.argv.indexOf("--root");
if (rootIndex < 0 || !process.argv[rootIndex + 1] || process.argv.length !== 4) {
  throw new Error("Usage: prepare-credits-spreadsheet-artifacts.cjs --root <disposable runtime root>");
}

const withoutExtendedPrefix = (value) => value.replace(/^\\\\\?\\/, "");
const root = path.resolve(withoutExtendedPrefix(process.argv[rootIndex + 1]));
const sentinel = path.join(root, ".sakurava-disposable");
const manifestPath = path.join(root, "fixture-manifest.json");
if (!fs.existsSync(sentinel)) throw new Error("Disposable runtime sentinel is missing.");
if (!fs.existsSync(manifestPath)) throw new Error("Credits spreadsheet fixture manifest is missing.");
const fixture = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (path.resolve(withoutExtendedPrefix(fixture.root)) !== root) throw new Error("Fixture manifest root does not match the requested disposable root.");
if (!Array.isArray(fixture.headers) || fixture.headers.length !== 14) {
  throw new Error("Fixture manifest does not contain the fourteen-column Credits contract.");
}

const manualSmokeRoot = path.resolve(root, "..", "..");
if (path.basename(manualSmokeRoot).toLowerCase() !== "manual-smoke") {
  throw new Error("Disposable root is not nested under the expected manual-smoke directory.");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function valuesFor(row) {
  return [
    row.action, row.sakuravaRef, row.workType, row.workRef, row.performerRef,
    row.characterRole, row.originalCharacter, row.creditedAsMode, row.creditedAs,
    row.creditType, row.roleImportance, row.characterMode, row.billingOrder, row.note,
  ];
}

function ensureEmptyOrMissing(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    return;
  }
  if (fs.readdirSync(directory).length !== 0) {
    throw new Error(`Refusing to write into a non-empty disposable output directory: ${directory}`);
  }
}

function writeCsv(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = [fixture.headers, ...rows.map(valuesFor)]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  fs.writeFileSync(filePath, text, "utf8");
}

async function writeXlsx(filePath, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Credits");
  sheet.addRow(fixture.headers);
  for (const row of rows) sheet.addRow(valuesFor(row));
  await workbook.xlsx.writeFile(filePath);
}

async function main() {
  const inputRoot = path.resolve(withoutExtendedPrefix(fixture.smokeInputPath));
  if (!inputRoot.startsWith(root + path.sep)) throw new Error("Input artifact folder is outside the disposable root.");
  const invalidCsvSet = path.dirname(path.resolve(withoutExtendedPrefix(fixture.invalidCsvPath)));
  const mixedCsvSet = path.dirname(path.resolve(withoutExtendedPrefix(fixture.mixedCsvPath)));
  ensureEmptyOrMissing(invalidCsvSet);
  ensureEmptyOrMissing(mixedCsvSet);
  ensureEmptyOrMissing(path.resolve(withoutExtendedPrefix(fixture.xlsxExportPath)));
  ensureEmptyOrMissing(path.resolve(withoutExtendedPrefix(fixture.csvExportPath)));
  writeCsv(path.resolve(withoutExtendedPrefix(fixture.invalidCsvPath)), [fixture.invalidRow]);
  writeCsv(path.resolve(withoutExtendedPrefix(fixture.mixedCsvPath)), fixture.spreadsheetRows);
  await writeXlsx(path.resolve(withoutExtendedPrefix(fixture.invalidXlsxPath)), [fixture.invalidRow]);
  await writeXlsx(path.resolve(withoutExtendedPrefix(fixture.mixedXlsxPath)), fixture.spreadsheetRows);
  console.log(JSON.stringify({
    root,
    invalidXlsxPath: fixture.invalidXlsxPath,
    mixedXlsxPath: fixture.mixedXlsxPath,
    invalidCsvPath: fixture.invalidCsvPath,
    mixedCsvPath: fixture.mixedCsvPath,
    xlsxExportPath: fixture.xlsxExportPath,
    csvExportPath: fixture.csvExportPath,
    expectedNewRef: fixture.expectedNewRef,
    expectedFinalCount: fixture.expectedFinalCount,
    liveAppDataAccessed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`credits-spreadsheet-artifacts: ${error.message}`);
  process.exit(1);
});
