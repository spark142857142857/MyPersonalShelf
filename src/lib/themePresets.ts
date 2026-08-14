import type { ThemePresetName, ThemeSettings } from "../types";

/**
 * The four structural colours, chosen together rather than picked one at a time.
 *
 * The app used to expose background, surface and text as free colour pickers
 * while `muted` stayed fixed at a mid grey. That combination cannot be made to
 * work: pick a dark background and the secondary text keeps its light-theme
 * grey and stops being readable. Presets exist so every combination on offer is
 * one that has been measured.
 *
 * The accent stays a free choice — it sits on top of these rather than holding
 * the page together, so a bad accent is ugly rather than unreadable, and it is
 * checked separately against the surface it lands on.
 */
export type ThemePresetId = Exclude<ThemePresetName, "custom">;

export interface ThemePreset {
  id: ThemePresetId;
  /** Whether text sits light-on-dark, so the UI can group and describe them. */
  scheme: "light" | "dark";
  background: string;
  surface: string;
  text: string;
  muted: string;
  /** An accent that suits this preset, offered when switching to it. */
  suggestedAccent: string;
}

export const themePresets: Record<ThemePresetId, ThemePreset> = {
  paper: {
    id: "paper",
    scheme: "light",
    background: "#f1ede4",
    surface: "#fffdf8",
    text: "#26221c",
    muted: "#5f584d",
    suggestedAccent: "#2d6f62",
  },
  linen: {
    id: "linen",
    scheme: "light",
    background: "#eeeeea",
    surface: "#fbfbf8",
    text: "#232421",
    muted: "#5d5f59",
    suggestedAccent: "#4a5d6e",
  },
  sepia: {
    id: "sepia",
    scheme: "light",
    background: "#ebe0cd",
    surface: "#f9f2e3",
    text: "#33291b",
    muted: "#6b5c43",
    suggestedAccent: "#8a5a2b",
  },
  mist: {
    id: "mist",
    scheme: "light",
    background: "#eaeef1",
    surface: "#fbfcfd",
    text: "#1c2226",
    muted: "#565f66",
    suggestedAccent: "#37627d",
  },
  night: {
    id: "night",
    scheme: "dark",
    background: "#171a19",
    surface: "#232725",
    text: "#e9e7e2",
    muted: "#a7a29a",
    suggestedAccent: "#79b4a4",
  },
  ink: {
    id: "ink",
    scheme: "dark",
    background: "#0e1013",
    surface: "#181b1f",
    text: "#f1f0ed",
    muted: "#a3a9af",
    suggestedAccent: "#7fa8d6",
  },
};

export const themePresetIds = Object.keys(themePresets) as ThemePresetId[];

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === "string" && value in themePresets;
}

/* ---- Contrast ---------------------------------------------------------- */

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio, 1 (identical) to 21 (black on white). Returns null when
 * either colour cannot be read, so callers can tell "unknown" from "poor".
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return null;
  const lighter = Math.max(luminance(fg), luminance(bg));
  const darker = Math.min(luminance(fg), luminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal-size text. */
export const AA_NORMAL_TEXT = 4.5;

export interface ContrastCheck {
  pair: string;
  ratio: number | null;
  passesAA: boolean;
}

/**
 * Every pairing a preset is responsible for. Both text colours are checked
 * against both grounds, because a card sits on the surface while the page
 * behind it is the background and body text lands on each.
 */
export function checkPreset(preset: ThemePreset): ContrastCheck[] {
  const pairs: Array<[string, string, string]> = [
    ["text on surface", preset.text, preset.surface],
    ["text on background", preset.text, preset.background],
    ["muted on surface", preset.muted, preset.surface],
    ["muted on background", preset.muted, preset.background],
  ];
  return pairs.map(([pair, fg, bg]) => {
    const ratio = contrastRatio(fg, bg);
    return { pair, ratio, passesAA: ratio !== null && ratio >= AA_NORMAL_TEXT };
  });
}

/**
 * The text colour to put on top of a solid accent fill.
 *
 * The app used to hardcode white there. That is fine for a dark teal and badly
 * wrong for a pale one: white on a light accent is unreadable, which the free
 * colour picker has always allowed and which every dark preset would hit,
 * since those need a light accent to read against their own background.
 * Choosing per accent rather than per theme fixes both at once.
 */
export function onAccentColor(accent: string): string {
  const onWhite = contrastRatio("#ffffff", accent);
  const onInk = contrastRatio("#1a1a1a", accent);
  if (onWhite === null || onInk === null) return "#ffffff";
  return onWhite >= onInk ? "#ffffff" : "#1a1a1a";
}

/**
 * Whether a freely chosen accent stays legible as a solid button fill — with
 * whichever text colour would actually be placed on it — and as a text colour
 * on the preset's surface.
 */
export function checkAccent(accent: string, preset: ThemePreset): ContrastCheck[] {
  return [
    { pair: "label on accent", ...ratioOf(contrastRatio(onAccentColor(accent), accent)) },
    { pair: "accent on surface", ...ratioOf(contrastRatio(accent, preset.surface)) },
  ];
}

function ratioOf(ratio: number | null) {
  return { ratio, passesAA: ratio !== null && ratio >= AA_NORMAL_TEXT };
}

/** The colour fields a preset writes into the stored theme. */
export function applyPreset(theme: ThemeSettings, id: ThemePresetId): ThemeSettings {
  const preset = themePresets[id];
  return {
    ...theme,
    themePreset: id,
    background: preset.background,
    surface: preset.surface,
    text: preset.text,
    muted: preset.muted,
  };
}

/**
 * The preset whose four colours a stored theme already matches, or null when it
 * carries a custom set from before presets existed.
 */
export function matchPreset(theme: Pick<ThemeSettings, "background" | "surface" | "text" | "muted">) {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return (
    themePresetIds.find((id) => {
      const preset = themePresets[id];
      return (
        same(theme.background, preset.background) &&
        same(theme.surface, preset.surface) &&
        same(theme.text, preset.text) &&
        same(theme.muted, preset.muted)
      );
    }) ?? null
  );
}

/**
 * The preset closest to an arbitrary colour set, by squared distance between
 * the background and text colours. Used to place a theme saved before presets
 * existed onto the nearest one rather than dropping the user somewhere random.
 */
export function nearestPreset(
  theme: Pick<ThemeSettings, "background" | "surface" | "text">,
): ThemePresetId {
  const bg = parseHex(theme.background);
  const text = parseHex(theme.text);
  if (!bg || !text) return "paper";

  let best: ThemePresetId = "paper";
  let bestDistance = Infinity;
  for (const id of themePresetIds) {
    const preset = themePresets[id];
    const presetBg = parseHex(preset.background);
    const presetText = parseHex(preset.text);
    if (!presetBg || !presetText) continue;
    const distance =
      presetBg.reduce((sum, channel, i) => sum + (channel - bg[i]) ** 2, 0) +
      presetText.reduce((sum, channel, i) => sum + (channel - text[i]) ** 2, 0);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}
