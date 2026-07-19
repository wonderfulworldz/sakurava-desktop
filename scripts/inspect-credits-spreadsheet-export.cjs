#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const rootValue = valueFor("--root");
const pathValue = valueFor("--path");
const format = valueFor("--format");
if (!rootValue || !pathValue || !["xlsx", "csv"].includes(format) || args.length !== 6) {
  throw new Error("Usage: inspect-credits-spreadsheet-export.cjs --root <runtime root> --format <xlsx|csv> --path <export file-or-folder>");
}
const root = path.resolve(rootValue);
const sentinel = path.join(root, ".sakurava-disposable");
const manifestPath = path.join(root, "fixture-manifest.json");
if (!fs.existsSync(sentinel) || !fs.existsSync(manifestPath)) {
  throw new Error("The requested root is not a prepared disposable Credits spreadsheet fixture.");
}
const fixture = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const expectedHeaders = fixture.headers;
const technicalIds = fixture.baseline.credits.flatMap((credit) => [credit.id, credit.workId, credit.performerId]);

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ""; }
    else if (char === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ""; i += 1; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const requested = path.resolve(pathValue);
  let headers, rows, source;
  if (format === "xlsx") {
    if (!fs.existsSync(requested)) throw new Error(`XLSX export does not exist: ${requested}`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(requested);
    const sheet = workbook.getWorksheet("Credits");
    if (!sheet) throw new Error("The exported workbook has no Credits worksheet.");
    headers = sheet.getRow(1).values.slice(1).map((value) => String(value ?? ""));
    rows = [];
    for (let index = 2; index <= sheet.rowCount; index += 1) rows.push(sheet.getRow(index).values.slice(1).map((value) => String(value ?? "")));
    source = requested;
  } else {
    let csvPath = requested;
    if (fs.statSync(requested).isDirectory()) {
      const matches = fs.readdirSync(requested)
        .filter((name) => /^skv-cre-\d{8}-\d{6}\.csv$/.test(name))
        .map((name) => path.join(requested, name));
      if (matches.length !== 1) {
        throw new Error(`Expected exactly one skv-cre timestamped CSV export in ${requested}; found ${matches.length}.`);
      }
      csvPath = matches[0];
    }
    if (!/^skv-cre-\d{8}-\d{6}\.csv$/.test(path.basename(csvPath))) {
      throw new Error(`CSV export filename must match skv-cre-YYYYDDMM-HHMMSS.csv: ${csvPath}`);
    }
    if (!fs.existsSync(csvPath)) throw new Error(`CSV export does not exist: ${csvPath}`);
    [headers, ...rows] = parseCsv(fs.readFileSync(csvPath, "utf8"));
    source = csvPath;
  }
  if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) throw new Error("Credits headers do not match the locked fourteen-column contract.");
  const serialized = JSON.stringify(rows);
  const exposedTechnicalIds = technicalIds.filter((id) => id && serialized.includes(id));
  if (exposedTechnicalIds.length) throw new Error(`Export exposes technical identifiers: ${exposedTechnicalIds.join(", ")}`);
  const refColumn = headers.indexOf("Sakurava Ref");
  const malformedRefs = rows.map((row) => row[refColumn]).filter((ref) => !/^R\d{4}-\d{4}$/.test(ref));
  if (malformedRefs.length) throw new Error("Export contains missing or malformed public Credit Refs.");
  console.log(JSON.stringify({ source, format, sheet: format === "xlsx" ? "Credits" : undefined, headers, rowCount: rows.length, malformedRefs: malformedRefs.length, exposedTechnicalIds, verified: true }, null, 2));
}

main().catch((error) => { console.error(`credits-spreadsheet-export-inspector: ${error.message}`); process.exit(1); });
