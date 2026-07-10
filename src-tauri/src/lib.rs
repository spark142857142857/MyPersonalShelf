use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, UNIX_EPOCH},
};
use tauri::Manager;
use url::Url;

const MAX_TEXT_BYTES: u64 = 25 * 1024 * 1024;
const MAX_FOLDER_ENTRIES: usize = 200;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeContentSelection {
    title: String,
    path: String,
    content_type: String,
    file_name: Option<String>,
    size_bytes: Option<u64>,
    modified_at: Option<String>,
    text_content: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFolderSelection {
    title: String,
    path: String,
    entries: Vec<FolderEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderEntry {
    name: String,
    path: String,
    entry_type: String,
    size_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReaderProgress {
    progress: f64,
    scroll_top: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaProgress {
    position: f64,
}

#[tauri::command]
fn load_app_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT value FROM app_state WHERE key = 'state'",
            [],
            |row| row.get::<_, String>(0),
        )
        .and_then(|state| hydrate_reader_progress(&connection, state))
        .and_then(|state| hydrate_media_progress(&connection, state))
        .inspect(|state| {
            allow_persisted_asset_paths(&app, state);
        })
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            error => Err(error.to_string()),
        })
}

#[tauri::command]
fn save_app_state(app: tauri::AppHandle, state: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO app_state (key, value, updated_at)
             VALUES ('state', ?1, strftime('%s', 'now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [&state],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_reader_progress(
    app: tauri::AppHandle,
    item_id: String,
) -> Result<Option<ReaderProgress>, String> {
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT progress, scroll_top FROM reader_progress WHERE item_id = ?1",
            [&item_id],
            |row| {
                Ok(ReaderProgress {
                    progress: row.get::<_, f64>(0)?,
                    scroll_top: row.get::<_, f64>(1)?,
                })
            },
        )
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            error => Err(error.to_string()),
        })
}

#[tauri::command]
fn save_reader_progress(
    app: tauri::AppHandle,
    item_id: String,
    progress: f64,
    scroll_top: f64,
    updated_at: i64,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    upsert_reader_progress(&connection, &item_id, progress, scroll_top, updated_at)
}

fn upsert_reader_progress(
    connection: &rusqlite::Connection,
    item_id: &str,
    progress: f64,
    scroll_top: f64,
    updated_at: i64,
) -> Result<(), String> {
    let clamped_progress = progress.clamp(0.0, 100.0);
    let clamped_scroll_top = scroll_top.max(0.0);
    connection
        .execute(
            "INSERT INTO reader_progress (item_id, progress, scroll_top, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(item_id) DO UPDATE SET progress = excluded.progress, scroll_top = excluded.scroll_top, updated_at = excluded.updated_at
             WHERE excluded.updated_at >= reader_progress.updated_at",
            (item_id, clamped_progress, clamped_scroll_top, updated_at.max(0)),
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_media_progress(
    app: tauri::AppHandle,
    item_id: String,
) -> Result<Option<MediaProgress>, String> {
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT position FROM media_progress WHERE item_id = ?1",
            [&item_id],
            |row| {
                Ok(MediaProgress {
                    position: row.get::<_, f64>(0)?,
                })
            },
        )
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            error => Err(error.to_string()),
        })
}

#[tauri::command]
fn save_media_progress(
    app: tauri::AppHandle,
    item_id: String,
    position: f64,
    updated_at: i64,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    upsert_media_progress(&connection, &item_id, position, updated_at)
}

