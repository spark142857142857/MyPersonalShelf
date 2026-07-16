import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { CloseRequestedEvent } from "@tauri-apps/api/window";
import type { AppSettings, CollectionSettings, ContentType, DashboardLayoutItem, FolderEntry, TextEncoding, ThemeSettings } from "../types";
import type { Language } from "./i18n";
import { encodeNativeItemId } from "./nativeIds";

export interface NativeContentSelection {
  title: string;
  path: string;
  contentType: ContentType;
  fileName?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  textContent?: string;
}

export interface NativeFolderSelection {
  title: string;
  path: string;
  entries: FolderEntry[];
}

export interface PersistedAppState {
  items: unknown[];
  theme: ThemeSettings;
  language: Language;
  dashboardLayouts: DashboardLayoutItem[];
  collectionSettings?: Record<string, CollectionSettings>;
  appSettings?: AppSettings;
}

export interface NativeReaderProgress {
  progress: number;
  scrollTop: number;
}

export interface NativeMediaProgress {
  position: number;
}

export interface NativeTextEncodingChange {
  itemId: string;
  encoding: TextEncoding;
}

const textEncodingChangedEvent = "text-encoding-changed";

export function isNativeRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadNativeAppState() {
  const state = await invoke<string | null>("load_app_state");
  return state ? (JSON.parse(state) as PersistedAppState) : null;
}

export async function saveNativeAppState(state: PersistedAppState) {
  await invoke("save_app_state", { state: JSON.stringify(state) });
}

export async function loadNativeReaderProgress(itemId: string) {
  return invoke<NativeReaderProgress | null>("load_reader_progress", { itemId });
}

export async function saveNativeReaderProgress(itemId: string, progress: number, scrollTop: number, updatedAt = Date.now()) {
  await invoke("save_reader_progress", { itemId, progress, scrollTop, updatedAt });
}

export async function loadNativeMediaProgress(itemId: string) {
  return invoke<NativeMediaProgress | null>("load_media_progress", { itemId });
}

export async function saveNativeMediaProgress(itemId: string, position: number, updatedAt = Date.now()) {
  await invoke("save_media_progress", { itemId, position, updatedAt });
}

export async function selectNativeFile() {
  return invoke<NativeContentSelection | null>("select_file");
}

export async function selectNativeFolder() {
  return invoke<NativeFolderSelection | null>("select_folder");
}

export async function registerNativeContentPath(path: string, contentType: ContentType, itemId: string) {
  return invoke<string>("register_content_path", { path, contentType, itemId });
}

export async function unregisterNativeContentPaths(itemIds: string[]) {
  if (itemIds.length === 0) return;
  await invoke("unregister_content_paths", { itemIds });
}

export async function deleteNativeContentItem(itemId: string) {
  await invoke("delete_content_item", { itemId });
}

export async function isNativeReaderWindowOpen(itemId: string) {
  return invoke<boolean>("is_reader_window_open", { itemId });
}

export async function readNativeTextFile(path: string, itemId: string, encoding: TextEncoding = "auto") {
  return invoke<string>("read_text_file", { path, encoding, itemId });
}

export async function saveNativeTextEncoding(itemId: string, encoding: TextEncoding) {
  await invoke("save_text_encoding", { itemId, encoding });
}

export async function onNativeTextEncodingChanged(
  handler: (change: NativeTextEncodingChange) => void,
) {
  return listen<NativeTextEncodingChange>(textEncodingChangedEvent, (event) => handler(event.payload));
}

export async function listNativeFolder(path: string, itemId: string) {
  return invoke<FolderEntry[]>("list_folder", { path, itemId });
}

export async function openNativeFolder(path: string, itemId: string) {
  await invoke("open_folder", { path, itemId });
}

export async function openNativePath(path: string, itemId: string) {
  await invoke("open_path", { path, itemId });
}

export async function openNativeUrl(url: string) {
  await invoke("open_url", { url });
}

export function nativeAssetUrl(itemId: string) {
  return isNativeRuntime() ? convertFileSrc(encodeNativeItemId(itemId), "shelf-content") : "";
}

export async function closeCurrentNativeWindow() {
  await invoke("request_current_window_close");
}

export async function destroyCurrentNativeWindow() {
  await invoke("destroy_current_window");
}

export async function onNativeCloseRequested(
  handler: (event: CloseRequestedEvent) => void | Promise<void>,
) {
  return getCurrentWebviewWindow().onCloseRequested(handler);
}

export async function openNativeReaderWindow(itemId: string, title: string) {
  const label = `reader-${encodeNativeItemId(itemId)}`;
  const existingWindow = await WebviewWindow.getByLabel(label);
  if (existingWindow) {
    await existingWindow.setFocus();
    return;
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("reader", itemId);

  const readerWindow = new WebviewWindow(label, {
    center: true,
    focus: true,
    height: 900,
    minHeight: 620,
    minWidth: 520,
    title,
    url: `${url.pathname}${url.search}`,
    width: 920,
  });

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    function finish(error?: unknown) {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }

    readerWindow.once("tauri://created", () => finish()).catch(finish);
    readerWindow.once<string>("tauri://error", (event) => finish(new Error(String(event.payload)))).catch(finish);
  });
}
