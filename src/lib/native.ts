import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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

export async function loadNativeAppState() {
  const state = await invoke<string | null>("load_app_state");
  return state ? (JSON.parse(state) as PersistedAppState) : null;
}

export async function saveNativeAppState(state: PersistedAppState) {
  await invoke("save_app_state", { state: JSON.stringify(state) });
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

export function nativeAssetUrl(path: string) {
  return convertFileSrc(path);
}