fn upsert_media_progress(
    connection: &rusqlite::Connection,
    item_id: &str,
    position: f64,
    updated_at: i64,
) -> Result<(), String> {
    let clamped_position = position.max(0.0);
    connection
        .execute(
            "INSERT INTO media_progress (item_id, position, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(item_id) DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at
             WHERE excluded.updated_at >= media_progress.updated_at",
            (item_id, clamped_position, updated_at.max(0)),
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn select_file(app: tauri::AppHandle) -> Result<Option<NativeContentSelection>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter(
            "Supported content",
            &[
                "txt", "md", "markdown", "log", "csv", "mp4", "webm", "m4v", "mp3", "wav", "ogg",
                "m4a", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg",
            ],
        )
        .pick_file()
    else {
        return Ok(None);
    };

    let selection = file_selection_from_path(path.clone())?;
    app.asset_protocol_scope()
        .allow_file(path)
        .map_err(|error| error.to_string())?;
    Ok(Some(selection))
}

#[tauri::command]
fn select_folder() -> Result<Option<NativeFolderSelection>, String> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };

    let entries = folder_entries(&path)?;
    Ok(Some(NativeFolderSelection {
        title: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Selected folder")
            .to_string(),
        path: path.to_string_lossy().to_string(),
        entries,
    }))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    ensure_supported_text_file(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(format!(
            "Text file is too large for the current reader limit. Current limit is {} MB.",
            MAX_TEXT_BYTES / 1024 / 1024
        ));
    }

    read_text_file_contents(&path)
}

#[tauri::command]
fn list_folder(path: String) -> Result<Vec<FolderEntry>, String> {
    folder_entries(Path::new(&path))
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_dir() {
        return Err("Selected path is not a folder.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let url = normalize_external_url(&url)
        .ok_or_else(|| "Only valid http and https links can be opened.".to_string())?;

    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32")
            .arg("url.dll,FileProtocolHandler")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            load_reader_progress,
            save_reader_progress,
            load_media_progress,
            save_media_progress,
            select_file,
            select_folder,
            read_text_file,
            list_folder,
            open_folder,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyPersonalShelf");
}

fn open_database(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    let database_path = app_data_dir.join("mypersonalshelf.sqlite3");
    let connection =
        rusqlite::Connection::open(database_path).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS reader_progress (
                item_id TEXT PRIMARY KEY,
                progress REAL NOT NULL,
                scroll_top REAL NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;
    let _ = connection.execute(
        "ALTER TABLE reader_progress ADD COLUMN scroll_top REAL NOT NULL DEFAULT 0",
        [],
    );
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS media_progress (
                item_id TEXT PRIMARY KEY,
                position REAL NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn hydrate_reader_progress(
    connection: &rusqlite::Connection,
    state: String,
) -> Result<String, rusqlite::Error> {
    let Ok(mut value) = serde_json::from_str::<Value>(&state) else {
        return Ok(state);
    };

    let mut statement =
        connection.prepare("SELECT item_id, progress, scroll_top FROM reader_progress")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?,
            row.get::<_, f64>(2)?,
        ))
    })?;
    let mut progress_by_item = HashMap::new();
    for row in rows {
        let (item_id, progress, scroll_top) = row?;
        progress_by_item.insert(item_id, (progress, scroll_top));
    }

    if let Some(items) = value.get_mut("items").and_then(Value::as_array_mut) {
        for item in items {
            let Some(item_id) = item.get("id").and_then(Value::as_str) else {
                continue;
            };
            let Some((progress, scroll_top)) = progress_by_item.get(item_id) else {
                continue;
            };
            item["readerProgress"] = json!(progress);
            item["readerScrollTop"] = json!(scroll_top);
        }
    }

    Ok(serde_json::to_string(&value).unwrap_or(state))
}

fn hydrate_media_progress(
    connection: &rusqlite::Connection,
    state: String,
) -> Result<String, rusqlite::Error> {
    let Ok(mut value) = serde_json::from_str::<Value>(&state) else {
        return Ok(state);
    };

    let mut statement = connection.prepare("SELECT item_id, position FROM media_progress")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;
    let mut progress_by_item = HashMap::new();
    for row in rows {
        let (item_id, position) = row?;
        progress_by_item.insert(item_id, position);
    }

    if let Some(items) = value.get_mut("items").and_then(Value::as_array_mut) {
        for item in items {
            let Some(item_id) = item.get("id").and_then(Value::as_str) else {
                continue;
            };
            let Some(position) = progress_by_item.get(item_id) else {
                continue;
            };
            item["mediaPosition"] = json!(position);
        }
    }

    Ok(serde_json::to_string(&value).unwrap_or(state))
}

fn allow_persisted_asset_paths(app: &tauri::AppHandle, state: &str) {
    let Ok(value) = serde_json::from_str::<Value>(state) else {
        return;
    };
    let Some(items) = value.get("items").and_then(Value::as_array) else {
        return;
    };
    let scope = app.asset_protocol_scope();

    for item in items {
        let is_asset = matches!(
            item.get("type").and_then(Value::as_str),
            Some("video" | "audio" | "image")
        );
        let is_path = item.get("source").and_then(Value::as_str) == Some("path");
        if !is_asset || !is_path {
            continue;
        }
        if let Some(path) = item.get("location").and_then(Value::as_str) {
            let _ = scope.allow_file(path);
        }
    }
}

fn file_selection_from_path(path: PathBuf) -> Result<NativeContentSelection, String> {
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Selected path is not a regular file.".to_string());
    }
    if !is_supported_content_path(&path) {
        return Err("Selected file type is not supported.".to_string());
    }
    let content_type = content_type_for_path(&path).to_string();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string());
    let title = path
        .file_stem()
        .and_then(|name| name.to_str())
        .or(file_name.as_deref())
        .unwrap_or("Selected file")
        .to_string();
    let text_content = if is_supported_text_path(&path) && metadata.len() <= MAX_TEXT_BYTES {
        read_text_file_contents(&path).ok()
    } else {
        None
    };

    Ok(NativeContentSelection {
        title,
        path: path.to_string_lossy().to_string(),
        content_type,
        file_name,
        size_bytes: Some(metadata.len()),
        modified_at: metadata
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs().to_string()),
        text_content,
    })
}

