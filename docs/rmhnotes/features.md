# 📝 Notes + Reminders Web App Ideas

---

## 🔧 Core / Essential Features

- **Rich Text Editor** ✅ — Full formatting support (bold, italic, headers, code blocks, tables) using TipTap
- **Folder & Tag System** ✅ — Hierarchical folders + multi-tag support for flexible organization
- **Reminder with Repeat Rules** ✅ — One-time and recurring reminders (daily, weekly, monthly)
- **Pinned Notes** ✅ — Pin high-priority notes to the top of a dashboard or sidebar
- **Search with Filters** ✅ — Full-text search with filter by tag, date created, date modified, reminder status
- **Archive & Trash** ✅ — Soft-delete notes into trash, archive completed items separately
- **Note Locking** ✅ — Lock individual notes with a password
- **Dark / Light Mode** ✅ — System-preference-aware theme switching
- **Offline Mode + Sync** 🔮 Future — Requires service worker + IndexedDB; app currently requires server connectivity
- **Keyboard Shortcuts** ✅ — Full hotkey support for power users (new note, search, archive, etc.)
- **Auto-Save** ✅ — Debounced auto-save with a "last saved" indicator
- **Cross-Device Sync** ✅ — Sync across devices via server DB (real-time via WebSockets marked future)

---

## ✨ Quality of Life (QOL) Features

- **Drag & Drop Reordering** ✅ — Reorder notes in list via drag and drop
- **Collapsible Sections** ✅ — Foldable headers inside notes to manage long content
- **Note Templates** ✅ — Pre-built and user-defined templates (meeting notes, daily journal, project brief, etc.)
- **Quick Capture Modal** ✅ — Global hotkey (Ctrl+Shift+N) to open a floating mini-editor from anywhere
- **Inline Checklists** ✅ — To-do checkboxes embedded directly inside notes, with completion tracking
- **Reading Mode** ✅ — Distraction-free, clean rendering of a note (no UI chrome)
- **Word / Character Count** ✅ — Live count in the footer of the editor
- **Color-Coded Notes** ✅ — Assign background or accent colors to notes for visual grouping
- **Favorites / Starred Notes** ✅ — Star notes for quick sidebar access
- **Undo History Panel** ✅ — Visual history of note versions with the ability to restore
- **Notification Snooze** ✅ — Snooze reminder alerts for 10 min / 1 hour / tomorrow
- **Duplicate Note** ✅ — One-click note duplication for reusing structures
- **Export Options** ✅ — Export notes as Markdown, plain text, or HTML
- **Note Statistics** ✅ — Dashboard showing notes created per week, reminders completed, streaks, etc.
- **Recently Viewed** ✅ — Quick access panel for the last 10 opened notes
- **Context Menu on Right-Click** ✅ — Right-click notes for quick actions (pin, color, archive, share)

> **🔮 Future:** Resizable Side-by-Side View, Smart Date Parsing ("remind me tomorrow at 3pm"), Focus Timer / Pomodoro Integration, Import from Other Apps (Notion, Evernote, Apple Notes), PDF export (complex layout engine)

---

## 🤝 Collaboration Features

- **Share via Link** ✅ — Generate a public read-only link for any note

> **🔮 Future (requires real-time infrastructure):** Shared Notebooks, Commenting System, Presence Indicators, Change Attribution, Shared Reminders, Note Reactions

---

## 🛠️ Power User / Developer Tools

- **Markdown Mode** ✅ — Toggle between rich text and raw Markdown editing at any time
- **Code Snippet Notes** ✅ — Syntax-highlighted code blocks with a one-click copy button
- **Version History** ✅ — History of note saves with the ability to restore a specific version
- **Data Export as JSON** ✅ — Full structured export of all notes, tags, and reminders in JSON format

> **🔮 Future:** External RESTful API Access, Webhook Support, Zapier / Make Integration, CLI Tool, Version History with Side-by-Side Diff View, Custom CSS Themes, IFTTT / Apple Shortcut Automations

---

## 🗓️ Calendar & Time-Based Features

- **Calendar View** ✅ — Visual monthly calendar showing all reminder due dates
- **Overdue Reminders Dashboard** ✅ — Dedicated view for past-due items needing attention
- **Agenda View** ✅ — Chronological daily list of all upcoming reminders with linked notes
- **Reminder Snooze** ✅ — Snooze reminders for 10 min / 1 hour / tomorrow

> **🔮 Future:** Time-Blocked Notes, Natural Language Scheduling ("every Monday at 9am"), Time Zone Support, Google Calendar Sync (requires paid OAuth/API), Deadline Heatmap, Recurring Task Streaks tracking

---

## 🔐 Privacy & Security Features

- **Note-Level Locking** ✅ — Lock individual notes with a passphrase
- **Login Activity** ✅ — Handled by Better Auth sessions
- **GDPR Data Export** ✅ — One-click full data export as JSON

> **🔮 Future (major architecture changes required):** End-to-End Encryption, Zero-Knowledge Architecture, Biometric Lock (mobile-only native API), Self-Hostable Docker Setup, Full GDPR Account Deletion flow

---

## 🎨 Creative & Fun Features

- **Mood Journaling** ✅ — Quick daily mood check-in with emoji + color attached to a journal note
- **Random Note Surfacer** ✅ — "Surprise me" button that shows a random old note
- **Note Streaks** ✅ — Gamified streak counter for consecutive days of writing
- **End-of-Day Reflection Prompt** ✅ — A timed evening prompt asking "What did you accomplish today?"
- **Note to Tweet/Thread Formatter** ✅ — Convert a note into a Twitter/X thread format with character splitting

> **🔮 Future:** Voice Notes (audio recording/playback complexity), Handwriting/Sketch Canvas (canvas drawing complexity), Vision Board Mode (freeform image canvas)

---

## 🔗 Integration & Ecosystem Features

- **Open Graph Previews** ✅ — Paste a URL into a note and get a rich link preview card

> **🔮 Future (external APIs / paid services):** Browser Extension, GitHub / Notion Two-Way Sync, Google Calendar Sync, Readwise Integration, Zapier / Make Integration, IFTTT / Apple Shortcuts

---
