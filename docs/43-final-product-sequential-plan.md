# Final Product Sequential Plan (Batches 35.2 - 35.10)

This document establishes the official sequential execution roadmap, risk policies, and detailed implementation plan for the final product polish, release, and audit of the Sakurava Desktop App.

---

## Core Governance & Audit Policies

### Source of Truth
* All implementations **MUST** align strictly with the design, layout mockups, and exported specs in:
  `docs/mockups/35-final-product/` (Refer to `00-index.md` for individual file mappings)

### Sequential Execution Rule
* Future agents **MUST** fully complete, verify, and pass the build/tests for the **current batch** before initiating any work on the **next batch**. No parallel batch development is permitted.

### Risk-Based Audit Policy
* **Low Risk**: Standard visual alignments and cosmetic components. Propose and implement directly.
* **High Risk / Unknown**: Complex state management, database schema actions, backup/restore features, custom routing, or Tauri integration. A thorough code and safety audit **MUST** be completed before patching files.
* **Failure Clause**: If a revision fails automated builds/tests, or if a patch applied to the live app does not successfully manifest the required behavior, the agent **MUST** stop all current patching, rollback, and trace the root cause immediately before trying again.

---

## Sequential Roadmap

### 35.2 - Form System Finalization
Rework and standardize all form inputs across the app to support uniform design patterns, clear validations, and keyboard navigation.

* **Mockup References**:
  * Spec: [Final Form Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Form%20Spec%20370b4fe015dd80d08428c8e78f957e47.md)
  * Visuals: `Video_Form_Layout.png`, `Image_Form_Layout.png`, `Performer_Form_Layout.png`
* **Scope Summary**:
  * **Full Form Rework**: Video, Image, Performer, and Category Management Forms.
  * Standardize identity sections (Title, Code, Fav), metadata fields, file inputs with browse actions, durational tech auto-detect button, multi-criteria ratings, searchable smart pickers (with popovers for Categories and Related Performers), and rich-text note areas.
  * Unify state behaviors (Add/Edit mode, form cancellation, clear-all behaviors).
* **Acceptance Criteria**:
  * Reworked forms match `Video_Form_Layout.png`, `Image_Form_Layout.png`, `Performer_Form_Layout.png`.
  * State behaviors function perfectly (Enter focus triggers edit, `Esc` cancels/collapses form, and `Ctrl/Cmd + S` saves changes if modified).
  * Form validations prevent invalid or empty required fields from triggering saves.

---

### 35.3 - Category Library Finalization
Integrate the Category Catalog and Category Management page into a unified visual experience, adhering to strict safety protocols for label changes.

* **Mockup References**:
  * Spec: [Final Category Management Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Category%20Management%20Spec%20370b4fe015dd80faafbfe91f954108b0.md)
  * Specs: `Category Management Merge 372b4fe015dd80b1bb60d5de339d4485.md`
  * Visuals: `Category_Management_Layout.png`, `Categories_Page_Card.png`, `Categories_Page_Tabel.png`, `State_-_Categories.png`
* **Scope Summary**:
  * **Category Catalog + Management Merge**: A single visual interface combining list views (Card and Table grid toggles), searchable filters, and sorting keys (Term/Category A-Z).
  * Implement parent/child folder hierarchy structures, display total usage stats alongside specific breakdowns (Videos, Images, Performers counts), and enable navigation links on breakdowns.
  * Apply strict category management safety rules: circular parent prevention, fallback placeholders for missing thumbnails, and safety warnings for deleting categories in use.
* **Acceptance Criteria**:
  * Grid Card / Compact Table view toggles persist state perfectly based on Settings.
  * Folder hierarchies render correctly with indented styles; parent directories expand/collapse.
  * Usage breakdown clicks open their respective catalogs with the active category pre-filtered.
  * Safe validations actively block circular relationships and prompt confirmation before destructive deletion.

---

### 35.4 - Detail System Finalization
Standardize the detail inspection layouts for Videos, Images, and Performers, establishing strong visual hierarchies and click navigation shortcuts.

* **Mockup References**:
  * Spec: [Final Detail Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Detail%20Spec%20370b4fe015dd807c80d8e37b0b809cac.md)
  * Specs: `Video Detail section order`, `Image Detail section order`, `Performer Detail section order`
  * Visuals: `Video_Detail_Layout.png`, `Image_Detail_Layout.png`, `Performer_Detail_Layout.png`, `State_-_Related_Video.png`, `State_-_Related_Image.png`, `State_-_Related_Performer.png`
