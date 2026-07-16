use http_range::HttpRange;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::{
    fs,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use url::Url;

const MAX_TEXT_BYTES: u64 = 25 * 1024 * 1024;
const MAX_FOLDER_ENTRIES: usize = 200;
const MAX_PROGRESS_FUTURE_SKEW: Duration = Duration::from_secs(5 * 60);
const MAX_FULL_ASSET_BYTES: u64 = 32 * 1024 * 1024;
const MAX_RANGE_BYTES: u64 = 1000 * 1024;

#[derive(Default)]
struct AllowedPaths(Mutex<PathRegistry>);

#[derive(Default)]
struct PathRegistry {
    paths: HashMap<String, RegisteredPath>,
    revoked_items: HashSet<String>,
}

#[derive(Clone)]
struct RegisteredPath {
    path: PathBuf,
    is_asset: bool,
}

fn ensure_main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("This command is only available from the main window.".to_string())
    }
}

fn encode_item_id(item_id: &str) -> String {
    item_id
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn decode_item_id(encoded: &str) -> Result<String, String> {
    let encoded = encoded.as_bytes();
    if encoded.is_empty()
        || !encoded.len().is_multiple_of(2)
        || !encoded.iter().all(u8::is_ascii_hexdigit)
    {
        return Err("Invalid item ID.".to_string());
    }
    let hex_value = |byte: u8| match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        b'A'..=b'F' => byte - b'A' + 10,
        _ => unreachable!("hex input was validated"),
    };
    let bytes = encoded
        .chunks_exact(2)
        .map(|pair| (hex_value(pair[0]) << 4) | hex_value(pair[1]))
        .collect::<Vec<_>>();
    String::from_utf8(bytes).map_err(|_| "Invalid item ID.".to_string())
}

fn reader_window_label(item_id: &str) -> String {
    format!("reader-{}", encode_item_id(item_id))
}

fn ensure_item_window_access(window: &tauri::WebviewWindow, item_id: &str) -> Result<(), String> {
    if window.label() == "main" || window.label() == reader_window_label(item_id) {
        Ok(())
    } else {
        Err("This reader window cannot access the requested item.".to_string())
    }
}

fn filter_state_for_window(window: &tauri::WebviewWindow, state: String) -> Result<String, String> {
    if window.label() == "main" {
        return Ok(state);
    }
    filter_state_for_reader_label(window.label(), state)
}

fn filter_state_for_reader_label(label: &str, state: String) -> Result<String, String> {
    if !label.starts_with("reader-") {
        return Err("This window cannot load shelf data.".to_string());
    }

    let mut value = serde_json::from_str::<Value>(&state).map_err(|error| error.to_string())?;
    let items = value
        .get_mut("items")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Saved shelf data does not contain items.".to_string())?;
    items.retain(|item| {
        item.get("id")
            .and_then(Value::as_str)
            .is_some_and(|item_id| reader_window_label(item_id) == label)
    });
    let allowed_item_id = items
        .first()
        .and_then(|item| item.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    if let Some(layouts) = value
        .get_mut("dashboardLayouts")
        .and_then(Value::as_array_mut)
    {
        layouts.retain(|layout| {
            layout.get("itemId").and_then(Value::as_str) == allowed_item_id.as_deref()
        });
    }
    serde_json::to_string(&value).map_err(|error| error.to_string())
}

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
fn load_app_state(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let connection = open_database(&app)?;
    let state = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = 'state'",
            [],
            |row| row.get::<_, String>(0),
        )
        .and_then(|state| hydrate_reader_progress(&connection, state))
        .and_then(|state| hydrate_media_progress(&connection, state))
        .and_then(|state| hydrate_text_preferences(&connection, state))
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            error => Err(error.to_string()),
        })?;

    state
        .map(|state| filter_state_for_window(&window, state))
        .transpose()
}

#[tauri::command]
fn save_app_state(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: String,
) -> Result<(), String> {
    ensure_main_window(&window)?;
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
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    item_id: String,
) -> Result<Option<ReaderProgress>, String> {
    let connection = open_database(&app)?;
    ensure_item_window_access(&window, &item_id)?;
    ensure_item_type(&connection, &item_id, &["document"])?;
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
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    item_id: String,
    progress: f64,
    scroll_top: f64,
    updated_at: i64,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    ensure_item_window_access(&window, &item_id)?;
    ensure_item_type(&connection, &item_id, &["document"])?;
    validate_progress_timestamp(updated_at)?;
    upsert_reader_progress(&connection, &item_id, progress, scroll_top, updated_at)
}