fn folder_entries(path: &Path) -> Result<Vec<FolderEntry>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(path)
        .map_err(|error| error.to_string())?
        .take(MAX_FOLDER_ENTRIES)
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let metadata = entry.metadata().ok();
        entries.push(FolderEntry {
            name: entry.file_name().to_str().unwrap_or("Unnamed").to_string(),
            path: entry_path.to_string_lossy().to_string(),
            entry_type: if metadata.as_ref().is_some_and(|metadata| metadata.is_dir()) {
                "folder".to_string()
            } else {
                "file".to_string()
            },
            size_bytes: metadata
                .as_ref()
                .filter(|metadata| metadata.is_file())
                .map(|metadata| metadata.len()),
        });
    }

    entries.sort_by(|left, right| {
        left.entry_type
            .cmp(&right.entry_type)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

fn content_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "txt" | "md" | "markdown" | "log" | "csv" => "document",
        "mp4" | "webm" | "m4v" => "video",
        "mp3" | "wav" | "ogg" | "m4a" => "audio",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => "image",
        _ => "document",
    }
}

fn ensure_supported_text_file(path: &Path) -> Result<(), String> {
    if is_supported_text_path(path) {
        Ok(())
    } else {
        Err("Only txt, md, markdown, log, and csv files can be read as text.".to_string())
    }
}

fn is_supported_text_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str(),
        "txt" | "md" | "markdown" | "log" | "csv"
    )
}

fn is_supported_content_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str(),
        "txt"
            | "md"
            | "markdown"
            | "log"
            | "csv"
            | "mp4"
            | "webm"
            | "m4v"
            | "mp3"
            | "wav"
            | "ogg"
            | "m4a"
            | "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "bmp"
            | "svg"
    )
}

fn normalize_external_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.chars().any(char::is_control) {
        return None;
    }

    let parsed = Url::parse(trimmed).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return None;
    }

    Some(parsed.to_string())
}

