# MyPersonalShelf

MyPersonalShelf is a local-first desktop app for building a personal content shelf from real files, folders, notes, media, and links on your own computer. It is meant to feel like an expanded bookmark manager for stable personal materials: lecture videos, novels, text archives, music folders, reference links, and long-lived study resources.

한국어 문서는 [README.ko.md](README.ko.md)를 참고하세요.

## Why This Exists

Most personal materials are scattered across Downloads, browser bookmarks, local folders, chat attachments, notes, and media players. MyPersonalShelf experiments with a simple idea: instead of forcing those materials into one file system structure, let the user collect references to them in a customizable desktop hub.

The app is intentionally local-first:

- It stores file paths and metadata before copying files.
- It opens local files through Tauri desktop APIs.
- It saves app state, reading progress, media position, dashboard layout, and settings locally.
- It starts with an empty shelf instead of fake sample folders, so the dashboard reflects the user's real materials.

## Current Product Shape

The app is organized around a few core pages:

- **Dashboard**: pinned cards, recent items, frequently opened items, and an empty-state start panel.
- **Library**: all saved files, links, folders, notes, and media with preview/detail editing.
- **Collections**: collection cards, collection editing, and a tag overview.
- **Customize**: visual personalization such as colors, reading comfort, and dashboard card layout.
- **Settings**: app behavior such as language, opening mode, search behavior, and data export.
- **Guide**: built-in usage guide explaining how the app is meant to be used.

## Main Features

### Content Registration

- Add local files with the Tauri file dialog.
- Add local folders with the Tauri folder dialog.
- Add web links manually.
- Add notes and text snippets manually.
- Upload files for browser-session previews.
- Store file paths and metadata without copying the original files into the app.
- Read a limited list of folder entries for saved folders.

### Dashboard

- Shows pinned/favorite content cards.
- Shows recent items and frequently opened items.
- Stores card order, size, and hidden/visible state.
- Supports standard, wide, and tall card sizes.
- Provides an empty-state panel when no content exists.
- Uses single click for selection and double click or `Ctrl+Enter` for opening.

### Library, Collections, And Tags

- Lists all content in one place.
- Filters by type: document, video, audio, image, link, or folder.
- Supports tags and collections.
- Lets users edit collection and tag values from the detail panel.
- Lets users click tags and collections to filter the library.
- Lets users rename collections and adjust collection color/icon.
- Provides a tag overview page.
- Sorts with recent activity as a first practical default.

### Viewers And Opening Behavior

- Reads `txt`, `md`, `markdown`, `log`, and other text-like documents through Tauri.
- Renders Markdown into readable HTML-like blocks instead of showing raw Markdown.
- Opens documents in a reading view.
- Opens video, audio, and images through Tauri asset URLs.
- Saves document reading progress.
- Saves video/audio resume position.
- Opens web links in the default browser.
- Opens folders in the system file explorer.
- Supports separate viewer windows or embedded in-app viewing depending on settings.

### Customization And Settings

- Customize background, surface, text, and accent colors.
- Adjust reader width, line height, and text size.
- Toggle compact dashboard cards.
- Edit dashboard card order, size, and visibility with a mini preview.
- Change language between English and Korean.
- Choose default viewer behavior: separate window or inside app.
- Configure search behavior, including whether main-tab navigation clears search.
- Configure whether search Enter selects or opens the first result.
- Export current app data as JSON.

### Search And Quick Actions

- Search by title, tag, collection, path, and summary.
- Focus search with `Ctrl+K`.
- Use command-style filters:
  - `tag:reading`
  - `type:video`
  - `collection:Media`
  - `open:novel`
  - `play:focus`
- Press Enter to select or open the first result depending on settings.
- Press `Ctrl+Enter` to open the selected item.

## Interaction Model

MyPersonalShelf follows a desktop-style interaction model:

- **Single click**: select an item and show its preview/detail panel.
- **Double click**: open the item.
- **Ctrl+Enter**: open the selected item.
- **Search Enter**: select or open the first result depending on settings.
- **Mouse side buttons**: navigate backward/forward through app history.

## Data And Storage

- Desktop app state is stored in SQLite through Tauri.
- Browser preview falls back to localStorage.
- Local files are not copied by default.
- Reader progress and media progress are saved separately and hydrated into app state.
- Dashboard layout, collection settings, language, theme, and app settings are persisted.
- Local backup folders created during development are ignored by Git through `backups/`.

## Tech Stack

- Desktop: Tauri
- Frontend: React + TypeScript
- Build: Vite
- Local data: SQLite with localStorage fallback
- Styling: plain CSS
- Icons: lucide-react
- File dialogs: Tauri + `rfd`
- Database: `rusqlite`

## Development

### Requirements

- Node.js
- Rust/Cargo
- Windows, macOS, or Linux environment supported by Tauri

### Commands

```bash
npm install
npm run dev
npm run tauri dev
npm run build
```

`npm run dev` runs the Vite browser preview. `npm run tauri dev` runs the full desktop app with native file/folder access.

## Project Notes

- The display name is isolated in `src/lib/appConfig.ts` so the project can be renamed later without immediately changing package internals.
- The initial shelf intentionally starts empty. The built-in guide replaces fake sample content.
- The current implementation favors practical local use over cloud sync or account-based workflows.

## Roadmap

Supported now:

- Drag-and-drop link/file capture.
- Clipboard URL quick add (`Ctrl+Shift+V`).
- Browser bookmark HTML/JSON import.
- Relink broken local paths.
- URL/path duplicate detection.
- Inbox-first quick capture.
- Library multi-select bulk organize.
- JSON backup merge/replace restore.

Near-term improvements:

- Better add-content form UX.
- Sorting UI for name, recently used, added date, and type.
- Home section visibility controls.
- Reading theme presets and document font selection.
- Web link preview cards with favicon and page title.
- YouTube/YouTube Music link handling.
- Command palette UI with autocomplete.

Longer-term ideas:

- EPUB/PDF support.
- Subtitle support for video.
- AI-assisted summary and tag suggestions.
- Plugin-style extension points.