* **Scope Summary**:
  * **Detail Page Rework**: Streamline content section orders (Basic Details, Technical Info, Interactive Badges, Ratings, Comments, and Related Media Cards).
  * Enforce standard empty placeholder removal rules (showing a clean, uniform "N/A" label for unassigned elements).
  * Implement active click actions for category chips, source links, and related media item cards to enable rapid navigation.
* **Acceptance Criteria**:
  * Section layout structures match the respective Video, Image, and Performer detailed layout models.
  * Empty metadata values render as a uniform "N/A" rather than leaving empty space or broken components.
  * Click actions route the user instantly (category chips filter catalog, external source links open external browsers, and related cards inspect items).

---

### 35.5 - Global Gallery Preview Finalization
Unify the preview and lightbox inspection behavior for images across the entire catalog and detail sheets.

* **Mockup References**:
  * Spec: [Gallery Image Preview behavior 370b4fe015dd80499c9ad161ddb1238c.md](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Gallery%20Image%20Preview%20behavior%20370b4fe015dd80499c9ad161ddb1238c.md)
  * Visuals: `Image_View_Layout.png`
* **Scope Summary**:
  * **Global Gallery Image Preview**: Lightbox viewer overlay.
  * Support active image slider (Next/Prev overlays), smart controls (mouse scroll zoom, grab-and-drag pan, double-click default reset), and keyboard shortcuts (Left/Right Arrows, Escape to exit).
* **Acceptance Criteria**:
  * Full-size preview interface matches `Image_View_Layout.png` and works globally across all media views.
  * Interactivity features (zoom, pan, resets, and keyboard listeners) work smoothly without breaking layout constraints.

---

### 35.6 - Collection Toolbar + Table Finalization
Revamp the core catalog browsing interfaces to provide powerful sorting, advanced filtering panels, and clean pagination.

* **Mockup References**:
  * Spec: [Final Collection Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Collection%20Spec%20370b4fe015dd804aa077cf922c46f1bd.md)
  * Specs: `Filter bar performer`
  * Visuals: `Categories_Page_Tabel.png`
* **Scope Summary**:
  * **Collection Toolbar/Table Rework**: Redesign the grid toolbar and table elements.
  * Add the Advanced Filter Panel for detailed searches (Usia/Age range, Nationality searchable select, Height, average ratings range, work volume, and specific tags).
  * Standardize filter chip rules (display order, clear-all behaviors) and interactive column sorts.
* **Acceptance Criteria**:
  * Advanced filter inputs register and filter lists correctly in real-time.
  * Toolbar chip rows display active search tags; clicking "Clear All" fully resets filters.
  * Pagination headers render showing matching search results and rows-per-page selectors.

---

### 35.7 - Glossary Library
Introduce a standalone visual encyclopedia interface that is completely decoupled from the main catalog metadata schema.

* **Mockup References**:
  * Specs: `Glossary Library Page 372b4fe015dd8063b50de13ea7e9f673.md`
  * Visuals: `Glosarry_Page_Layout.png`, `ChatGPT_Image_Jun_1_2026_08_48_33_PM_(1).png` to `..._35_PM_(4).png`
* **Scope Summary**:
  * **New Glossary Library Page**: Independent of catalog and category systems.
  * Design a hidden-by-default Glossary CRUD form (synonym chips, thumbnail browse, favorites, and single source links).
  * Create the Glossary Table with clean synonym count badges, favoriting icons, definitions, and external source link triggers.
  * **Sidebar Restructure**: Position the new Glossary entry alongside Settings in the lower section of the primary navigation sidebar.
* **Acceptance Criteria**:
  * Navigation Sidebar successfully renders Glossary and Settings in the lower container.
  * Glossary CRUD form functions with validation (required Term and Definition).
  * Glossary table lists items matching `Glosarry_Page_Layout.png`.
  * Footer displays the Glossary Independence Notice.

---

### 35.8 - Settings System Finalization
Provide a comprehensive settings control center with detailed sub-panels and custom configuration inputs.

