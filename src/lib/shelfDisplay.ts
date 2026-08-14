import type { MessageKey } from "./i18n";
import {
  displayableImageSrc,
  faviconUrlFor,
  linkYoutubeKind,
  localLinkThumbnail,
  type LinkPlatform,
} from "./linkMeta";
import type { YoutubeLinkKind } from "./youtubeLinks";
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
  "yt-track": "tagYtTrack",
  "yt-album": "tagYtAlbum",
  "yt-playlist": "tagYtPlaylist",
  "yt-artist": "tagYtArtist",
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

const youtubeKindLabelKeys: Record<YoutubeLinkKind, MessageKey> = {
  track: "ytKindTrack",
  album: "ytKindAlbum",
  playlist: "ytKindPlaylist",
  artist: "ytKindArtist",
  video: "ytKindVideo",
  unknown: "ytKindUnknown",
};

/**
 * Names what a link points at: "Track", "Album", and so on. Falls back to the
 * plain platform name for addresses the parser cannot classify.
 */
export function getLinkKindLabel(
  location: string,
  platform: LinkPlatform,
  t: (key: MessageKey) => string,
) {
  const kind = linkYoutubeKind(location);
  if (!kind || kind === "unknown") {
    return getLinkPlatformLabel(platform, t);
  }
  return t(youtubeKindLabelKeys[kind]);
}

export function getItemTitle(item: ContentItem, t: (key: MessageKey) => string) {
  return translateKnown(item.title, seedTitleLabelKeys, t);
}

/**
 * An item's note, or an empty string when it has none.
 *
 * This used to hand back a standing sentence inviting the reader to write one,
 * which the card printed as though it were content: on a shelf where most items
 * carry no note, the same sentence filled every card. It also reached the search
 * index, so a query for a word inside it matched every item that had no note.
 * Callers that want their own fallback already spell one out.
 */
export function getItemSummary(item: ContentItem, t: (key: MessageKey) => string) {
  return item.summary ? translateKnown(item.summary, seedSummaryLabelKeys, t) : "";
}

export function getItemLocation(item: ContentItem, t: (key: MessageKey) => string) {
  return translateKnown(item.location, locationLabelKeys, t);
}

/**
 * The tail of a location: the file or folder name, without the path leading to
 * it.
 *
 * List rows carried the whole absolute path, which is the widest and least
 * scannable thing in them, while the detail panel shows the full path anyway.
 * Anything without a separator — a placeholder, a bare name — comes back
 * untouched, so a location that is not a path is never chopped.
 */
export function getItemFileName(item: ContentItem, t: (key: MessageKey) => string) {
  if (item.fileName) {
    return item.fileName;
  }

  const location = getItemLocation(item, t);
  // A folder's path may end in a separator, which would otherwise yield "".
  const withoutTrailingSeparator = location.replace(/[\\/]+$/, "");
  const lastSeparator = Math.max(
    withoutTrailingSeparator.lastIndexOf("/"),
    withoutTrailingSeparator.lastIndexOf("\\"),
  );
  if (lastSeparator === -1) {
    return location;
  }
  return withoutTrailingSeparator.slice(lastSeparator + 1) || location;
}

export function getItemTextContent(item: ContentItem, t: (key: MessageKey) => string) {
  return item.textContent ? translateKnown(item.textContent, seedTextContentLabelKeys, t) : "";
}

/**
 * The image standing in for an item: the preview saved with it, or failing
 * that whatever its address implies. Cards, list rows, and the detail panel all
 * read it from here, so a link cannot end up with artwork in one view and a
 * bare type icon in another. The result is already filtered by the link preview
 * setting, so callers can render it as-is.
 */
export function getItemImageSrc(item: ContentItem): string | null {
  const derived = item.type === "link" ? localLinkThumbnail(item.location) ?? faviconUrlFor(item.location) : null;
  return displayableImageSrc(item.previewImage ?? derived);
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
