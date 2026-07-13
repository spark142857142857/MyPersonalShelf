import { useEffect, useRef, useState } from "react";
import type { MessageKey } from "../lib/i18n";
import {
  isNativeRuntime,
  loadNativeMediaProgress,
  nativeAssetUrl,
  saveNativeMediaProgress,
} from "../lib/native";
import { saveBrowserItemProgress } from "../lib/persistence";
import { canPreviewMediaItem, getItemTitle, getTypeLabel } from "../lib/shelfDisplay";
import type { ContentItem } from "../types";

export function MediaViewerView({
  item,
  t,
  onBack,
  onCloseFlushChange,
  onPatch,
}: {
  item: ContentItem;
  t: (key: MessageKey) => string;
  onBack: () => void;
  onCloseFlushChange: (handler: (() => Promise<void>) | null) => void;
  onPatch: (patch: Partial<ContentItem>) => void;
}) {
  const previewUrl = item.objectUrl ?? (item.source === "path" ? nativeAssetUrl(item.id) : undefined);
  const canPreviewVideo = item.type === "video" && previewUrl && canPreviewMediaItem(item, "video");
  const canPreviewAudio = item.type === "audio" && previewUrl && canPreviewMediaItem(item, "audio");
  const canPreviewImage = item.type === "image" && previewUrl;
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  const mediaOnPatchRef = useRef(onPatch);
  const lastSavedMediaPositionRef = useRef(item.mediaPosition ?? 0);
  const latestMediaPositionRef = useRef({ position: item.mediaPosition ?? 0, updatedAt: Date.now() });
  const [savedMediaPosition, setSavedMediaPosition] = useState(item.mediaPosition ?? 0);

  useEffect(() => {
    mediaOnPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    async function flushMediaPosition() {
      if (item.type !== "video" && item.type !== "audio") return;
      const mediaPosition = mediaElementRef.current?.currentTime;
      if (typeof mediaPosition === "number" && Number.isFinite(mediaPosition)) {
        latestMediaPositionRef.current = { position: mediaPosition, updatedAt: Date.now() };
      }
      const { position: nextPosition, updatedAt } = latestMediaPositionRef.current;
      mediaOnPatchRef.current({ mediaPosition: nextPosition });
      saveBrowserItemProgress(item.id, { mediaPosition: nextPosition });
      await saveNativeMediaProgress(item.id, nextPosition, updatedAt);
    }

    const handlePageHide = () => {
      void flushMediaPosition().catch(() => undefined);
    };
    onCloseFlushChange(flushMediaPosition);

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      void flushMediaPosition().catch(() => undefined);
      onCloseFlushChange(null);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [item.id, item.type, onCloseFlushChange]);

  useEffect(() => {
    const fallbackPosition = item.mediaPosition ?? 0;
    lastSavedMediaPositionRef.current = fallbackPosition;
    latestMediaPositionRef.current = { position: fallbackPosition, updatedAt: Date.now() };
    setSavedMediaPosition(fallbackPosition);

    if (item.type !== "video" && item.type !== "audio") {
      return;
    }

    let isMounted = true;
    loadNativeMediaProgress(item.id)
      .then((progress) => {
        if (!isMounted || !progress) {
          return;
        }

        const nextPosition = progress.position ?? fallbackPosition;
        lastSavedMediaPositionRef.current = nextPosition;
        latestMediaPositionRef.current = { position: nextPosition, updatedAt: Date.now() };
        setSavedMediaPosition(nextPosition);
        onPatch({ mediaPosition: nextPosition });
        const media = mediaElementRef.current;
        if (media && nextPosition > 0) {
          const duration = media.duration;
          if (!Number.isFinite(duration) || nextPosition < duration - 2) {
            media.currentTime = nextPosition;
          }
        }
      })
      .catch(() => {
        // Browser preview cannot call Tauri commands; item state remains the fallback.
      });

    return () => {
      isMounted = false;
    };
  }, [item.id, item.type]);

  function attachMediaElement(node: HTMLMediaElement | null) {
    mediaElementRef.current = node;
  }

  function restoreMediaPosition(event: React.SyntheticEvent<HTMLMediaElement>) {
    const position = savedMediaPosition;
    const duration = event.currentTarget.duration;
    if (position > 0 && (!Number.isFinite(duration) || position < duration - 2)) {
      event.currentTarget.currentTime = position;
    }
  }

  function saveMediaPosition(nextPosition: number, minimumDelta = 3) {
    const updatedAt = Date.now();
    latestMediaPositionRef.current = { position: nextPosition, updatedAt };
    if (Math.abs(nextPosition - lastSavedMediaPositionRef.current) >= minimumDelta) {
      lastSavedMediaPositionRef.current = nextPosition;
      setSavedMediaPosition(nextPosition);
      onPatch({ mediaPosition: nextPosition });
      saveBrowserItemProgress(item.id, { mediaPosition: nextPosition });
      saveNativeMediaProgress(item.id, nextPosition, updatedAt).catch(() => {
        // Browser preview cannot call Tauri commands; item state still keeps the value for this session.
      });
    }
  }

  return (
    <section className="readerPage">
      <div className="readerPageHeader">
        <div>
          <span className="eyebrow">{getTypeLabel(item.type, t)}</span>
          <h1>{getItemTitle(item, t)}</h1>
          {(item.type === "video" || item.type === "audio") && (
            <p>{t("mediaResume")}: {Math.round(savedMediaPosition)}s</p>
          )}
        </div>
        <button type="button" onClick={onBack}>{t("backToLibrary")}</button>
      </div>

      <article className="readerPageBody mediaViewerBody" style={{ borderColor: item.accent }}>
        {canPreviewVideo && (
          <video
            src={previewUrl}
            controls
            autoPlay
            ref={attachMediaElement}
            onLoadedMetadata={restoreMediaPosition}
            onPause={(event) => saveMediaPosition(event.currentTarget.currentTime, 0)}
            onTimeUpdate={(event) => saveMediaPosition(event.currentTarget.currentTime)}
          />
        )}
        {canPreviewAudio && (
          <audio
            src={previewUrl}
            controls
            autoPlay
            ref={attachMediaElement}
            onLoadedMetadata={restoreMediaPosition}
            onPause={(event) => saveMediaPosition(event.currentTarget.currentTime, 0)}
            onTimeUpdate={(event) => saveMediaPosition(event.currentTarget.currentTime)}
          />
        )}
        {canPreviewImage && <img src={previewUrl} alt={getItemTitle(item, t)} />}
        {!canPreviewVideo && !canPreviewAudio && !canPreviewImage && (
          <div className="readerEmptyText">
            {item.type === "video" && t("videoPathSaved")}
            {item.type === "audio" && t("audioPathSaved")}
            {item.type === "image" && t("imagePathSaved")}
          </div>
        )}
      </article>
    </section>
  );
}