fn upsert_reader_progress(
    connection: &rusqlite::Connection,
    item_id: &str,
    progress: f64,
    scroll_top: f64,
    updated_at: i64,
) -> Result<(), String> {
    if !progress.is_finite() || !scroll_top.is_finite() {
        return Err("Reader progress must contain finite numbers.".to_string());
    }
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
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    item_id: String,
) -> Result<Option<MediaProgress>, String> {
    let connection = open_database(&app)?;
    ensure_item_window_access(&window, &item_id)?;
    ensure_item_type(&connection, &item_id, &["video", "audio"])?;
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
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    item_id: String,
    position: f64,
    updated_at: i64,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    ensure_item_window_access(&window, &item_id)?;
    ensure_item_type(&connection, &item_id, &["video", "audio"])?;
    validate_progress_timestamp(updated_at)?;
    upsert_media_progress(&connection, &item_id, position, updated_at)
}

#[tauri::command]
fn save_text_encoding(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    item_id: String,
    encoding: String,
) -> Result<(), String> {
    let encoding = validate_text_encoding(&encoding)?;
    let connection = open_database(&app)?;
    ensure_item_window_access(&window, &item_id)?;
    ensure_document_item_exists(&connection, &item_id)?;
    connection
        .execute(
            "INSERT INTO text_preferences (item_id, encoding, updated_at)
             VALUES (?1, ?2, strftime('%s', 'now'))
             ON CONFLICT(item_id) DO UPDATE SET encoding = excluded.encoding, updated_at = excluded.updated_at",
            (&item_id, encoding),
        )
        .map_err(|error| error.to_string())?;
    app.emit_to(
        "main",
        "text-encoding-changed",
        TextEncodingChanged {
            item_id,
            encoding: encoding.to_string(),
        },
    )
    .map_err(|error| error.to_string())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TextEncodingChanged {
    item_id: String,
    encoding: String,
}

fn upsert_media_progress(
    connection: &rusqlite::Connection,
    item_id: &str,
    position: f64,
    updated_at: i64,
) -> Result<(), String> {
    if !position.is_finite() {
        return Err("Media progress must contain a finite position.".to_string());
    }
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
fn select_file(window: tauri::WebviewWindow) -> Result<Option<NativeContentSelection>, String> {
    ensure_main_window(&window)?;
    let Some(path) = rfd::FileDialog::new()
        .add_filter(
            "Supported content",
            &[
                "txt", "md", "markdown", "log", "csv", "pdf", "doc", "docx", "odt", "rtf", "xls",
                "xlsx", "ods", "ppt", "pptx", "odp", "epub", "hwp", "hwpx", "mp4", "webm", "m4v",
                "mp3", "wav", "ogg", "m4a", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg",
            ],
        )
        .pick_file()
    else {
        return Ok(None);
    };

    let selection = file_selection_from_path(path)?;
    Ok(Some(selection))
}

#[tauri::command]
fn select_folder(window: tauri::WebviewWindow) -> Result<Option<NativeFolderSelection>, String> {
    ensure_main_window(&window)?;
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
fn register_content_path(
    window: tauri::WebviewWindow,
    allowed_paths: tauri::State<'_, AllowedPaths>,
    path: String,
    content_type: String,
    item_id: String,
) -> Result<String, String> {
    ensure_main_window(&window)?;
    register_path(&allowed_paths, Path::new(&path), &content_type, &item_id)
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn unregister_content_paths(
    window: tauri::WebviewWindow,
    allowed_paths: tauri::State<'_, AllowedPaths>,
    item_ids: Vec<String>,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    for item_id in item_ids {
        if item_id.is_empty() {
            continue;
        }
        unregister_path(&allowed_paths, &item_id)?;
    }
    Ok(())
}

#[tauri::command]
fn delete_content_item(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    allowed_paths: tauri::State<'_, AllowedPaths>,
    item_id: String,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    if app
        .get_webview_window(&reader_window_label(&item_id))
        .is_some()
    {
        return Err("Close the viewer before deleting this item.".to_string());
    }

    let mut connection = open_database(&app)?;
    delete_item_data(&mut connection, &item_id)?;
    unregister_path(&allowed_paths, &item_id)
}

#[tauri::command]
fn read_text_file(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    allowed_paths: tauri::State<'_, AllowedPaths>,
    path: String,
    encoding: Option<String>,
    item_id: String,
) -> Result<String, String> {
    ensure_item_window_access(&window, &item_id)?;
    if window.label() != "main" {
        let connection = open_database(&app)?;
        ensure_document_item_path(&connection, &item_id, Path::new(&path))?;
    }
    let path = require_allowed_path(&allowed_paths, &item_id, Path::new(&path))?;
    ensure_supported_text_file(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(format!(
            "Text file is too large for the current reader limit. Current limit is {} MB.",
            MAX_TEXT_BYTES / 1024 / 1024
        ));
    }

    read_text_file_contents_with_encoding(&path, encoding.as_deref())
}

#[tauri::command]
fn list_folder(
    window: tauri::WebviewWindow,
    allowed_paths: tauri::State<'_, AllowedPaths>,
    path: String,
    item_id: String,
) -> Result<Vec<FolderEntry>, String> {
    ensure_main_window(&window)?;
    let path = require_allowed_path(&allowed_paths, &item_id, Path::new(&path))?;
    folder_entries(&path)
}

#[tauri::command]
fn open_folder(
    window: tauri::WebviewWindow,
    allowed_paths: tauri::State<'_, AllowedPaths>,
    path: String,
    item_id: String,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    let path = require_allowed_path(&allowed_paths, &item_id, Path::new(&path))?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_dir() {
        return Err("Selected path is not a folder.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let path = path_without_verbatim_prefix(&path);
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
fn open_path(
    window: tauri::WebviewWindow,
    allowed_paths: tauri::State<'_, AllowedPaths>,
    path: String,
    item_id: String,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    let path = require_allowed_path(&allowed_paths, &item_id, Path::new(&path))?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Selected path is not a file.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let path = path_without_verbatim_prefix(&path);
        Command::new("rundll32")
            .arg("url.dll,FileProtocolHandler")
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

#[tauri::command]
fn request_current_window_close(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
fn destroy_current_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|error| error.to_string())
}

#[tauri::command]
fn is_reader_window_open(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    item_id: String,
) -> Result<bool, String> {
    ensure_main_window(&window)?;
    Ok(app
        .get_webview_window(&reader_window_label(&item_id))
        .is_some())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AllowedPaths::default())
        .register_uri_scheme_protocol("shelf-content", |context, request| {
            let allowed_paths = context.app_handle().state::<AllowedPaths>();
            serve_registered_asset(context.webview_label(), request, &allowed_paths)
        })
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            load_reader_progress,
            save_reader_progress,
            load_media_progress,
            save_media_progress,
            save_text_encoding,
            select_file,
            select_folder,
            register_content_path,
            unregister_content_paths,
            delete_content_item,
            read_text_file,
            list_folder,
            open_folder,
            open_path,
            open_url,
            request_current_window_close,
            destroy_current_window,
            is_reader_window_open
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
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS text_preferences (
                item_id TEXT PRIMARY KEY,
                encoding TEXT NOT NULL,
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

fn hydrate_text_preferences(
    connection: &rusqlite::Connection,
    state: String,
) -> Result<String, rusqlite::Error> {
    let Ok(mut value) = serde_json::from_str::<Value>(&state) else {
        return Ok(state);
    };

    let mut statement = connection.prepare("SELECT item_id, encoding FROM text_preferences")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut encoding_by_item = HashMap::new();
    for row in rows {
        let (item_id, encoding) = row?;
        if validate_text_encoding(&encoding).is_ok() {
            encoding_by_item.insert(item_id, encoding);
        }
    }

    if let Some(items) = value.get_mut("items").and_then(Value::as_array_mut) {
        for item in items {
            let Some(item_id) = item.get("id").and_then(Value::as_str) else {
                continue;
            };
            let Some(encoding) = encoding_by_item.get(item_id) else {
                continue;
            };
            item["textEncoding"] = json!(encoding);
        }
    }

    Ok(serde_json::to_string(&value).unwrap_or(state))
}

fn stored_item(connection: &rusqlite::Connection, item_id: &str) -> Result<Value, String> {
    let state = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = 'state'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| error.to_string())?;
    let value = serde_json::from_str::<Value>(&state).map_err(|error| error.to_string())?;
    value
        .get("items")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("id").and_then(Value::as_str) == Some(item_id))
        })
        .cloned()
        .ok_or_else(|| "The requested item is not in the saved shelf.".to_string())
}

fn ensure_item_type(
    connection: &rusqlite::Connection,
    item_id: &str,
    allowed_types: &[&str],
) -> Result<(), String> {
    let item = stored_item(connection, item_id)?;
    let item_type = item
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| "The saved item has no content type.".to_string())?;
    if allowed_types.contains(&item_type) {
        Ok(())
    } else {
        Err("The requested progress type does not match the saved item.".to_string())
    }
}

fn validate_progress_timestamp(updated_at: i64) -> Result<(), String> {
    if updated_at < 0 {
        return Err("Progress timestamp cannot be negative.".to_string());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    let maximum = now
        .checked_add(MAX_PROGRESS_FUTURE_SKEW)
        .ok_or_else(|| "Progress timestamp range overflowed.".to_string())?
        .as_millis();
    if updated_at as u128 > maximum {
        Err("Progress timestamp is too far in the future.".to_string())
    } else {
        Ok(())
    }
}

fn ensure_document_item_exists(
    connection: &rusqlite::Connection,
    item_id: &str,
) -> Result<(), String> {
    let item = stored_item(connection, item_id)?;
    if item.get("type").and_then(Value::as_str) == Some("document")
        && item.get("source").and_then(Value::as_str) == Some("path")
    {
        Ok(())
    } else {
        Err("Text encoding can only be saved for local documents.".to_string())
    }
}

fn ensure_document_item_path(
    connection: &rusqlite::Connection,
    item_id: &str,
    requested_path: &Path,
) -> Result<(), String> {
    let item = stored_item(connection, item_id)?;
    if item.get("type").and_then(Value::as_str) != Some("document")
        || item.get("source").and_then(Value::as_str) != Some("path")
    {
        return Err("The requested item is not a local document.".to_string());
    }

    let saved_path = item
        .get("location")
        .and_then(Value::as_str)
        .ok_or_else(|| "The saved document has no local path.".to_string())?;
    let saved_canonical = fs::canonicalize(saved_path).map_err(|error| error.to_string())?;
    let requested_canonical =
        fs::canonicalize(requested_path).map_err(|error| error.to_string())?;
    if saved_canonical == requested_canonical {
        Ok(())
    } else {
        Err("This reader window cannot read the requested path.".to_string())
    }
}

fn register_path(
    allowed_paths: &AllowedPaths,
    path: &Path,
    content_type: &str,
    item_id: &str,
) -> Result<PathBuf, String> {
    if item_id.is_empty() {
        return Err("A content item ID is required to register a path.".to_string());
    }
    let canonical = fs::canonicalize(path).map_err(|error| error.to_string())?;
    let usable_path = path_without_verbatim_prefix(&canonical);
    let metadata = fs::metadata(&canonical).map_err(|error| error.to_string())?;

    match content_type {
        "folder" if metadata.is_dir() => {}
        "document" | "video" | "audio" | "image" if metadata.is_file() => {
            if !is_supported_content_path(&canonical)
                || content_type_for_path(&canonical) != content_type
            {
                return Err("Content type does not match the selected file extension.".to_string());
            }
        }
        "folder" => return Err("Selected path is not a folder.".to_string()),
        "document" | "video" | "audio" | "image" => {
            return Err("Selected path is not a regular file.".to_string());
        }
        _ => return Err("Unsupported path content type.".to_string()),
    }

    let is_asset = matches!(content_type, "video" | "audio" | "image");
    let mut registry = allowed_paths
        .0
        .lock()
        .map_err(|_| "Allowed path registry is unavailable.".to_string())?;
    // Explicit re-registration (restore, relink, reopen) is allowed to revive an ID
    // that was revoked earlier in this process lifetime.
    registry.revoked_items.remove(item_id);

    registry.paths.insert(
        item_id.to_string(),
        RegisteredPath {
            path: canonical.clone(),
            is_asset,
        },
    );

    Ok(usable_path)
}

fn unregister_path(allowed_paths: &AllowedPaths, item_id: &str) -> Result<(), String> {
    let mut registry = allowed_paths
        .0
        .lock()
        .map_err(|_| "Allowed path registry is unavailable.".to_string())?;
    registry.paths.remove(item_id);
    registry.revoked_items.insert(item_id.to_string());
    Ok(())
}

fn delete_item_data(connection: &mut rusqlite::Connection, item_id: &str) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let state = transaction
        .query_row(
            "SELECT value FROM app_state WHERE key = 'state'",
            [],
            |row| row.get::<_, String>(0),
        )
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(String::new()),
            error => Err(error),
        })
        .map_err(|error| error.to_string())?;

    if !state.is_empty() {
        let mut value = serde_json::from_str::<Value>(&state).map_err(|error| error.to_string())?;
        let items = value
            .get_mut("items")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| "Saved shelf data does not contain items.".to_string())?;
        items.retain(|item| item.get("id").and_then(Value::as_str) != Some(item_id));
        if let Some(layouts) = value
            .get_mut("dashboardLayouts")
            .and_then(Value::as_array_mut)
        {
            layouts.retain(|layout| layout.get("itemId").and_then(Value::as_str) != Some(item_id));
        }
        transaction
            .execute(
                "UPDATE app_state SET value = ?1, updated_at = strftime('%s', 'now') WHERE key = 'state'",
                [serde_json::to_string(&value).map_err(|error| error.to_string())?],
            )
            .map_err(|error| error.to_string())?;
    }

    for table in ["reader_progress", "media_progress", "text_preferences"] {
        transaction
            .execute(
                &format!("DELETE FROM {table} WHERE item_id = ?1"),
                [item_id],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

fn resolve_asset_path(
    registry: &PathRegistry,
    webview_label: &str,
    item_id: &str,
) -> Result<PathBuf, tauri::http::StatusCode> {
    if webview_label != "main" && webview_label != reader_window_label(item_id) {
        return Err(tauri::http::StatusCode::FORBIDDEN);
    }
    registry
        .paths
        .get(item_id)
        .filter(|registered| registered.is_asset)
        .map(|registered| registered.path.clone())
        .ok_or(tauri::http::StatusCode::NOT_FOUND)
}

fn protocol_response(
    status: tauri::http::StatusCode,
    message: &str,
) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .expect("static protocol response must be valid")
}

fn serve_registered_asset(
    webview_label: &str,
    request: tauri::http::Request<Vec<u8>>,
    allowed_paths: &AllowedPaths,
) -> tauri::http::Response<Vec<u8>> {
    if request.method() != tauri::http::Method::GET && request.method() != tauri::http::Method::HEAD
    {
        return protocol_response(
            tauri::http::StatusCode::METHOD_NOT_ALLOWED,
            "Method not allowed",
        );
    }
    let encoded_item_id =
        percent_encoding::percent_decode_str(request.uri().path().trim_start_matches('/'))
            .decode_utf8_lossy()
            .into_owned();
    let item_id = match decode_item_id(&encoded_item_id) {
        Ok(item_id) => item_id,
        Err(_) => {
            return protocol_response(tauri::http::StatusCode::BAD_REQUEST, "Invalid item ID")
        }
    };
    let path = {
        let registry = match allowed_paths.0.lock() {
            Ok(registry) => registry,
            Err(_) => {
                return protocol_response(
                    tauri::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "Path registry unavailable",
                )
            }
        };
        match resolve_asset_path(&registry, webview_label, &item_id) {
            Ok(path) => path,
            Err(status) => return protocol_response(status, "Asset unavailable"),
        }
    };

    let mut file = match File::open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return protocol_response(tauri::http::StatusCode::NOT_FOUND, "Asset not found")
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return protocol_response(tauri::http::StatusCode::FORBIDDEN, "Asset access denied")
        }
        Err(_) => {
            return protocol_response(
                tauri::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Asset could not be opened",
            )
        }
    };
    let length = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => {
            return protocol_response(
                tauri::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Asset metadata unavailable",
            )
        }
    };
    let mime = mime_guess::from_path(&path).first_or_octet_stream();
    let response = tauri::http::Response::builder()
        .header("Access-Control-Allow-Origin", "*")
        .header("Accept-Ranges", "bytes")
        .header("Content-Type", mime.as_ref());

    if request.method() == tauri::http::Method::HEAD {
        return response
            .header("Content-Length", length)
            .body(Vec::new())
            .expect("asset HEAD response must be valid");
    }

    if let Some(range_header) = request
        .headers()
        .get("range")
        .and_then(|value| value.to_str().ok())
    {
        let ranges = match HttpRange::parse(range_header, length) {
            Ok(ranges) if ranges.len() == 1 => ranges,
            _ => {
                return tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::RANGE_NOT_SATISFIABLE)
                    .header("Content-Range", format!("bytes */{length}"))
                    .body(Vec::new())
                    .expect("range error response must be valid")
            }
        };
        let range = &ranges[0];
        let bytes_to_read = range
            .length
            .min(MAX_RANGE_BYTES)
            .min(length.saturating_sub(range.start));
        if bytes_to_read == 0 || file.seek(SeekFrom::Start(range.start)).is_err() {
            return protocol_response(
                tauri::http::StatusCode::RANGE_NOT_SATISFIABLE,
                "Invalid range",
            );
        }
        let mut body = Vec::with_capacity(bytes_to_read as usize);
        if file.take(bytes_to_read).read_to_end(&mut body).is_err() {
            return protocol_response(
                tauri::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Asset read failed",
            );
        }
        let end = range.start + body.len() as u64 - 1;
        return response
            .status(tauri::http::StatusCode::PARTIAL_CONTENT)
            .header(
                "Content-Range",
                format!("bytes {}-{end}/{length}", range.start),
            )
            .header("Content-Length", body.len())
            .body(body)
            .expect("partial asset response must be valid");
    }

    if length > MAX_FULL_ASSET_BYTES {
        return protocol_response(
            tauri::http::StatusCode::PAYLOAD_TOO_LARGE,
            "Large assets require a range request",
        );
    }

    let mut body = Vec::with_capacity((length + 1) as usize);
    if file
        .take(MAX_FULL_ASSET_BYTES + 1)
        .read_to_end(&mut body)
        .is_err()
    {
        return protocol_response(
            tauri::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Asset read failed",
        );
    }
    if body.len() as u64 > MAX_FULL_ASSET_BYTES {
        return protocol_response(
            tauri::http::StatusCode::PAYLOAD_TOO_LARGE,
            "Large assets require a range request",
        );
    }
    response
        .header("Content-Length", body.len())
        .body(body)
        .expect("asset response must be valid")
}

