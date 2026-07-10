import { Upload, X } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { MessageKey } from "../lib/i18n";
import type { ContentSource, ContentType } from "../types";

export type AddMode = "manual" | "upload";

export interface DraftItem {
  title: string;
  type: ContentType;
  source: ContentSource;
  location: string;
  collection: string;
  tags: string;
  accent: string;
  summary: string;
  textContent: string;
}

const contentTypes: ContentType[] = ["document", "video", "audio", "image", "link", "folder"];

interface AddContentModalProps {
  mode: AddMode;
  draft: DraftItem;
  t: (key: MessageKey) => string;
  getTypeLabel: (type: ContentType) => string;
  onModeChange: (mode: AddMode) => void;
  onDraftChange: (draft: DraftItem) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onFile: (file: File) => void;
  onNativeFile: () => void;
  onNativeFolder: () => void;
  onClose: () => void;
}

export function AddContentModal({
  mode,
  draft,
  t,
  getTypeLabel,
  onModeChange,
  onDraftChange,
  onSubmit,
  onFile,
  onNativeFile,
  onNativeFolder,
  onClose,
}: AddContentModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, onClose);

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modalPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-content-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="sectionTitle">
          <h2 id="add-content-title">{t("addContentTitle")}</h2>
          <button className="iconButton" type="button" aria-label={t("close")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="filterRow">
          <button className={mode === "manual" ? "active" : ""} type="button" onClick={() => onModeChange("manual")}>
            {t("manual")}
          </button>
          <button className={mode === "upload" ? "active" : ""} type="button" onClick={() => onModeChange("upload")}>
            {t("uploadPreview")}
          </button>
          <button type="button" onClick={onNativeFile}>{t("nativeFile")}</button>
          <button type="button" onClick={onNativeFolder}>{t("nativeFolder")}</button>
        </div>

        {mode === "upload" ? (
          <label className="uploadBox">
            <Upload size={24} />
            {t("uploadPrompt")}
            <input
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
              }}
            />
          </label>
        ) : (
          <form className="formGrid" onSubmit={onSubmit}>
            <label>
              {t("title")}
              <input required value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} />
            </label>
            <label>
              {t("type")}
              <select value={draft.type} onChange={(event) => onDraftChange({ ...draft, type: event.target.value as ContentType })}>
                {contentTypes.map((type) => <option key={type} value={type}>{getTypeLabel(type)}</option>)}
              </select>
            </label>
            <label>
              {t("source")}
              <select value={draft.source} onChange={(event) => onDraftChange({ ...draft, source: event.target.value as ContentSource })}>
                <option value="path">{t("pathOption")}</option>
                <option value="url">{t("urlOption")}</option>
                <option value="note">{t("noteOption")}</option>
              </select>
            </label>
            <label>
              {t("locationLabel")}
              <input
                required={draft.source !== "note"}
                value={draft.location}
                onChange={(event) => onDraftChange({ ...draft, location: event.target.value })}
              />
            </label>
            <label>
              {t("collection")}
              <input value={draft.collection} onChange={(event) => onDraftChange({ ...draft, collection: event.target.value })} />
            </label>
            <label>
              {t("tagsComma")}
              <input value={draft.tags} onChange={(event) => onDraftChange({ ...draft, tags: event.target.value })} />
            </label>
            <label>
              {t("accent")}
              <input type="color" value={draft.accent} onChange={(event) => onDraftChange({ ...draft, accent: event.target.value })} />
            </label>
            <label className="spanTwo">
              {t("summaryNotes")}
              <textarea value={draft.summary} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} />
            </label>
            <label className="spanTwo">
              {t("documentText")}
              <textarea
                maxLength={500_000}
                value={draft.textContent}
                onChange={(event) => onDraftChange({ ...draft, textContent: event.target.value })}
              />
            </label>
            <button className="primaryButton spanTwo" type="submit">{t("addToShelf")}</button>
          </form>
        )}
      </section>
    </div>
  );
}
