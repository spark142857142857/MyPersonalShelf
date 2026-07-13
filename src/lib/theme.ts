import type { DashboardCardDensity, ReaderOpenMode, ThemeSettings } from "../types";

export const defaultTheme: ThemeSettings = {
  background: "#f3f6f4",
  surface: "#ffffff",
  text: "#202622",
  muted: "#68736c",
  accent: "#2d6f62",
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

export function normalizeThemeSettings(
  value: Partial<ThemeSettings> & { compactCards?: boolean } = {},
): ThemeSettings {
  const { compactCards: legacyCompactCards, ...rest } = value;
  return {
    ...defaultTheme,
    ...rest,
    readerOpenMode: normalizeReaderOpenMode(value.readerOpenMode),
    dashboardCardDensity: normalizeDashboardCardDensity(
      value.dashboardCardDensity,
      legacyCompactCards,
    ),
  };
}