fn require_allowed_path(
    allowed_paths: &AllowedPaths,
    item_id: &str,
    path: &Path,
) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path).map_err(|error| error.to_string())?;
    let is_allowed = allowed_paths
        .0
        .lock()
        .map_err(|_| "Allowed path registry is unavailable.".to_string())?
        .paths
        .get(item_id)
        .is_some_and(|registered| registered.path == canonical);
    if !is_allowed {
        return Err("Path has not been selected or registered by the user.".to_string());
    }
    Ok(canonical)
}

#[cfg(test)]
fn canonical_usable_path(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path)
        .map(|path| path_without_verbatim_prefix(&path))
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn path_without_verbatim_prefix(path: &Path) -> PathBuf {
    use std::ffi::OsString;
    use std::os::windows::ffi::{OsStrExt, OsStringExt};

    const VERBATIM_PREFIX: &[u16] = &[b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16];
    const VERBATIM_UNC_PREFIX: &[u16] = &[
        b'\\' as u16,
        b'\\' as u16,
        b'?' as u16,
        b'\\' as u16,
        b'U' as u16,
        b'N' as u16,
        b'C' as u16,
        b'\\' as u16,
    ];

    let wide = path.as_os_str().encode_wide().collect::<Vec<_>>();
    if let Some(rest) = wide.strip_prefix(VERBATIM_UNC_PREFIX) {
        let mut normalized = vec![b'\\' as u16, b'\\' as u16];
        normalized.extend_from_slice(rest);
        PathBuf::from(OsString::from_wide(&normalized))
    } else if let Some(rest) = wide.strip_prefix(VERBATIM_PREFIX) {
        PathBuf::from(OsString::from_wide(rest))
    } else {
        path.to_path_buf()
    }
}

