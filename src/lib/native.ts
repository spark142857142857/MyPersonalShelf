import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ContentType, DashboardLayoutItem, FolderEntry, ThemeSettings } from "../types";
import type { Language } from "./i18n";

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
}

export interface NativeReaderProgress {
  progress: number;
  scrollTop: number;
}

export interface NativeMediaProgress {
  position: number;
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

export async function saveNativeReaderProgress(itemId: string, progress: number, scrollTop: number) {
  await invoke("save_reader_progress", { itemId, progress, scrollTop });
}

export async function loadNativeMediaProgress(itemId: string) {
  return invoke<NativeMediaProgress | null>("load_media_progress", { itemId });
}

export async function saveNativeMediaProgress(itemId: string, position: number) {
  await invoke("save_media_progress", { itemId, position });
}

export async function selectNativeFile() {
  return invoke<NativeContentSelection | null>("select_file");
}

export async function selectNativeFolder() {
  return invoke<NativeFolderSelection | null>("select_folder");
}

export async function readNativeTextFile(path: string) {
  return invoke<string>("read_text_file", { path });
}

export async function listNativeFolder(path: string) {
  return invoke<FolderEntry[]>("list_folder", { path });
}

export async function openNativeFolder(path: string) {
  await invoke("open_folder", { path });
}

export async function openNativeUrl(url: string) {
  await invoke("open_url", { url });
}

export function nativeAssetUrl(path: string) {
  return convertFileSrc(path);
}

export async function openNativeReaderWindow(itemId: string, title: string) {
  const label = `reader-${itemId.replace(/[^a-zA-Z0-9-/:_]/g, "-")}`;
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
