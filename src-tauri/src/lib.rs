use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::Manager;

const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;
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

#[tauri::command]
fn load_app_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT value FROM app_state WHERE key = 'state'",
            [],
            |row| row.get::<_, String>(0),
        )
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
fn select_file() -> Result<Option<NativeContentSelection>, String> {
    let Some(path) = rfd::FileDialog::new().pick_file() else {
        return Ok(None);
    };

    Ok(Some(file_selection_from_path(path)?))
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
        return Err("Text file is too large for the current reader limit.".to_string());
    }

    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_folder(path: String) -> Result<Vec<FolderEntry>, String> {
    folder_entries(Path::new(&path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            select_file,
            select_folder,
            read_text_file,
            list_folder
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
        .execute(
            "CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn file_selection_from_path(path: PathBuf) -> Result<NativeContentSelection, String> {
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
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
    let text_content = if content_type == "document" && metadata.len() <= MAX_TEXT_BYTES {
        fs::read_to_string(&path).ok()
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
        "mp4" | "webm" | "mov" | "mkv" | "avi" => "video",
        "mp3" | "wav" | "flac" | "ogg" | "m4a" => "audio",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => "image",
        _ => "document",
    }
}

fn ensure_supported_text_file(path: &Path) -> Result<(), String> {
    match content_type_for_path(path) {
        "document" => Ok(()),
        _ => Err("Only text-like document files can be read as text.".to_string()),
    }
}
