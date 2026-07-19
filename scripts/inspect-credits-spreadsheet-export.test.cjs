"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const inspector = path.join(__dirname, "inspect-credits-spreadsheet-export.cjs");
const headers = [
  "Action", "Sakurava Ref", "Work Type", "Work Ref", "Performer Ref", "Character / Role",
  "Original Character", "Credited As Mode", "Credited As", "Credit Type", "Role Importance",
  "Character Mode", "Billing Order", "Note",
];

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sakurava-credit-export-inspector-"));
  fs.writeFileSync(path.join(root, ".sakurava-disposable"), "");
  fs.writeFileSync(path.join(root, "fixture-manifest.json"), JSON.stringify({
    headers,
    baseline: { credits: [{ id: "credit-1", workId: "video-1", performerId: "performer-1" }] },
  }));
  return root;
}

function csv() {
  return `${headers.join(",")}\r\nAuto,R2607-0001,Video,V2607-0001,P2607-0001,Role,,, ,Original,,Text,1,\r\n`;
}

test("accepts a timestamped skv-cre CSV and rejects ambiguous folders", () => {
  const root = fixtureRoot();
  const folder = path.join(root, "export");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "skv-cre-20261907-082734.csv"), csv());
  const accepted = spawnSync(process.execPath, [inspector, "--root", root, "--format", "csv", "--path", folder], { encoding: "utf8" });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /"verified": true/);

  fs.writeFileSync(path.join(folder, "skv-cre-20261907-082735.csv"), csv());
  const ambiguous = spawnSync(process.execPath, [inspector, "--root", root, "--format", "csv", "--path", folder], { encoding: "utf8" });
  assert.notEqual(ambiguous.status, 0);
  assert.match(ambiguous.stderr, /Expected exactly one skv-cre timestamped CSV export/);
});
