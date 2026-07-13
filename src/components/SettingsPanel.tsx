import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { languageOptions, type Language, type MessageKey } from "../lib/i18n";
import type { ShelfRestoreMode } from "../lib/shelfImport";
import { getCollectionLabel, getItemLocation, getItemTitle } from "../lib/shelfDisplay";
import type { AppSettings, ContentItem, ReaderOpenMode, SearchEnterBehavior, ThemeSettings } from "../types";

export function SettingsPanel({
  appSettings,
  theme,
  language,
  itemCount,
  collectionCount,
  duplicateGroups,
  t,
  onAppSettingsChange,
  onThemeChange,
  onLanguageChange,
  onExportData,
  onRestoreFile,
  onOpenDuplicate,
  onKeepDuplicate,
}: {
  appSettings: AppSettings;
  theme: ThemeSettings;
  language: Language;
  itemCount: number;
  collectionCount: number;
  duplicateGroups: Array<{ key: string; items: ContentItem[] }>;
  t: (key: MessageKey) => string;
  onAppSettingsChange: (settings: AppSettings) => void;
  onThemeChange: (theme: ThemeSettings) => void;
  onLanguageChange: (language: Language) => void;
  onExportData: () => void;
  onRestoreFile: (file: File, mode: ShelfRestoreMode) => void;
  onOpenDuplicate: (itemId: string) => void;
  onKeepDuplicate: (keepId: string, groupIds: string[]) => void;
}) {
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const restoreModeRef = useRef<ShelfRestoreMode>("merge");

  return (
    <section className="settingsWorkspace">
      <div className="customizeHeader">
        <div>
          <span className="eyebrow">{t("settingsEyebrow")}</span>
          <h1>{t("settingsTitle")}</h1>
        </div>
      </div>

      <div className="settingsPageGrid">
        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsGeneral")}</h2>
            <span>{t("savedLocalStorage")}</span>
          </div>
          <label className="controlRow">
            <span>{t("language")}</span>
            <select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}>
              {languageOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsOpening")}</h2>
            <span>{t("readerOpenMode")}</span>
          </div>
          <div className="segmentedControl" aria-label={t("readerOpenMode")}>
            {(["window", "embedded"] as ReaderOpenMode[]).map((mode) => (
              <button
                className={theme.readerOpenMode === mode ? "active" : ""}
                type="button"
                key={mode}
                onClick={() => onThemeChange({ ...theme, readerOpenMode: mode })}
              >
                {mode === "window" ? t("readerOpenWindow") : t("readerOpenEmbedded")}
              </button>
            ))}
          </div>
          <p className="groupDescription">{t("readerOpenModeHint")}</p>
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsSearch")}</h2>
            <span>{t("searchContent")}</span>
          </div>
          <label className="toggleRow">
            <input
              type="checkbox"
              checked={appSettings.resetSearchOnNavigation}
              onChange={(event) => onAppSettingsChange({ ...appSettings, resetSearchOnNavigation: event.target.checked })}
            />
            <span>{t("resetSearchOnNavigation")}</span>
          </label>
          <label className="controlRow">
            <span>{t("searchEnterBehavior")}</span>
            <select
              value={appSettings.searchEnterBehavior}
              onChange={(event) =>
                onAppSettingsChange({ ...appSettings, searchEnterBehavior: event.target.value as SearchEnterBehavior })
              }
            >
              <option value="select">{t("searchEnterSelect")}</option>
              <option value="open">{t("searchEnterOpen")}</option>
            </select>
          </label>
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsData")}</h2>
            <span>{itemCount} {t("items")} / {collectionCount} {t("groups")}</span>
          </div>
          <p className="groupDescription">{t("settingsDataHint")}</p>
          <p className="groupDescription">{t("settingsDataMergeHint")}</p>
          <p className="groupDescription">{t("settingsDataReplaceHint")}</p>
          <div className="settingsActionStack">
            <button className="settingsActionButton" type="button" onClick={onExportData} title={t("exportData")}>
              <Download size={16} />
              {t("exportData")}
            </button>
            <button
              className="settingsActionButton"
              type="button"
              title={t("settingsDataMergeHint")}
              onClick={() => {
                restoreModeRef.current = "merge";
                restoreInputRef.current?.click();
              }}
            >
              <Upload size={16} />
              {t("restoreMerge")}
            </button>
            <button
              className="settingsActionButton"
              type="button"
              title={t("settingsDataReplaceHint")}
              onClick={() => {
                restoreModeRef.current = "replace";
                restoreInputRef.current?.click();
              }}
            >
              <Upload size={16} />
              {t("restoreReplace")}
            </button>
          </div>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onRestoreFile(file, restoreModeRef.current);
            }}
          />
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("duplicatesTitle")}</h2>
            <span>{duplicateGroups.length}</span>
          </div>
          <p className="groupDescription">{t("duplicatesHint")}</p>
          {duplicateGroups.length === 0 ? (
            <p className="emptyText">{t("duplicatesNone")}</p>
          ) : (
            <div className="duplicateGroupList">
              {duplicateGroups.map((group) => (
                <div className="duplicateGroup" key={group.key}>
                  <small>{group.items[0]?.location}</small>
                  {group.items.map((item) => (
                    <div className="duplicateRow" key={item.id}>
                      <button type="button" className="duplicateOpenButton" onClick={() => onOpenDuplicate(item.id)}>
                        <strong>{getItemTitle(item, t)}</strong>
                        <span>{getCollectionLabel(item.collection, t)}</span>
                      </button>
                      <button
                        type="button"
                        className="primaryButton"
                        onClick={() => onKeepDuplicate(item.id, group.items.map((entry) => entry.id))}
                      >
                        {t("duplicatesKeep")}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsAbout")}</h2>
            <span>MyPersonalShelf</span>
          </div>
          <div className="settingsInfoList">
            <span>{t("settingsStorage")}</span>
            <strong>{t("settingsStorageValue")}</strong>
            <span>{t("settingsAppMode")}</span>
            <strong>{t("settingsAppModeValue")}</strong>
          </div>
        </section>
      </div>
    </section>
  );
}