fn read_text_file_contents(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    decode_text_bytes(bytes)
}

fn decode_text_bytes(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16(&units).map_err(|error| error.to_string());
    }

    if bytes.starts_with(&[0xFE, 0xFF]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16(&units).map_err(|error| error.to_string());
    }

    let utf8_bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
    if let Ok(text) = std::str::from_utf8(utf8_bytes) {
        return Ok(text.to_string());
    }

    let (decoded, _) = encoding_rs::EUC_KR.decode_without_bom_handling(&bytes);
    Ok(decoded.into_owned())
}

#[cfg(test)]
mod tests {
    use super::{
        decode_text_bytes, is_supported_content_path, is_supported_text_path,
        normalize_external_url, upsert_media_progress, upsert_reader_progress,
    };
    use rusqlite::Connection;
    use std::path::Path;

    #[test]
    fn accepts_supported_text_extensions_case_insensitively() {
        assert!(is_supported_text_path(Path::new("novel.TXT")));
        assert!(is_supported_text_path(Path::new("notes.md")));
        assert!(!is_supported_text_path(Path::new("archive.exe")));
        assert!(!is_supported_text_path(Path::new("manual.pdf")));
    }

    #[test]
    fn rejects_unknown_content_extensions() {
        assert!(is_supported_content_path(Path::new("movie.mp4")));
        assert!(is_supported_content_path(Path::new("movie.m4v")));
        assert!(is_supported_content_path(Path::new("cover.WEBP")));
        assert!(!is_supported_content_path(Path::new("movie.mov")));
        assert!(!is_supported_content_path(Path::new("movie.mkv")));
        assert!(!is_supported_content_path(Path::new("movie.avi")));
        assert!(!is_supported_content_path(Path::new("track.flac")));
        assert!(!is_supported_content_path(Path::new("installer.exe")));
        assert!(!is_supported_content_path(Path::new("document.pdf")));
    }

    #[test]
    fn accepts_only_http_urls_with_hosts() {
        assert_eq!(
            normalize_external_url("https://example.com/path").as_deref(),
            Some("https://example.com/path")
        );
        assert!(normalize_external_url("javascript:alert(1)").is_none());
        assert!(normalize_external_url("file:///C:/secret.txt").is_none());
        assert!(normalize_external_url("https://").is_none());
    }

    #[test]
    fn decodes_utf8_utf16_and_cp949_text() {
        assert_eq!(decode_text_bytes(b"hello".to_vec()).unwrap(), "hello");
        assert_eq!(
            decode_text_bytes(vec![0xFF, 0xFE, 0x48, 0x00, 0x69, 0x00]).unwrap(),
            "Hi"
        );
        assert_eq!(
            decode_text_bytes(vec![0xBE, 0xC8, 0xB3, 0xE7]).unwrap(),
            "안녕"
        );
    }

    #[test]
    fn stale_progress_writes_do_not_replace_newer_positions() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE reader_progress (
                    item_id TEXT PRIMARY KEY,
                    progress REAL NOT NULL,
                    scroll_top REAL NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE media_progress (
                    item_id TEXT PRIMARY KEY,
                    position REAL NOT NULL,
                    updated_at INTEGER NOT NULL
                );",
            )
            .unwrap();

        upsert_reader_progress(&connection, "reader", 70.0, 1400.0, 200).unwrap();
        upsert_reader_progress(&connection, "reader", 20.0, 300.0, 100).unwrap();
        let reader: (f64, f64) = connection
            .query_row(
                "SELECT progress, scroll_top FROM reader_progress WHERE item_id = 'reader'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(reader, (70.0, 1400.0));

        upsert_media_progress(&connection, "media", 80.0, 200).unwrap();
        upsert_media_progress(&connection, "media", 12.0, 100).unwrap();
        let position: f64 = connection
            .query_row(
                "SELECT position FROM media_progress WHERE item_id = 'media'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(position, 80.0);
    }
}
