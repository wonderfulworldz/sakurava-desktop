# 34 - Settings Page V1 Information Architecture

## 1. Purpose

Batch 29.1 adalah batch dokumentasi saja untuk mengunci information architecture Settings Page V1 sebelum implementasi UI Batch 29.2.

Settings V1 harus menjadi control center yang jelas untuk aplikasi lokal/offline Sakurava. Settings tidak boleh menjadi dumping ground untuk fitur yang belum siap, eksperimen, atau kontrol yang terlihat aktif tetapi belum memiliki perilaku aman.

Tujuan utama:

- memisahkan fitur aktif/safe dari fitur planned/deferred;
- menjaga Settings tetap sederhana dan mudah dipercaya;
- menyediakan struktur menu yang bisa diimplementasikan di Batch 29.2;
- menjaga semua aturan local-first, private-first, dan no-file-mutation.

## 2. Context

Sakurava adalah desktop app lokal/offline untuk Videos, Images, dan Performers. MVP baseline tetap:

```text
Add -> Save -> List -> Detail -> Edit -> Restart -> data persists
```

Settings V1 harus membaca konteks berikut:

- `docs/12-backup-restore-ux-safety.md` untuk Backup/Restore;
- `docs/13-settings-persistence-planning.md` untuk batas persistensi Settings;
- `docs/14-category-management-dedicated-page-planning.md` dan `docs/10-category-management-safety.md` untuk Category Management;
- `docs/28-ui-ux-v1-audit-prioritization-plan.md` untuk urutan UI/UX V1.

Batch 29.1 tidak mengubah React, runtime, database, schema, package, atau Tauri behavior.

## 3. Settings V1 Principles

- Settings harus terasa sederhana, aman, dan jelas.
- Settings menampilkan behavior yang benar-benar tersedia, bukan kontrol palsu.
- Planned feature harus disabled, diberi status planned, atau tidak ditampilkan sampai batch implementasi yang tepat.
- Label user-facing harus jelas dan tidak terlalu teknis.
- Hindari raw path, raw database path, raw ID, UUID, atau raw JSON jika tidak aman/terlalu teknis.
- Jangan mencampur Category Management CRUD penuh ke Settings.
- Jangan menambahkan Settings persistence baru tanpa batch terpisah.
- Jangan menambahkan scanner, watcher, file copy/move/delete, thumbnail generation, atau automation.

## 4. Recommended Settings V1 Groups

### A. App Information

Isi yang sesuai untuk V1:

- app name;
- version/build info jika sudah tersedia secara aman;
- local/offline note;
- storage/database status hanya jika sudah ada secara aman;
- status runtime yang sudah ada dan tidak memerlukan deteksi baru.

Guardrails:

- jangan menambah runtime detection baru di Batch 29.1 atau 29.2;
- jangan mengekspos raw database path jika terlalu teknis atau berisiko;
- jangan menampilkan status palsu.

### B. Data & Safety

Isi yang sesuai untuk V1:

- entry point/placeholder terencana untuk Backup/Restore;
- entry point/placeholder terencana untuk Import/Export;
- data location info hanya jika sudah aman dan sudah tersedia;
- pesan eksplisit bahwa media files tidak otomatis termasuk dalam Backup/Restore jika area ini ditampilkan.

Guardrails:

- tidak ada implementasi Backup/Restore di Batch 29.1;
- tidak ada implementasi Import/Export di Batch 29.1;
- tidak ada destructive one-click action;
- tidak ada behavior yang mengganti, menghapus, atau memindahkan data.

### C. Categories

Isi yang sesuai untuk V1:

- entry point ke Category Management;
- penjelasan bahwa Category Management V1 ditangani di Batch 30.x;
- link/button yang jelas menuju dedicated Category Management page jika route tersedia;
- ringkasan aman bahwa Record Categories tetap disimpan di `categoriesJson`.

Guardrails:

- Settings tidak boleh memuat full embedded Category Management panel/dashboard;
- tidak ada Category CRUD di Settings V1;
- tidak ada parent/child category, description, thumbnail, analytics, table, pagination, atau selected detail di Settings;
- tidak mengubah Managed Categories atau Record Categories storage.

### D. Appearance

Isi yang sesuai untuk V1:

- area planned untuk Theme / Appearance;
- light mode sebagai baseline stabil saat ini;
- status planned/unavailable jika theme switching belum ada.

Guardrails:

