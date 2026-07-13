import { useEffect, useRef, useState } from "react";
import { DocumentTextView } from "./DocumentTextView";
import type { MessageKey } from "../lib/i18n";
import {
  isNativeRuntime,
  loadNativeReaderProgress,
  readNativeTextFile,
  saveNativeReaderProgress,
  saveNativeTextEncoding,
} from "../lib/native";
import { saveBrowserItemProgress } from "../lib/persistence";
import { getItemSummary, getItemTextContent, getItemTitle, getCollectionLabel, textEncodingOptions } from "../lib/shelfDisplay";
import type { ContentItem, TextEncoding, ThemeSettings } from "../types";

export function ReaderView({
  item,
  theme,
  t,
  onBack,
  onCloseFlushChange,
  onPatch,
}: {
  item: ContentItem;
  theme: ThemeSettings;
  t: (key: MessageKey) => string;
  onBack: () => void;
  onCloseFlushChange: (handler: (() => Promise<void>) | null) => void;
  onPatch: (patch: Partial<ContentItem>) => void;
}) {
  const documentText = getItemTextContent(item, t) || "";
  const fallbackText = item.summary ? getItemSummary(item, t) : t("documentEmpty");
  const onPatchRef = useRef(onPatch);
  const encodingChangeRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedProgressRef = useRef(item.readerProgress ?? 0);
  const lastSavedScrollTopRef = useRef(0);
  const latestReaderPositionRef = useRef({
    progress: item.readerProgress ?? 0,
    scrollTop: item.readerScrollTop ?? 0,
    updatedAt: Date.now(),
  });
  const canAutoSaveProgressRef = useRef(false);
  const resumePromptVisibleRef = useRef(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedProgress, setSavedProgress] = useState(item.readerProgress ?? 0);
  const [savedScrollTop, setSavedScrollTop] = useState(0);
  const [isChangingEncoding, setIsChangingEncoding] = useState(false);
  const [encodingError, setEncodingError] = useState("");
  const hasReadableText = Boolean(documentText);
  const progressLabel = savedScrollTop > 0 && savedProgress < 1 ? "<1" : String(Math.round(savedProgress));

  useEffect(() => {
    onPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    let isMounted = true;
    const fallbackProgress = item.readerProgress ?? 0;
    const fallbackScrollTop = item.readerScrollTop ?? 0;
    canAutoSaveProgressRef.current = false;
    resumePromptVisibleRef.current = false;
    lastSavedProgressRef.current = fallbackProgress;
    lastSavedScrollTopRef.current = fallbackScrollTop;
    latestReaderPositionRef.current = {
      progress: fallbackProgress,
      scrollTop: fallbackScrollTop,
      updatedAt: Date.now(),
    };
    setSavedProgress(fallbackProgress);
    setSavedScrollTop(fallbackScrollTop);
    setShowResumePrompt(false);
    window.scrollTo({ top: 0 });

    if (!hasReadableText) {
      return () => {
        isMounted = false;
      };
    }

    loadNativeReaderProgress(item.id)
      .catch(() => ({ progress: fallbackProgress, scrollTop: fallbackScrollTop }))
      .then((loadedPosition) => {
        if (!isMounted) {
          return;
        }

        const loadedScrollTop =
          loadedPosition && typeof loadedPosition === "object"
            ? loadedPosition.scrollTop ?? (loadedPosition as { scroll_top?: number }).scroll_top ?? 0
            : 0;
        const nextProgress = typeof loadedPosition === "number" ? loadedPosition : loadedPosition?.progress ?? fallbackProgress;
        const nextScrollTop = typeof loadedPosition === "number" ? fallbackScrollTop : loadedScrollTop;
        lastSavedProgressRef.current = nextProgress;
        lastSavedScrollTopRef.current = nextScrollTop;
        latestReaderPositionRef.current = {
          progress: nextProgress,
          scrollTop: nextScrollTop,
          updatedAt: Date.now(),
        };
        setSavedProgress(nextProgress);
        setSavedScrollTop(nextScrollTop);
        onPatchRef.current({ readerProgress: nextProgress, readerScrollTop: nextScrollTop });

        if (hasReadableText && nextScrollTop > 400) {
          resumePromptVisibleRef.current = true;
          setShowResumePrompt(true);
          canAutoSaveProgressRef.current = false;
          return;
        }

        canAutoSaveProgressRef.current = true;
      });

    return () => {
      isMounted = false;
    };
  }, [hasReadableText, item.id]);

  useEffect(() => {
    if (!hasReadableText || canAutoSaveProgressRef.current || resumePromptVisibleRef.current) {
      return;
    }

    const nextScrollTop = item.readerScrollTop ?? 0;
    if (nextScrollTop <= 400) {
      return;
    }

    const nextProgress = item.readerProgress ?? 0;
    lastSavedProgressRef.current = nextProgress;
    lastSavedScrollTopRef.current = nextScrollTop;
    setSavedProgress(nextProgress);
    setSavedScrollTop(nextScrollTop);
    resumePromptVisibleRef.current = true;
    setShowResumePrompt(true);
  }, [hasReadableText, item.id, item.readerProgress, item.readerScrollTop]);

  useEffect(() => {
    let frame = 0;
    let interval = 0;

    function getScrollPosition() {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const scrollTop = window.scrollY || scrollingElement.scrollTop || document.body.scrollTop || 0;
      const scrollableHeight = scrollingElement.scrollHeight - window.innerHeight;
      if (scrollableHeight <= 0) {
        return null;
      }

      const position = {
        progress: Math.min(100, Math.max(0, (scrollTop / scrollableHeight) * 100)),
        scrollTop,
      };
      latestReaderPositionRef.current = { ...position, updatedAt: Date.now() };
      return position;
    }

    function saveScrollProgress() {
      if (!canAutoSaveProgressRef.current || resumePromptVisibleRef.current) {
        return;
      }

      const nextPosition = getScrollPosition();
      if (nextPosition === null) {
        return;
      }

      const roundedProgress = Math.round(nextPosition.progress * 10) / 10;
      const roundedScrollTop = Math.round(nextPosition.scrollTop);
      if (
        Math.abs(roundedProgress - lastSavedProgressRef.current) < 1 &&
        Math.abs(roundedScrollTop - lastSavedScrollTopRef.current) < 300 &&
        roundedProgress < 99.5
      ) {
        return;
      }

      lastSavedProgressRef.current = roundedProgress;
      lastSavedScrollTopRef.current = roundedScrollTop;
      setSavedProgress(roundedProgress);
      setSavedScrollTop(roundedScrollTop);
      onPatchRef.current({ readerProgress: roundedProgress, readerScrollTop: roundedScrollTop });
      saveBrowserItemProgress(item.id, { readerProgress: roundedProgress, readerScrollTop: roundedScrollTop });
      saveNativeReaderProgress(
        item.id,
        roundedProgress,
        roundedScrollTop,
        latestReaderPositionRef.current.updatedAt,
      ).catch(() => {
        // Browser preview cannot call Tauri commands; item state still keeps the value for this session.
      });
    }

    function handleScroll() {
      getScrollPosition();
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          saveScrollProgress();
        });
      }
    }

    async function flushScrollProgress() {
      await encodingChangeRef.current;
      if (!canAutoSaveProgressRef.current || resumePromptVisibleRef.current) return;
      getScrollPosition();
      const latestPosition = latestReaderPositionRef.current;
      const roundedProgress = Math.round(latestPosition.progress * 10) / 10;
      const roundedScrollTop = Math.round(latestPosition.scrollTop);
      lastSavedProgressRef.current = roundedProgress;
      lastSavedScrollTopRef.current = roundedScrollTop;
      onPatchRef.current({ readerProgress: roundedProgress, readerScrollTop: roundedScrollTop });
      saveBrowserItemProgress(item.id, { readerProgress: roundedProgress, readerScrollTop: roundedScrollTop });
      await saveNativeReaderProgress(item.id, roundedProgress, roundedScrollTop, latestPosition.updatedAt);
    }

    const handlePageHide = () => {
      void flushScrollProgress().catch(() => undefined);
    };
    onCloseFlushChange(flushScrollProgress);

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    interval = window.setInterval(saveScrollProgress, 900);
    return () => {
      void flushScrollProgress().catch(() => undefined);
      onCloseFlushChange(null);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      if (interval) {
        window.clearInterval(interval);
      }
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [item.id, onCloseFlushChange]);

  function scrollToPosition(nextScrollTop: number) {
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({
      top: Math.min(Math.max(0, nextScrollTop), Math.max(0, scrollableHeight)),
      behavior: "smooth",
    });
  }

  function resumeReading() {
    resumePromptVisibleRef.current = false;
    setShowResumePrompt(false);
    canAutoSaveProgressRef.current = true;
    window.requestAnimationFrame(() => scrollToPosition(savedScrollTop));
  }

  function restartReading() {
    const updatedAt = Date.now();
    resumePromptVisibleRef.current = false;
    setShowResumePrompt(false);
    canAutoSaveProgressRef.current = true;
    lastSavedProgressRef.current = 0;
    lastSavedScrollTopRef.current = 0;
    latestReaderPositionRef.current = { progress: 0, scrollTop: 0, updatedAt };
    setSavedProgress(0);
    setSavedScrollTop(0);
    onPatch({ readerProgress: 0, readerScrollTop: 0 });
    saveBrowserItemProgress(item.id, { readerProgress: 0, readerScrollTop: 0 });
    saveNativeReaderProgress(item.id, 0, 0, updatedAt).catch(() => {
      // Browser preview cannot call Tauri commands; item state still keeps the value for this session.
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function changeTextEncoding(nextEncoding: TextEncoding) {
    if (item.source !== "path" || isChangingEncoding) return;
    const operation = (async () => {
      setIsChangingEncoding(true);
      setEncodingError("");
      try {
        const textContent = await readNativeTextFile(item.location, item.id, nextEncoding);
        await saveNativeTextEncoding(item.id, nextEncoding);
        onPatch({ textContent, textEncoding: nextEncoding });
      } catch {
        setEncodingError(t("encodingReadFailed"));
      } finally {
        setIsChangingEncoding(false);
      }
    })();
    encodingChangeRef.current = operation;
    await operation;
  }

  return (
    <section className="readerPage">
      <div className="readerPageHeader">
        <div>
          <span className="eyebrow">{getCollectionLabel(item.collection, t)}</span>
          <h1>{getItemTitle(item, t)}</h1>
          <p>{t("readerAutoSave")} - {progressLabel}%</p>
          {item.source === "path" && isNativeRuntime() && (
            <div className="readerEncodingGroup">
              <label className="readerEncodingControl">
                {t("textEncoding")}
                <select
                  value={item.textEncoding ?? "auto"}
                  disabled={isChangingEncoding}
                  onChange={(event) => void changeTextEncoding(event.target.value as TextEncoding)}
                >
                  {textEncodingOptions.map((option) => (
                    <option value={option.value} key={option.value}>{t(option.label)}</option>
                  ))}
                </select>
              </label>
              {(item.textEncoding ?? "auto") === "auto" && (
                <small className="readerEncodingHint">{t("encodingAutoHint")}</small>
              )}
            </div>
          )}
          {encodingError && <span className="readerEncodingError" role="alert">{encodingError}</span>}
        </div>
        <button type="button" onClick={onBack}>{t("backToLibrary")}</button>
      </div>
      {showResumePrompt && (
        <div className="resumePrompt" role="dialog" aria-label={t("resumeReadingTitle")}>
          <div>
            <strong>{t("resumeReadingTitle")}</strong>
            <p>{t("resumeReadingText").replace("{progress}", progressLabel)}</p>
          </div>
          <div className="resumeActions">
            <button type="button" onClick={resumeReading}>{t("resumeYes")}</button>
            <button type="button" onClick={restartReading}>{t("resumeNo")}</button>
          </div>
        </div>
      )}
      <article
        className="readerPageBody"
        style={{
          borderColor: item.accent,
          fontSize: theme.readerFontSize,
          lineHeight: theme.lineHeight,
          maxWidth: theme.readerWidth,
        }}
      >
        <DocumentTextView item={item} text={documentText} fallbackText={fallbackText} />
      </article>
    </section>
  );
}