* **Mockup References**:
  * Spec: [Final Settings Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Settings%20Spec%20370b4fe015dd80b984c5f46c0e04dd8a.md)
  * Specs: `Section layout 370b4fe015dd8020bb32f42b53b527e3.md`
  * Visuals: `Settings_Page_Layout.png` and sub-panel visual specs `1._Setting_-_Appearance.png` to `7._Setting_-_Keyboard_Shortcut.png`
* **Scope Summary**:
  * **Settings Full Rework**: Implement standard sub-panel layout structure:
    1. *Appearance*: Theme (Light/Dark/System), Accent / Background Color wheel & presets, UI Density (Comfortable/Compact), motion toggles.
    2. *Language*: Custom localization templates import/export.
    3. *Catalog Experience*: View/Sort preferences, remember last states.
    4. *Click Behavior*: Active navigation shortcuts toggle.
    5. *Media & Storage*: Registered media roots path rows with primary tags, supported file formats.
    6. *Performance & Cache*: App-specific storage usage status, action buttons (Clear cache, logs, recreate previews), and Danger Zone.
    7. *Backup & Recovery*: Auto-backup configurations and Manual Backup/Restore SQLite actions.
    8. *Import / Export*: Data backups import/export using CSV templates.
    9. *Keyboard Shortcuts*: Custom shortcut binding panel.
    10. *Extensions*: Coming Soon status card.
    11. *App Information*: Build versions, diagnostics, and SQLite connection logs.
* **Acceptance Criteria**:
  * Sub-panel sections render in order matching `Settings_Page_Layout.png`.
  * Appearance custom colors and UI density presets apply globally.
  * Backup/Restore operations trigger the safety confirmation steps in `docs/12-backup-restore-ux-safety.md`.
  * Keyboard shortcut editor detects key presses, validates conflicts, and updates keymaps.

---

### 35.9 - Performance + Translation + Copy Cleanup
Audit high-volume catalog optimizations, load strategies, local translation templates, and text polishing.

* **Mockup References**:
  * Specs: [Final Performance Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Performance%20Spec%20370b4fe015dd80b6ac39eef9a58b22d2.md), [Final Translation Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Translation%20Spec%20370b4fe015dd8043bc82f6520ca1e811.md)
* **Scope Summary**:
  * **Performance & Caching**: Integrate low-end PC target constraints (disabling micro-animations), cache handling, lazy load assets strategy, and thumbnail processing.
  * **Translation / Copy Cleanup**: Replace all MVP placeholder/planning texts. Audit copy strings to make sure empty values render uniformly as "N/A", and support translation template overrides.
* **Acceptance Criteria**:
  * Large catalogs load efficiently using lazy load asset patterns.
  * Performance toggles (animations off) eliminate UI transitions.
  * Fully clean user interface containing zero MVP layout dummy/placeholder texts.

---

### 35.10 - Branding + App Shell + Installer Release Candidate
Finalize Tauri shell native wrappers, shortcuts, branding, packaging setups, and diagnostic compliance audits.

* **Mockup References**:
  * Specs: [Final Branding Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Branding%20App%20Shell%20Spec%20370b4fe015dd8065afb7c8e42e178fc7.md), [Final Release Spec](file:///D:/sakurava-desktop/docs/mockups/35-final-product/Final%20Release%20Spec%20370b4fe015dd80628832e4b85b5e1751.md)
  * Checklists: `Final Checklist Sakurava.csv`, `Final Checklist Sakurava_all.csv`
* **Scope Summary**:
  * **Branding & Shell Finalization**: Native titlebar design, sidebar logo headers, back/forward mouse/keyboard history navigations, window shadow enhancements.
  * **Desktop Installer Setup**: Production packaging configurations, SQLite DB integrity diagnostics, pre-install setups, setup checklists.
* **Acceptance Criteria**:
  * Shell layout behaves as a native Windows desktop client with window controls, back/forward history integration, and icons.
  * Production bundle compiles (`npm run build` and `tauri build`) cleanly without dependency failures.
  * Setup diagnostic audits confirm database migration and recovery functions successfully.

---

## Planning Milestone Disclaimer
* **IMPORTANT**: Under the constraints of Batch 35.1B/C, **NO app-level logic or components have been created or modified**. This sequential roadmap is purely a planning spec designed to serve as a comprehensive execution guide for future implementation agents.