#[cfg(not(target_os = "windows"))]
fn path_without_verbatim_prefix(path: &Path) -> PathBuf {
    path.to_path_buf()
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
        "txt"
        | "md"
        | "markdown"
        | "log"
        | "csv"
        | "pdf"
        | "doc"
        | "docx"
        | "odt"
        | "rtf"
        | "xls"
        | "xlsx"
        | "ods"
        | "ppt"
        | "pptx"
        | "odp"
        | "epub"
        | "hwp"
        | "hwpx" => "document",
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
            | "pdf"
            | "doc"
            | "docx"
            | "odt"
            | "rtf"
            | "xls"
            | "xlsx"
            | "ods"
            | "ppt"
            | "pptx"
            | "odp"
            | "epub"
            | "hwp"
            | "hwpx"
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
    read_text_file_contents_with_encoding(path, None)
}

fn read_text_file_contents_with_encoding(
    path: &Path,
    encoding: Option<&str>,
) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    decode_text_bytes_with_encoding(bytes, encoding)
}

fn validate_text_encoding(encoding: &str) -> Result<&str, String> {
    match encoding {
        "auto" | "utf-8" | "cp949" | "utf-16le" | "utf-16be" => Ok(encoding),
        _ => Err("Unsupported text encoding.".to_string()),
    }
}

