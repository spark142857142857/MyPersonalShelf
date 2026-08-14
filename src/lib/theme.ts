import type { DashboardCardDensity, ReaderOpenMode, ThemePresetName, ThemeSettings } from "../types";
import { isThemePresetId, matchPreset, themePresets } from "./themePresets";

/**
 * The colours the app shipped with before presets existed. A theme still
 * carrying exactly these was never customised, so it can be moved onto the
 * paper preset without losing anyone's choice. Anything else is left alone and
 * reported as "custom".
 */
const legacyDefaultColours = {
  background: "#f3f6f4",
  surface: "#ffffff",
  text: "#202622",
  muted: "#68736c",
};

export const defaultTheme: ThemeSettings = {
  themePreset: "paper",
  background: themePresets.paper.background,
  surface: themePresets.paper.surface,
  text: themePresets.paper.text,
  muted: themePresets.paper.muted,
  accent: themePresets.paper.suggestedAccent,
  readerWidth: 680,
  lineHeight: 1.8,
  readerFontSize: 15,
  readerOpenMode: "window",
  dashboardCardDensity: "large",
};

const densities: DashboardCardDensity[] = ["large", "normal", "small"];

function normalizeDashboardCardDensity(value: unknown, legacyCompact?: unknown): DashboardCardDensity {
  if (value === "large" || value === "comfortable") return "large";
  if (value === "normal" || value === "compact") return "normal";
  if (value === "small" || value === "dense") return "small";
  if (typeof value === "string" && densities.includes(value as DashboardCardDensity)) {
    return value as DashboardCardDensity;
  }
  if (legacyCompact === true) {
    return "normal";
  }
  return "large";
}

function normalizeReaderOpenMode(value: unknown): ReaderOpenMode {
  return value === "embedded" ? "embedded" : "window";
}

function isLegacyDefaultPalette(colours: {
  background: string;
  surface: string;
  text: string;
  muted: string;
}) {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return (
    same(colours.background, legacyDefaultColours.background) &&
    same(colours.surface, legacyDefaultColours.surface) &&
    same(colours.text, legacyDefaultColours.text) &&
    same(colours.muted, legacyDefaultColours.muted)
  );
}

/**
 * Reconciles the stored preset name with the stored colours.
 *
 * A named preset wins: its colours are copied over whatever was saved, so a
 * preset that gets retuned reaches everyone already on it. A theme with no
 * preset name is either the untouched old default, which moves to paper, or a
 * hand-picked set, which keeps its colours and is reported as custom.
 */
function resolvePalette(
  stored: Partial<ThemeSettings>,
): Pick<ThemeSettings, "themePreset" | "background" | "surface" | "text" | "muted"> {
  const colours = {
    background: stored.background ?? defaultTheme.background,
    surface: stored.surface ?? defaultTheme.surface,
    text: stored.text ?? defaultTheme.text,
    muted: stored.muted ?? defaultTheme.muted,
  };

  if (isThemePresetId(stored.themePreset)) {
    const preset = themePresets[stored.themePreset];
    return {
      themePreset: stored.themePreset,
      background: preset.background,
      surface: preset.surface,
      text: preset.text,
      muted: preset.muted,
    };
  }

  if (stored.themePreset === "custom") {
    return { themePreset: "custom", ...colours };
  }

  // No preset recorded: data written before presets existed.
  if (isLegacyDefaultPalette(colours)) {
    const paper = themePresets.paper;
    return {
      themePreset: "paper",
      background: paper.background,
      surface: paper.surface,
      text: paper.text,
      muted: paper.muted,
    };
  }

  const matched: ThemePresetName = matchPreset(colours) ?? "custom";
  return { themePreset: matched, ...colours };
}

export function normalizeThemeSettings(
  value: Partial<ThemeSettings> & { compactCards?: boolean } = {},
): ThemeSettings {
  const { compactCards: legacyCompactCards, ...rest } = value;
  return {
    ...defaultTheme,
    ...rest,
    ...resolvePalette(value),
    readerOpenMode: normalizeReaderOpenMode(value.readerOpenMode),
    dashboardCardDensity: normalizeDashboardCardDensity(
      value.dashboardCardDensity,
      legacyCompactCards,
    ),
  };
}
