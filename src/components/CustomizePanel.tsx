import { ArrowDown, ArrowUp, Eye, EyeOff, Grid3X3 } from "lucide-react";
import type { MessageKey } from "../lib/i18n";
import { getCollectionLabel, getItemTitle, getSizeLabel } from "../lib/shelfDisplay";
import type { ContentItem, DashboardLayoutItem, ThemeSettings } from "../types";
import { typeIcons } from "./icons";

export function CustomizePanel({
  theme,
  items,
  dashboardLayouts,
  t,
  onChange,
  onMoveDashboardCard,
  onCycleDashboardCardSize,
  onToggleDashboardCardHidden,
  onReset,
}: {
  theme: ThemeSettings;
  items: ContentItem[];
  dashboardLayouts: DashboardLayoutItem[];
  t: (key: MessageKey) => string;
  onChange: (theme: ThemeSettings) => void;
  onMoveDashboardCard: (itemId: string, direction: -1 | 1) => void;
  onCycleDashboardCardSize: (itemId: string) => void;
  onToggleDashboardCardHidden: (itemId: string) => void;
  onReset: () => void;
}) {
  const visibleLayoutCount = dashboardLayouts.filter((layout) => !layout.hidden).length;
  const hiddenLayoutCount = dashboardLayouts.length - visibleLayoutCount;

  return (
    <section className="customizeWorkspace">
      <div className="customizeHeader">
        <div>
          <span className="eyebrow">{t("customizeEyebrow")}</span>
          <h1>{t("customizeTitle")}</h1>
        </div>
        <button type="button" onClick={onReset}>{t("resetTheme")}</button>
      </div>

      <div className="customizeControls">
          <section className="settingsGroup">
            <div className="groupHeading">
              <h2>{t("identityAndMood")}</h2>
              <span>{t("savedLocalStorage")}</span>
            </div>
            <div className="colorControlGrid">
              <ColorControl label={t("background")} value={theme.background} onChange={(value) => onChange({ ...theme, background: value })} />
              <ColorControl label={t("surface")} value={theme.surface} onChange={(value) => onChange({ ...theme, surface: value })} />
              <ColorControl label={t("text")} value={theme.text} onChange={(value) => onChange({ ...theme, text: value })} />
              <ColorControl label={t("accent")} value={theme.accent} onChange={(value) => onChange({ ...theme, accent: value })} />
            </div>
          </section>

          <section className="settingsGroup">
            <div className="groupHeading">
              <h2>{t("readingComfort")}</h2>
              <span>{t("readerPreview")}</span>
            </div>
            <label className="rangeControl">
              <span>{t("readerWidth")}</span>
              <strong>{theme.readerWidth}px</strong>
              <input
                type="range"
                min="420"
                max="960"
                value={theme.readerWidth}
                onChange={(event) => onChange({ ...theme, readerWidth: Number(event.target.value) })}
              />
            </label>
            <label className="rangeControl">
              <span>{t("lineHeight")}</span>
              <strong>{theme.lineHeight}</strong>
              <input
                type="range"
                min="1.2"
                max="2.4"
                step="0.1"
                value={theme.lineHeight}
                onChange={(event) => onChange({ ...theme, lineHeight: Number(event.target.value) })}
              />
            </label>
            <label className="rangeControl">
              <span>{t("readerFontSize")}</span>
              <strong>{theme.readerFontSize}px</strong>
              <input
                type="range"
                min="13"
                max="22"
                value={theme.readerFontSize}
                onChange={(event) => onChange({ ...theme, readerFontSize: Number(event.target.value) })}
              />
            </label>
            <div
              className="readerSample"
              style={{ fontSize: theme.readerFontSize, maxWidth: theme.readerWidth, lineHeight: theme.lineHeight }}
            >
              <strong>{t("readerSampleTitle")}</strong>
              <p>{t("readerSampleText")}</p>
            </div>
          </section>

          <section className="settingsGroup">
            <div className="groupHeading">
              <h2>{t("homeLayout")}</h2>
              <span>{visibleLayoutCount} {t("layoutVisible")} / {hiddenLayoutCount} {t("layoutHidden")}</span>
            </div>
            <p className="groupDescription">{t("homeLayoutHint")}</p>
            <div className="controlRow">
              <span>{t("dashboardCardDensity")}</span>
              <div className="segmentedControl densityControl" aria-label={t("dashboardCardDensity")}>
                {(
                  [
                    ["large", "densityLarge"],
                    ["normal", "densityNormal"],
                    ["small", "densitySmall"],
                  ] as const
                ).map(([value, labelKey]) => (
                  <button
                    className={theme.dashboardCardDensity === value ? "active" : ""}
                    type="button"
                    key={value}
                    onClick={() => onChange({ ...theme, dashboardCardDensity: value })}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="layoutList">
              {dashboardLayouts.map((layout, index) => {
                const item = items.find((candidate) => candidate.id === layout.itemId);
                if (!item) {
                  return null;
                }

                return (
                  <div className={`layoutItem ${layout.hidden ? "muted" : ""}`} key={layout.itemId}>
                    <div className={`layoutMiniCard ${layout.size}`} style={{ borderColor: item.accent }}>
                      <span className="layoutOrder">{index + 1}</span>
                      <span className="layoutMiniIcon" style={{ color: item.accent }}>
                        {typeIcons[item.type]}
                      </span>
                      <span className="layoutMiniText">
                        <strong>{getItemTitle(item, t)}</strong>
                        <small>{getCollectionLabel(item.collection, t)}</small>
                      </span>
                      <span className="layoutBadges">
                        <b>{getSizeLabel(layout.size, t)}</b>
                        <b>{layout.hidden ? t("layoutHidden") : t("layoutVisible")}</b>
                      </span>
                    </div>
                    <div className="layoutActions">
                      <button type="button" disabled={index === 0} onClick={() => onMoveDashboardCard(layout.itemId, -1)} title={t("moveUp")}>
                        <ArrowUp size={15} />
                        {t("moveUp")}
                      </button>
                      <button
                        type="button"
                        disabled={index === dashboardLayouts.length - 1}
                        onClick={() => onMoveDashboardCard(layout.itemId, 1)}
                        title={t("moveDown")}
                      >
                        <ArrowDown size={15} />
                        {t("moveDown")}
                      </button>
                      <button type="button" onClick={() => onCycleDashboardCardSize(layout.itemId)} title={t("changeSize")}>
                        <Grid3X3 size={15} />
                        {t("changeSize")}
                      </button>
                      <button type="button" onClick={() => onToggleDashboardCardHidden(layout.itemId)} title={layout.hidden ? t("showCard") : t("hideCard")}>
                        {layout.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                        {layout.hidden ? t("showCard") : t("hideCard")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
      </div>
    </section>
  );
}


export function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="colorControl">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      <strong>{value}</strong>
    </label>
  );
}
