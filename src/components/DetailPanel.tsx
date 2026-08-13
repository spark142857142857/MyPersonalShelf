import type React from "react";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink, FolderOpen, Link, Star, Trash2 } from "lucide-react";
import type { MessageKey } from "../lib/i18n";
import { isExternalDocumentItem } from "../lib/documentOpen";
import { detectLinkPlatform, faviconUrlFor } from "../lib/linkMeta";
import { loadNativeMediaProgress, nativeAssetUrl, saveNativeMediaProgress } from "../lib/native";
import { saveBrowserItemProgress } from "../lib/persistence";
import {
  canPreviewMediaItem,
  getEntryTypeLabel,
  getItemLocation,
  getItemSummary,
  getItemTextContent,
  getItemTitle,
  getLinkPlatformLabel,
  getTagLabel,
  getTypeLabel,
} from "../lib/shelfDisplay";
import { getSafeExternalUrl } from "../lib/urlSafety";
import type { ContentItem, ThemeSettings } from "../types";
import { DocumentTextView } from "./DocumentTextView";
import { typeIcons } from "./icons";
import { isViewerContent, parseTagInput } from "../lib/shelfItems";

export function DetailPanel({
  item,
  theme,
  t,
  pathReady,
  collectionNames,
  onPatch,
  onDelete,
  onOpenItem,
  onRelink,
  onFilterCollection,
  onFilterTag,
}: {
  item: ContentItem;
  theme: ThemeSettings;
  t: (key: MessageKey) => string;
  pathReady: boolean;
  collectionNames: string[];
  onPatch: (patch: Partial<ContentItem>) => void;
  onDelete: () => void;
  onOpenItem?: () => void;
  onRelink?: () => void;
  onFilterCollection: (collection: string) => void;
  onFilterTag: (tag: string) => void;
}) {
  const safeExternalUrl = item.type === "link" ? getSafeExternalUrl(item.location) : null;
  const itemSummaryText = item.summary ? getItemSummary(item, t) : "";
  const [collectionDraft, setCollectionDraft] = useState(item.collection);
  const [tagDraft, setTagDraft] = useState(item.tags.join(", "));
  const [summaryDraft, setSummaryDraft] = useState(itemSummaryText);

  useEffect(() => {
    setCollectionDraft(item.collection);
    setTagDraft(item.tags.join(", "));
  }, [item.collection, item.id, item.tags]);

  // Notes are only re-seeded when the panel switches items, so background
  // patches to the selected item cannot overwrite text being typed.
  useEffect(() => {
    setSummaryDraft(item.summary ? getItemSummary(item, t) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  function commitCollectionDraft() {
    const nextCollection = collectionDraft.trim() || "Inbox";
    setCollectionDraft(nextCollection);
    if (nextCollection !== item.collection) {
      onPatch({ collection: nextCollection });
    }
  }

  function commitTagDraft() {
    const nextTags = parseTagInput(tagDraft);
    setTagDraft(nextTags.join(", "));
    if (nextTags.join("\u0000") !== item.tags.join("\u0000")) {
      onPatch({ tags: nextTags });
    }
  }

  function commitSummaryDraft() {
    if (summaryDraft !== itemSummaryText) {
      onPatch({ summary: summaryDraft });
    }
  }

  return (
    <div className="readerPanel">
      <div className="sectionTitle">
        <h2>{t("preview")}</h2>
        <span>{getTypeLabel(item.type, t)}</span>
      </div>
      <div className="detailActions">
        <button type="button" onClick={() => onPatch({ isFavorite: !item.isFavorite })}>
          <Star size={16} fill={item.isFavorite ? "currentColor" : "none"} />
          {item.isFavorite ? t("pinnedState") : t("pin")}
        </button>
        {isViewerContent(item) && onOpenItem && (
          <button type="button" onClick={onOpenItem}>
            {isExternalDocumentItem(item) ? (
              <>
                <ExternalLink size={16} />
                {t("openExternal")}
              </>
            ) : item.type === "document" ? (
              <>
                <BookOpen size={16} />
                {t("openReader")}
              </>
            ) : (
              <>
                {typeIcons[item.type]}
                {t("open")}
              </>
            )}
          </button>
        )}
        {item.type === "link" && (
          <button
            type="button"
            disabled={!safeExternalUrl}
            title={safeExternalUrl ? t("open") : t("invalidLink")}
            onClick={onOpenItem}
          >
            <Link size={16} />
            {safeExternalUrl ? t("open") : t("invalidLink")}
          </button>
        )}
        {item.type === "folder" && item.source === "path" && (
          <button type="button" onClick={onOpenItem}>
            <FolderOpen size={16} />
            {t("openFolder")}
          </button>
        )}
        {onRelink && (
          <button type="button" onClick={onRelink}>
            <FolderOpen size={16} />
            {t("relinkPath")}
          </button>
        )}
        <button className="dangerButton" type="button" onClick={onDelete}>
          <Trash2 size={16} />
          {t("delete")}
        </button>
      </div>

      {item.source === "path" && !pathReady && (
        <p className="pathBrokenBanner" role="alert">
          <strong>{t("pathBrokenBanner")}</strong>
          <span>{t("relinkHint")}</span>
        </p>
      )}

      <div
        className="readerPreview"
        style={{
          borderColor: item.accent,
          fontSize: theme.readerFontSize,
          maxWidth: theme.readerWidth,
          lineHeight: theme.lineHeight,
        }}
      >
        <strong>{getItemTitle(item, t)}</strong>
        <small className="previewLocation">{getItemLocation(item, t)}</small>
        <PreviewBody item={item} t={t} onPatch={onPatch} pathReady={pathReady} />
      </div>

      <label className="fieldBlock">
        {t("notes")}
        <textarea
          value={summaryDraft}
          onChange={(event) => setSummaryDraft(event.target.value)}
          onBlur={commitSummaryDraft}
          placeholder={t("notesPlaceholder")}
        />
      </label>

      <div className="organizeEditor">
        <label className="fieldBlock">
          {t("collection")}
          <input
            list="collection-options"
            value={collectionDraft}
            onChange={(event) => setCollectionDraft(event.target.value)}
            onBlur={commitCollectionDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
        <datalist id="collection-options">
          {collectionNames.map((collection) => (
            <option value={collection} key={collection} />
          ))}
        </datalist>
        <label className="fieldBlock">
          {t("tagsComma")}
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onBlur={commitTagDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
      </div>

      <div className="quickFilterRow">
        <button type="button" onClick={() => onFilterCollection(item.collection)}>
          {t("filterCollection")}
        </button>
        {item.tags.map((tag) => (
          <button type="button" key={tag} onClick={() => onFilterTag(tag)}>
            #{getTagLabel(tag, t)}
          </button>
        ))}
      </div>
    </div>
  );
}


export function PreviewBody({
  item,
  t,
  onPatch,
  pathReady,
}: {
  item: ContentItem;
  t: (key: MessageKey) => string;
  onPatch: (patch: Partial<ContentItem>) => void;
  pathReady: boolean;
}) {
  const canUseAssetPath = pathReady && item.source === "path" && (item.type === "video" || item.type === "audio" || item.type === "image");
  const previewUrl = item.objectUrl ?? (canUseAssetPath ? nativeAssetUrl(item.id) || undefined : undefined);
  const nativeMediaPositionRef = useRef(item.mediaPosition ?? 0);
  const latestPreviewMediaPositionRef = useRef({ position: item.mediaPosition ?? 0, updatedAt: Date.now() });
  const previewMediaElementRef = useRef<HTMLMediaElement | null>(null);
  const previewOnPatchRef = useRef(onPatch);
  const [nativeMediaPosition, setNativeMediaPosition] = useState(item.mediaPosition ?? 0);

  useEffect(() => {
    previewOnPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    const media = previewMediaElementRef.current;
    if (!media || nativeMediaPosition <= 0 || !Number.isFinite(media.duration)) return;
    if (nativeMediaPosition < media.duration - 2 && Math.abs(media.currentTime - nativeMediaPosition) > 1) {
      media.currentTime = nativeMediaPosition;
    }
  }, [item.id, nativeMediaPosition]);

  useEffect(() => {
    function flushPreviewMediaPosition() {
      const { position: nextPosition, updatedAt } = latestPreviewMediaPositionRef.current;
      previewOnPatchRef.current({ mediaPosition: nextPosition });
      saveBrowserItemProgress(item.id, { mediaPosition: nextPosition });
      saveNativeMediaProgress(item.id, nextPosition, updatedAt).catch(() => undefined);
    }

    window.addEventListener("pagehide", flushPreviewMediaPosition);
    return () => {
      flushPreviewMediaPosition();
      window.removeEventListener("pagehide", flushPreviewMediaPosition);
    };
  }, [item.id]);

  useEffect(() => {
    const fallbackPosition = item.mediaPosition ?? 0;
    nativeMediaPositionRef.current = fallbackPosition;
    latestPreviewMediaPositionRef.current = { position: fallbackPosition, updatedAt: Date.now() };
    setNativeMediaPosition(fallbackPosition);

    if (item.type !== "video" && item.type !== "audio") {
      return;
    }

    let isMounted = true;
    function syncNativeMediaPosition() {
      const positionAtStart = latestPreviewMediaPositionRef.current;
      loadNativeMediaProgress(item.id).then((progress) => {
        if (!isMounted || !progress || latestPreviewMediaPositionRef.current !== positionAtStart) {
          return;
        }

        const nextPosition = progress.position ?? fallbackPosition;
        nativeMediaPositionRef.current = nextPosition;
        latestPreviewMediaPositionRef.current = { position: nextPosition, updatedAt: Date.now() };
        setNativeMediaPosition(nextPosition);
        onPatch({ mediaPosition: nextPosition });
        const media = previewMediaElementRef.current;
        if (media?.paused && nextPosition > 0) {
          const duration = media.duration;
          if (!Number.isFinite(duration) || nextPosition < duration - 2) {
            media.currentTime = nextPosition;
          }
        }
      })
      .catch(() => {
        // Browser preview cannot call Tauri commands; item state remains the fallback.
      });
    }

    syncNativeMediaPosition();
    window.addEventListener("focus", syncNativeMediaPosition);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", syncNativeMediaPosition);
    };
    // Re-syncs only when the previewed item changes; including onPatch or the
    // position it writes would restart this effect on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.type]);

  function savePreviewMediaPosition(nextPosition: number, minimumDelta = 5) {
    const updatedAt = Date.now();
    latestPreviewMediaPositionRef.current = { position: nextPosition, updatedAt };
    if (Math.abs(nextPosition - nativeMediaPositionRef.current) < minimumDelta) {
      return;
    }

    nativeMediaPositionRef.current = nextPosition;
    setNativeMediaPosition(nextPosition);
    onPatch({ mediaPosition: nextPosition });
    saveBrowserItemProgress(item.id, { mediaPosition: nextPosition });
    saveNativeMediaProgress(item.id, nextPosition, updatedAt).catch(() => {
      // Browser preview cannot call Tauri commands; item state still keeps the value for this session.
    });
  }

  if (item.type === "document") {
    if (isExternalDocumentItem(item)) {
      return (
        <div>
          <p className="groupDescription">{t("externalDocumentHint")}</p>
        </div>
      );
    }

    const documentText = getItemTextContent(item, t);
    const fallbackText = item.summary ? getItemSummary(item, t) : t("documentEmpty");

    return (
      <div>
        <DocumentTextView item={item} text={documentText} fallbackText={fallbackText} variant="preview" />
        <p className="readerProgressNote">{t("readerAutoSave")} - {Math.round(item.readerProgress ?? 0)}%</p>
      </div>
    );
  }

  if (item.type === "video") {
    return previewUrl && canPreviewMediaItem(item, "video") ? (
      <video
        src={previewUrl}
        controls
        ref={(node) => {
          previewMediaElementRef.current = node;
        }}
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = nativeMediaPosition;
        }}
        onTimeUpdate={(event) => {
          savePreviewMediaPosition(event.currentTarget.currentTime);
        }}
        onPause={(event) => savePreviewMediaPosition(event.currentTarget.currentTime, 0)}
      />
    ) : (
      <p>{t("videoPathSaved")}</p>
    );
  }

  if (item.type === "audio") {
    return previewUrl && canPreviewMediaItem(item, "audio") ? (
      <div>
        <audio
          src={previewUrl}
          controls
          ref={(node) => {
            previewMediaElementRef.current = node;
          }}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = nativeMediaPosition;
          }}
          onTimeUpdate={(event) => {
            savePreviewMediaPosition(event.currentTarget.currentTime);
          }}
          onPause={(event) => savePreviewMediaPosition(event.currentTarget.currentTime, 0)}
        />
        <p>{t("mediaResume")}: {Math.round(nativeMediaPosition)}s</p>
      </div>
    ) : (
      <p>{t("audioPathSaved")}</p>
    );
  }

  if (item.type === "image") {
    return previewUrl ? <img src={previewUrl} alt={item.title} /> : <p>{t("imagePathSaved")}</p>;
  }

  if (item.type === "link") {
    const platform = detectLinkPlatform(item.location);
    const previewSrc = item.previewImage ?? faviconUrlFor(item.location);
    return (
      <div className={`linkPreviewBody ${platform === "youtube" || platform === "youtube-music" ? "linkPreviewMedia" : ""}`}>
        {previewSrc && <img className="linkPreviewThumb" src={previewSrc} alt="" />}
        <div>
          <p className="linkPlatformLabel">{getLinkPlatformLabel(platform, t)}</p>
          <p className="linkPreviewUrl">{item.location}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p>{t("folderPathSaved")}</p>
      <strong>{t("folderEntries")}</strong>
      {item.folderEntries && item.folderEntries.length > 0 ? (
        <ul className="folderEntryList">
          {item.folderEntries.slice(0, 20).map((entry) => (
            <li key={entry.path}>
              <span>{getEntryTypeLabel(entry.entryType, t)}</span>
              {entry.name}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("noFolderEntries")}</p>
      )}
    </div>
  );
}
