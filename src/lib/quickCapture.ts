import { getSafeExternalUrl } from "./urlSafety";

const EXPLICIT_HTTP_URL = /https?:\/\/[^\s<>"']+/i;
const SCHEMELESS_DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+([/:?#].*)?$/i;
const EXECUTABLE_LIKE_TLD = /^(?:cmd|exe|bat|msi|scr|ps1|dll)$/i;

function looksLikeWebDomain(token: string) {
  if (/%[0-9a-f]{2}/i.test(token) || /\s/.test(token)) return false;
  if (!SCHEMELESS_DOMAIN.test(token)) return false;
  try {
    const hostname = new URL(`https://${token}`).hostname;
    const tld = hostname.split(".").pop() ?? "";
    return tld.length >= 2 && !EXECUTABLE_LIKE_TLD.test(tld);
  } catch {
    return false;
  }
}

/** Clipboard/drop capture: prefer explicit http(s); allow bare domains only when they look like websites. */
export function extractUrlFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = trimmed.match(EXPLICIT_HTTP_URL);
  if (match) {
    return getSafeExternalUrl(match[0].replace(/[),.;]+$/, ""));
  }

  if (looksLikeWebDomain(trimmed)) {
    return getSafeExternalUrl(trimmed);
  }

  return null;
}

export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "") || url;
  } catch {
    return url;
  }
}

export function isQuickCaptureShortcut(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
  altKey?: boolean;
}) {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v";
}

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(target.isContentEditable);
}

export type DropCapture =
  | { kind: "url"; url: string }
  | { kind: "files"; files: File[] }
  | { kind: "none" };

export function readDropCapture(dataTransfer: DataTransfer | null): DropCapture {
  if (!dataTransfer) return { kind: "none" };

  const uriList = dataTransfer.getData("text/uri-list").split("\n").map((line) => line.trim()).find(
    (line) => line && !line.startsWith("#"),
  );
  const fromUri = uriList ? extractUrlFromText(uriList) : null;
  if (fromUri) return { kind: "url", url: fromUri };

  const fromText = extractUrlFromText(dataTransfer.getData("text/plain") || dataTransfer.getData("text"));
  if (fromText) return { kind: "url", url: fromText };

  const files = Array.from(dataTransfer.files ?? []);
  if (files.length > 0) return { kind: "files", files };

  return { kind: "none" };
}