- tidak mengimplementasikan theme switching di Batch 29.1 atau 29.2;
- tidak mengimplementasikan language switching di Batch 29.1 atau 29.2;
- jangan menampilkan toggle aktif jika tidak benar-benar bekerja.

### E. Media & Files

Isi yang sesuai untuk V1:

- ringkasan media root/path behavior jika sudah ada secara aman;
- planned area untuk file status / missing file handling jika relevan;
- peringatan bahwa media files tetap external local paths.

Guardrails:

- tidak ada file scan;
- tidak ada folder scan;
- tidak ada recursive scan;
- tidak ada watcher/live sync;
- tidak ada copy, import, move, rename, delete, atau thumbnail generation;
- tidak ada metadata extraction otomatis.

### F. Advanced / Maintenance

Isi yang sesuai untuk V1:

- area planned untuk future maintenance tools hanya jika membantu orientasi user;
- disabled/planned state untuk fitur berisiko.

Guardrails:

- Bulk Editor tetap deferred;
- Optimize/cleanup automation tetap deferred;
- analytics tetap deferred;
- advanced category hierarchy tetap deferred;
- tidak ada automation yang mengubah records tanpa planning, preview, dan confirmation.

## 5. V1 vs Deferred Classification

### V1 / Near-term

- Clean Settings menu structure.
- Grouping yang jelas berdasarkan IA ini.
- Honest unavailable/planned states.
- Link/entry point ke Category Management jika route tersedia.
- Existing database/runtime status display jika sudah implemented secara aman.
- Existing safe media root/path information jika sudah ada dan tidak menambah behavior baru.

### Deferred

- Real theme switching.
- Real language switching.
- Welcome slider logic.
- Backup/Restore implementation.
- Import/Export implementation.
- Bulk editor.
- Optimize/cleanup automation.
- File missing scanner.
- Advanced category hierarchy.
- Category analytics.
- Media watcher/scanner.
- Any schema-backed Settings persistence kecuali batch terpisah menjadwalkannya secara eksplisit.

## 6. UX Rules

- Gunakan satu halaman Settings/menu yang bersih terlebih dahulu; jangan membuat nested pages baru kecuali planning berikutnya menyetujui.
- Gunakan grouping yang mudah dipindai.
- Hindari terlalu banyak tombol.
- Tombol hanya untuk aksi/navigation yang jelas.
- Planned item harus jelas sebagai planned/disabled atau omitted.
- Jangan memakai istilah teknis mentah di UI user-facing jika ada label yang lebih aman.
- Jangan menampilkan raw JSON, raw ID, UUID, atau raw database implementation detail.
- Settings harus konsisten dengan gaya Sakurava V1: utilitarian, tenang, dan tidak dekoratif berlebihan.

## 7. Batch 29.2 Handoff

Batch 29.2 - Settings Page V1 Menu Cleanup harus mengimplementasikan:

- layout/menu Settings yang mengikuti grup IA ini;
- pemisahan active/safe item dari planned/deferred item;
- entry point Category Management yang jelas, bukan embedded full CRUD panel;
- existing working Settings behavior tetap dipertahankan;
- planned/unavailable states yang jujur;
- tidak ada Settings persistence baru kecuali sudah ada sebelumnya;
- tidak ada perubahan schema/database/runtime/package;
- tidak ada file scanner/watcher/mutation.

Batch 29.2 tidak boleh mengimplementasikan:

- Backup/Restore behavior baru;
- Import/Export;
- theme/language switching;
- Category Management V1 CRUD;
- media scanner/watcher;
- advanced maintenance automation;
- roadmap perubahan.

## 8. Implementation Guardrails

- No source code implementation in Batch 29.1.
- No tests edits unless documentation references require it.
- No schema changes.
- No database changes.
- No migration changes.
- No new dependencies.
- No package changes.
- No Tauri/Cargo config changes.
- No runtime command changes.
- No file scan/watcher/copy/move/delete/rename.
- No thumbnail generation.
- No fake controls.
- No roadmap changes.
- No Settings persistence implementation.

## 9. Acceptance Criteria

- Settings V1 purpose is documented.
- Recommended Settings V1 groups are documented.
- V1 and deferred items are clearly classified.
- UX rules are documented.
- Batch 29.2 implementation handoff is documented.
- Guardrails explicitly prevent implementation, schema/runtime/package changes, file mutation, and fake controls.
- Git diff for Batch 29.1 is documentation-only.

## 10. Expected Checkpoint

Expected checkpoint tag after merge:

```text
post-mvp-29-1-settings-page-v1-information-architecture-v1
```
