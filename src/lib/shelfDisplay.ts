import type { MessageKey } from "./i18n";
import type { LinkPlatform } from "./linkMeta";
import type {
  ContentItem,
  ContentSource,
  ContentType,
  DashboardCardSize,
  TextEncoding,
} from "../types";

export const textEncodingOptions: Array<{ value: TextEncoding; label: MessageKey }> = [
  { value: "auto", label: "encodingAuto" },
  { value: "utf-8", label: "encodingUtf8" },
  { value: "cp949", label: "encodingCp949" },
  { value: "utf-16le", label: "encodingUtf16Le" },
  { value: "utf-16be", label: "encodingUtf16Be" },
];

const typeLabelKeys: Record<ContentType, MessageKey> = {
  document: "typeDocument",
  video: "typeVideo",
  audio: "typeAudio",
  image: "typeImage",
  link: "typeLink",
  folder: "typeFolder",
};

const sourceLabelKeys: Record<ContentSource, MessageKey> = {
  path: "sourcePath",
  url: "sourceUrl",
  note: "sourceNote",
  upload: "sourceUpload",
};

const sizeLabelKeys: Record<DashboardCardSize, MessageKey> = {
  standard: "sizeStandard",
  wide: "sizeWide",
  tall: "sizeTall",
};

const entryTypeLabelKeys: Record<"file" | "folder", MessageKey> = {
  file: "entryFile",
  folder: "entryFolder",
};

const collectionLabelKeys: Record<string, MessageKey> = {
  Inbox: "collectionInbox",
  Reading: "collectionReading",
  Media: "collectionMedia",
  Folders: "collectionFolders",
  Novels: "collectionNovels",
  Lectures: "collectionLectures",
  Music: "collectionMusic",
  Links: "collectionLinks",
};

const tagLabelKeys: Record<string, MessageKey> = {
  archive: "tagArchive",
  audio: "typeAudio",
  document: "typeDocument",
  focus: "tagFocus",
  folder: "typeFolder",
  frontend: "tagFrontend",
  image: "typeImage",
  later: "tagLater",
  lecture: "tagLecture",
  link: "typeLink",
  local: "tagLocal",
  imported: "tagImported",
  youtube: "tagYoutube",
  "yt-music": "tagYtMusic",
  playlist: "tagPlaylist",
  reading: "tagReading",
  reference: "tagReference",
  uploaded: "tagUploaded",
  video: "typeVideo",
};

const seedTitleLabelKeys: Record<string, MessageKey> = {
  "Untitled shelf item": "untitledItem",
  "Novel reading archive": "seedNovelTitle",
  "React lecture materials": "seedLectureTitle",
  "Focus music folder": "seedMusicTitle",
  "Saved reference links": "seedLinksTitle",
};

const locationLabelKeys: Record<string, MessageKey> = {
  "No location yet": "noLocation",
};

const seedSummaryLabelKeys: Record<string, MessageKey> = {
  "A long-form reading shelf for novels and text files.": "seedNovelSummary",
  "Stable lecture videos and notes.": "seedLectureSummary",
  "Local audio for focus sessions.": "seedMusicSummary",
  "Links saved outside the browser bookmark bar.": "seedLinksSummary",
};

const seedTextContentLabelKeys: Record<string, MessageKey> = {
  "This is a sample reading page. Later, local txt/md/epub files can be opened here with custom width, theme, and line height.":
    "seedNovelText",
};

function translateKnown(value: string, labels: Record<string, MessageKey>, t: (key: MessageKey) => string) {
  const key = labels[value];
  return key ? t(key) : value;
}

export function getTypeLabel(type: ContentType, t: (key: MessageKey) => string) {
  return t(typeLabelKeys[type]);
}

export function getSourceLabel(source: ContentSource, t: (key: MessageKey) => string) {
  return t(sourceLabelKeys[source]);
}

export function getSizeLabel(size: DashboardCardSize, t: (key: MessageKey) => string) {
  return t(sizeLabelKeys[size]);
}

export function getEntryTypeLabel(entryType: "file" | "folder", t: (key: MessageKey) => string) {
  return t(entryTypeLabelKeys[entryType]);
}

export function getCollectionLabel(collection: string, t: (key: MessageKey) => string) {
  return translateKnown(collection, collectionLabelKeys, t);
}

export function getTagLabel(tag: string, t: (key: MessageKey) => string) {
  return translateKnown(tag, tagLabelKeys, t);
}

export function getItemTitle(item: ContentItem, t: (key: MessageKey) => string) {
  return translateKnown(item.title, seedTitleLabelKeys, t);
}

export function getItemSummary(item: ContentItem, t: (key: MessageKey) => string) {
  return item.summary ? translateKnown(item.summary, seedSummaryLabelKeys, t) : t("noSummary");
}

export function getItemLocation(item: ContentItem, t: (key: MessageKey) => string) {
  return translateKnown(item.location, locationLabelKeys, t);
}

export function getItemTextContent(item: ContentItem, t: (key: MessageKey) => string) {
  return item.textContent ? translateKnown(item.textContent, seedTextContentLabelKeys, t) : "";
}

export function canPreviewMediaItem(item: ContentItem, kind: "video" | "audio") {
  if (item.source === "upload") {
    return true;
  }

  const target = `${item.fileName ?? ""} ${item.location}`.toLowerCase();
  const extensions = kind === "video" ? ["mp4", "webm", "m4v"] : ["mp3", "wav", "ogg", "m4a"];
  return extensions.some((extension) => new RegExp(`\\.${extension}(?:$|[?#])`).test(target));
}

export function getLinkPlatformLabel(platform: LinkPlatform, t: (key: MessageKey) => string) {
  if (platform === "youtube-music") return t("youtubeMusicLinkLabel");
  if (platform === "youtube") return t("youtubeLinkLabel");
  return t("webLinkLabel");
}
