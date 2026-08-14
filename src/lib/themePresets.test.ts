import { describe, expect, it } from "vitest";
import {
  AA_NORMAL_TEXT,
  applyPreset,
  checkAccent,
  checkPreset,
  contrastRatio,
  matchPreset,
  nearestPreset,
  onAccentColor,
  themePresetIds,
  themePresets,
} from "./themePresets";
import { defaultTheme } from "./theme";

describe("contrastRatio", () => {
  it("returns the known extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric and accepts short hex", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(contrastRatio("#000", "#fff")!, 5);
  });

  it("reports unreadable input as null rather than as poor contrast", () => {
    expect(contrastRatio("not a colour", "#ffffff")).toBeNull();
    expect(contrastRatio("#ffffff", "rgb(0,0,0)")).toBeNull();
  });
});

describe("preset palettes", () => {
  // The whole point of presets: every combination on offer has been measured.
  it.each(themePresetIds)("%s keeps all four pairings at AA", (id) => {
    for (const check of checkPreset(themePresets[id])) {
      expect(check.ratio, `${id} — ${check.pair}`).not.toBeNull();
      expect(check.ratio, `${id} — ${check.pair}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("offers an accent that works on its own preset, fill and text alike", () => {
    for (const id of themePresetIds) {
      const preset = themePresets[id];
      for (const check of checkAccent(preset.suggestedAccent, preset)) {
        expect(check.ratio, `${id} — ${check.pair}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
  });

  it("covers both schemes", () => {
    const schemes = themePresetIds.map((id) => themePresets[id].scheme);
    expect(schemes).toContain("light");
    expect(schemes).toContain("dark");
  });
});

describe("onAccentColor", () => {
  it("puts white on a dark accent and ink on a light one", () => {
    expect(onAccentColor("#2d6f62")).toBe("#ffffff");
    expect(onAccentColor("#79b4a4")).toBe("#1a1a1a");
  });

  it("rescues the case the old hardcoded white got wrong", () => {
    // Pale yellow was always selectable and always unreadable under white.
    const accent = "#ffdd00";
    expect(contrastRatio("#ffffff", accent)!).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrastRatio(onAccentColor(accent), accent)!).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("falls back to white rather than throwing on unreadable input", () => {
    expect(onAccentColor("rgb(0,0,0)")).toBe("#ffffff");
  });
});

describe("applyPreset", () => {
  it("writes the colours into the theme so old readers still work", () => {
    const next = applyPreset(defaultTheme, "night");
    expect(next.themePreset).toBe("night");
    expect(next.background).toBe(themePresets.night.background);
    expect(next.muted).toBe(themePresets.night.muted);
  });

  it("leaves the accent and every non-colour setting alone", () => {
    const next = applyPreset({ ...defaultTheme, accent: "#ff0000", readerWidth: 900 }, "sepia");
    expect(next.accent).toBe("#ff0000");
    expect(next.readerWidth).toBe(900);
  });
});

describe("matchPreset", () => {
  it("recognises a theme that already carries a preset's colours", () => {
    expect(matchPreset(applyPreset(defaultTheme, "mist"))).toBe("mist");
  });

  it("ignores case and stray whitespace", () => {
    const mist = themePresets.mist;
    expect(
      matchPreset({
        background: ` ${mist.background.toUpperCase()} `,
        surface: mist.surface,
        text: mist.text,
        muted: mist.muted,
      }),
    ).toBe("mist");
  });

  it("returns null for a hand-picked set", () => {
    expect(
      matchPreset({ background: "#123456", surface: "#ffffff", text: "#000000", muted: "#888888" }),
    ).toBeNull();
  });
});

describe("nearestPreset", () => {
  it("lands a dark custom theme on a dark preset", () => {
    const id = nearestPreset({ background: "#101010", surface: "#1a1a1a", text: "#eeeeee" });
    expect(themePresets[id].scheme).toBe("dark");
  });

  it("lands a light custom theme on a light preset", () => {
    const id = nearestPreset({ background: "#fafafa", surface: "#ffffff", text: "#111111" });
    expect(themePresets[id].scheme).toBe("light");
  });

  it("falls back to paper when the colours cannot be read", () => {
    expect(nearestPreset({ background: "teal", surface: "", text: "" })).toBe("paper");
  });
});