fn decode_text_bytes_with_encoding(
    bytes: Vec<u8>,
    encoding: Option<&str>,
) -> Result<String, String> {
    match validate_text_encoding(encoding.unwrap_or("auto"))? {
        "auto" => decode_text_bytes(bytes),
        "utf-8" => {
            let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
            String::from_utf8(bytes.to_vec()).map_err(|error| error.to_string())
        }
        "cp949" => {
            let (decoded, _) = encoding_rs::EUC_KR.decode_without_bom_handling(&bytes);
            Ok(decoded.into_owned())
        }
        "utf-16le" => decode_forced_utf16(&bytes, true),
        "utf-16be" => decode_forced_utf16(&bytes, false),
        _ => unreachable!(),
    }
}

fn decode_forced_utf16(bytes: &[u8], little_endian: bool) -> Result<String, String> {
    let bytes = if little_endian {
        bytes.strip_prefix(&[0xFF, 0xFE]).unwrap_or(bytes)
    } else {
        bytes.strip_prefix(&[0xFE, 0xFF]).unwrap_or(bytes)
    };
    if !bytes.len().is_multiple_of(2) {
        return Err("UTF-16 text contains an incomplete code unit.".to_string());
    }

    let units = bytes
        .chunks_exact(2)
        .map(|chunk| {
            if little_endian {
                u16::from_le_bytes([chunk[0], chunk[1]])
            } else {
                u16::from_be_bytes([chunk[0], chunk[1]])
            }
        })
        .collect::<Vec<_>>();
    String::from_utf16(&units).map_err(|error| error.to_string())
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

    if let Some(little_endian) = detect_bomless_utf16(&bytes) {
        let units = bytes
            .chunks_exact(2)
            .map(|chunk| {
                if little_endian {
                    u16::from_le_bytes([chunk[0], chunk[1]])
                } else {
                    u16::from_be_bytes([chunk[0], chunk[1]])
                }
            })
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

fn detect_bomless_utf16(bytes: &[u8]) -> Option<bool> {
    if bytes.len() < 4 || !bytes.len().is_multiple_of(2) {
        return None;
    }

    let pairs = bytes.len() / 2;
    let even_nuls = bytes.iter().step_by(2).filter(|byte| **byte == 0).count();
    let odd_nuls = bytes
        .iter()
        .skip(1)
        .step_by(2)
        .filter(|byte| **byte == 0)
        .count();
    let dominant_threshold = pairs.div_ceil(2);
    let minority_limit = pairs / 10;

    if odd_nuls >= dominant_threshold && even_nuls <= minority_limit {
        Some(true)
    } else if even_nuls >= dominant_threshold && odd_nuls <= minority_limit {
        Some(false)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::path_without_verbatim_prefix;
    use super::{
        canonical_usable_path, decode_item_id, decode_text_bytes, decode_text_bytes_with_encoding,
        delete_item_data, encode_item_id, filter_state_for_reader_label, is_supported_content_path,
        is_supported_text_path, normalize_external_url, reader_window_label, register_path,
        require_allowed_path, resolve_asset_path, unregister_path, upsert_media_progress,
        upsert_reader_progress, validate_progress_timestamp, AllowedPaths, PathRegistry,
        RegisteredPath,
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
    fn canonicalizes_relative_paths_to_usable_absolute_paths() {
        let canonical = canonical_usable_path(Path::new(".")).unwrap();
        assert!(canonical.is_absolute());
        assert_eq!(
            canonical,
            path_without_verbatim_prefix(&std::fs::canonicalize(".").unwrap())
        );
    }

    #[test]
    fn register_path_can_revive_a_revoked_item_id() {
        let path = std::env::temp_dir().join(format!(
            "mypersonalshelf-revive-{}.txt",
            std::process::id()
        ));
        std::fs::write(&path, "revive test").unwrap();
        let allowed = AllowedPaths::default();

        let registered = register_path(&allowed, &path, "document", "item-1").unwrap();
        assert!(registered.exists() || !registered.as_os_str().is_empty());
        unregister_path(&allowed, "item-1").unwrap();
        assert!(allowed.0.lock().unwrap().revoked_items.contains("item-1"));

        let revived = register_path(&allowed, &path, "document", "item-1");
        assert!(revived.is_ok());
        assert!(!allowed.0.lock().unwrap().revoked_items.contains("item-1"));
        assert!(allowed.0.lock().unwrap().paths.contains_key("item-1"));

        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn unregister_content_paths_removes_stale_registry_entries() {
        let path = std::env::temp_dir().join(format!(
            "mypersonalshelf-unregister-{}.txt",
            std::process::id()
        ));
        std::fs::write(&path, "unregister test").unwrap();
        let allowed = AllowedPaths::default();
        register_path(&allowed, &path, "document", "keep").unwrap();
        register_path(&allowed, &path, "document", "drop").unwrap();

        unregister_path(&allowed, "drop").unwrap();
        assert!(!allowed.0.lock().unwrap().paths.contains_key("drop"));
        assert!(allowed.0.lock().unwrap().paths.contains_key("keep"));
        assert!(allowed.0.lock().unwrap().revoked_items.contains("drop"));

        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn registered_paths_are_scoped_to_their_item_id() {
        let path = std::env::temp_dir().join(format!(
            "mypersonalshelf-path-scope-{}.txt",
            std::process::id()
        ));
        std::fs::write(&path, "scope test").unwrap();
        let canonical = std::fs::canonicalize(&path).unwrap();
        let allowed = AllowedPaths::default();
        allowed.0.lock().unwrap().paths.insert(
            "owner".to_string(),
            RegisteredPath {
                path: canonical,
                is_asset: false,
            },
        );

        assert!(require_allowed_path(&allowed, "owner", &path).is_ok());
        assert!(require_allowed_path(&allowed, "other", &path).is_err());
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn reader_state_contains_only_its_requested_item() {
        let state = serde_json::json!({
            "items": [
                { "id": "first", "type": "document" },
                { "id": "second", "type": "document" }
            ],
            "dashboardLayouts": [
                { "itemId": "first", "order": 0 },
                { "itemId": "second", "order": 1 }
            ],
            "language": "ko"
        })
        .to_string();
        let filtered =
            filter_state_for_reader_label(&reader_window_label("second"), state).unwrap();
        let value: serde_json::Value = serde_json::from_str(&filtered).unwrap();
        let items = value["items"].as_array().unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], "second");
        assert_eq!(value["dashboardLayouts"].as_array().unwrap().len(), 1);
        assert_eq!(value["dashboardLayouts"][0]["itemId"], "second");
        assert_eq!(value["language"], "ko");
    }

    #[test]
    fn reader_window_labels_are_injective_for_previously_colliding_ids() {
        assert_ne!(reader_window_label("a?b"), reader_window_label("a*b"));
        assert_ne!(reader_window_label("한글"), reader_window_label("--"));
        assert_eq!(decode_item_id(&encode_item_id("..")).unwrap(), "..");
        assert_eq!(decode_item_id(&encode_item_id("한글")).unwrap(), "한글");
        assert!(decode_item_id("not-hex").is_err());
        assert!(decode_item_id("aéx").is_err());
    }

    #[test]
    fn asset_paths_are_scoped_to_the_owning_reader_window() {
        let path = std::env::temp_dir().join("mypersonalshelf-asset-scope.mp4");
        let mut registry = PathRegistry::default();
        registry.paths.insert(
            "owner".to_string(),
            RegisteredPath {
                path: path.clone(),
                is_asset: true,
            },
        );

        assert_eq!(
            resolve_asset_path(&registry, &reader_window_label("owner"), "owner").unwrap(),
            path
        );
        assert!(resolve_asset_path(&registry, &reader_window_label("other"), "owner").is_err());
        assert!(resolve_asset_path(&registry, "main", "owner").is_ok());
    }

    #[test]
    fn deleting_an_item_removes_state_and_owned_preferences() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
                 CREATE TABLE reader_progress (item_id TEXT PRIMARY KEY, progress REAL NOT NULL, scroll_top REAL NOT NULL, updated_at INTEGER NOT NULL);
                 CREATE TABLE media_progress (item_id TEXT PRIMARY KEY, position REAL NOT NULL, updated_at INTEGER NOT NULL);
                 CREATE TABLE text_preferences (item_id TEXT PRIMARY KEY, encoding TEXT NOT NULL, updated_at INTEGER NOT NULL);",
            )
            .unwrap();
        let state = serde_json::json!({
            "items": [{ "id": "remove" }, { "id": "keep" }],
            "dashboardLayouts": [{ "itemId": "remove" }, { "itemId": "keep" }]
        })
        .to_string();
        connection
            .execute("INSERT INTO app_state VALUES ('state', ?1, 1)", [&state])
            .unwrap();
        connection
            .execute(
                "INSERT INTO reader_progress VALUES ('remove', 10, 20, 1)",
                [],
            )
            .unwrap();
        connection
            .execute("INSERT INTO media_progress VALUES ('remove', 30, 1)", [])
            .unwrap();
        connection
            .execute(
                "INSERT INTO text_preferences VALUES ('remove', 'utf-8', 1)",
                [],
            )
            .unwrap();

        delete_item_data(&mut connection, "remove").unwrap();

        let saved: String = connection
            .query_row(
                "SELECT value FROM app_state WHERE key = 'state'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let value: serde_json::Value = serde_json::from_str(&saved).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 1);
        assert_eq!(value["items"][0]["id"], "keep");
        assert_eq!(value["dashboardLayouts"].as_array().unwrap().len(), 1);
        for table in ["reader_progress", "media_progress", "text_preferences"] {
            let count: i64 = connection
                .query_row(
                    &format!("SELECT COUNT(*) FROM {table} WHERE item_id = 'remove'"),
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 0);
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn removes_windows_verbatim_prefixes_from_display_paths() {
        assert_eq!(
            path_without_verbatim_prefix(Path::new(r"\\?\C:\Media\movie.mp4")),
            Path::new(r"C:\Media\movie.mp4")
        );
        assert_eq!(
            path_without_verbatim_prefix(Path::new(r"\\?\UNC\server\share\novel.txt")),
            Path::new(r"\\server\share\novel.txt")
        );
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
        assert!(is_supported_content_path(Path::new("document.pdf")));
        assert!(is_supported_content_path(Path::new("report.DOCX")));
        assert!(is_supported_content_path(Path::new("notes.hwp")));
        assert!(!is_supported_text_path(Path::new("document.pdf")));
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
    fn decodes_bomless_utf16_in_both_byte_orders() {
        assert_eq!(
            decode_text_bytes(vec![
                0x48, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x6C, 0x00, 0x6F, 0x00
            ])
            .unwrap(),
            "Hello"
        );
        assert_eq!(
            decode_text_bytes(vec![
                0x00, 0x48, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x6C, 0x00, 0x6F
            ])
            .unwrap(),
            "Hello"
        );
    }

    #[test]
    fn force_decodes_bomless_korean_utf16_in_both_byte_orders() {
        assert_eq!(
            decode_text_bytes_with_encoding(vec![0x48, 0xC5, 0x55, 0xB1], Some("utf-16le"))
                .unwrap(),
            "\u{c548}\u{b155}"
        );
        assert_eq!(
            decode_text_bytes_with_encoding(vec![0xC5, 0x48, 0xB1, 0x55], Some("utf-16be"))
                .unwrap(),
            "\u{c548}\u{b155}"
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

    #[test]
    fn rejects_invalid_progress_values_and_future_timestamps() {
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

        assert!(upsert_reader_progress(&connection, "reader", f64::NAN, 0.0, 1).is_err());
        assert!(upsert_media_progress(&connection, "media", f64::INFINITY, 1).is_err());
        assert!(validate_progress_timestamp(-1).is_err());
        assert!(validate_progress_timestamp(i64::MAX).is_err());
    }
}
