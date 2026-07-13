import { describe, expect, it } from "vitest";
import { defaultTheme, normalizeThemeSettings } from "./theme";

describe("normalizeThemeSettings", () => {
  it("defaults to large density", () => {
    expect(normalizeThemeSettings({}).dashboardCardDensity).toBe("large");
    expect(defaultTheme.dashboardCardDensity).toBe("large");
  });

  it("migrates legacy compactCards boolean", () => {
    expect(normalizeThemeSettings({ compactCards: true }).dashboardCardDensity).toBe("normal");
    expect(normalizeThemeSettings({ compactCards: false }).dashboardCardDensity).toBe("large");
  });

  it("migrates previous density keys", () => {
    expect(normalizeThemeSettings({ dashboardCardDensity: "comfortable" as never }).dashboardCardDensity).toBe(
      "large",
    );
    expect(normalizeThemeSettings({ dashboardCardDensity: "compact" as never }).dashboardCardDensity).toBe(
      "normal",
    );
    expect(normalizeThemeSettings({ dashboardCardDensity: "dense" as never }).dashboardCardDensity).toBe(
      "small",
    );
  });

  it("prefers explicit density over legacy compactCards", () => {
    expect(
      normalizeThemeSettings({ dashboardCardDensity: "small", compactCards: true }).dashboardCardDensity,
    ).toBe("small");
  });
});
