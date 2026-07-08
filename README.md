# MyPersonalShelf

MyPersonalShelf is a local-first desktop app concept for collecting stable personal content in one customizable place. It treats local files, folders, documents, videos, music, and web links like an expanded bookmark shelf.

## Product Direction

- Focus on materials that do not change often: lecture files, novels, saved videos, music folders, reference links, and personal archives.
- Store paths and metadata first instead of copying files into the app.
- Make the dashboard feel like a personal shelf that can be arranged, colored, and expanded over time.

## MVP Scope

- Dashboard-first UI with card-style favorites.
- Register local files, folders, and links.
- Organize content with tags and collections.
- Provide reading mode for documents and novels.
- Provide basic video and audio playback.
- Support customization such as background color, card color, layout, and reading preferences.

## Current Implementation

- English is the default UI language, with Korean selectable in the top bar and customize screen.
- Tauri desktop builds can select local files and folders, read text-like files, and list folder entries.
- App state is stored in SQLite through Tauri and falls back to localStorage in browser preview.
- Dashboard cards support saved order, size cycling, hide/show, pinned items, and recent activity.
- Reader/media state tracks document progress and media resume position.
- Search supports plain text plus command-style filters such as `tag:reading`, `type:video`, `collection:Media`, and `open:novel`.

## Tech Stack

- Desktop: Tauri
- Frontend: React + TypeScript
- Build: Vite
- Local data: SQLite app-state store for desktop, localStorage fallback for browser preview
- Styling: plain CSS for the first scaffold
- Layout: responsive grid cards, with draggable layout planned after the initial data model is stable

## Development Notes

The current scaffold defines the first product shape and Tauri-ready project structure. Rust/Cargo is required to run the full Tauri desktop shell.

```bash
npm install
npm run dev
npm run tauri dev
```

The display name is isolated in `src/lib/appConfig.ts` so the project can be renamed later without changing the internal package name immediately.
