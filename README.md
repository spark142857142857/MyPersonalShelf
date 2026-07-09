# MyPersonalShelf

MyPersonalShelf is a local-first desktop app for collecting stable personal content in one customizable place. It treats local files, folders, documents, videos, music, images, notes, and web links like an expanded bookmark shelf.

한국어 문서는 [README.ko.md](README.ko.md)를 참고하세요.

## Product Direction

- Focus on materials that do not change often: lecture files, novels, saved videos, music folders, reference links, and personal archives.
- Store paths and metadata first instead of copying files into the app.
- Make the dashboard feel like a personal shelf that can be arranged, colored, searched, and expanded over time.
- Keep the app useful for personal daily use first, then grow it through iterative improvements.

## Current Features

- Dashboard-first UI with pinned shelf cards, recent items, and frequently opened items.
- Add local files, local folders, web links, and manual notes.
- Organize content with types, tags, collections, colors, pinned state, and dashboard layout settings.
- Preview selected items in the library without leaving the main workspace.
- Open items with a desktop-style interaction model:
  - single click selects and previews an item.
  - double click opens the item.
  - `Ctrl+Enter` opens the selected item.
- Read `txt`, `md`, `markdown`, and other text-like documents in a reading view.
- Render Markdown documents in a readable format instead of showing raw Markdown text.
- Open documents, videos, audio, and images in a separate viewer window when configured.
- Play local `mp4`, `webm`, `mp3`, `wav`, `ogg`, `m4a`, and image files through Tauri asset URLs.
- Save document reading progress and media resume position.
- Open saved web links in the default browser.
- Open saved folders in the system file explorer.
- Customize language, background color, surface color, text color, accent color, reading width, line height, font size, and reader open mode.
- Search by text and command-style filters such as `tag:reading`, `type:video`, `collection:Media`, and `open:novel`.

## Data And Storage

- Desktop app state is stored in SQLite through Tauri.
- Browser preview falls back to localStorage.
- Local files are not copied into the app by default. The app stores paths and metadata first.
- Reader progress and media resume position are saved separately so they can be restored across sessions.

## Tech Stack

- Desktop: Tauri
- Frontend: React + TypeScript
- Build: Vite
- Local data: SQLite app-state store for desktop, localStorage fallback for browser preview
- Styling: plain CSS for the first scaffold
- Layout: responsive grid cards and dashboard activity panels

## Roadmap Ideas

- Web link preview cards with favicon and page title metadata.
- YouTube and YouTube Music link handling.
- Browser bookmark import.
- EPUB/PDF support.
- Subtitle support for video.
- AI-assisted summary and tag suggestions.
- Backup/export and restore flow.
- Plugin-style extension points.

## Development Notes

Rust/Cargo is required to run the full Tauri desktop shell.

```bash
npm install
npm run dev
npm run tauri dev
```

The display name is isolated in `src/lib/appConfig.ts` so the project can be renamed later without changing the internal package name immediately.
