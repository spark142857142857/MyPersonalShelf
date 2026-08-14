// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../lib/i18n";
import { defaultTheme } from "../lib/theme";
import { applyPreset, themePresets } from "../lib/themePresets";
import type { ThemeSettings } from "../types";
import { CustomizePanel } from "./CustomizePanel";

afterEach(cleanup);

function renderPanel(theme: Partial<ThemeSettings> = {}) {
  const onChange = vi.fn();
  render(
    <CustomizePanel
      theme={{ ...defaultTheme, ...theme }}
      items={[]}
      dashboardLayouts={[]}
      t={(key: MessageKey) => key}
      onChange={onChange}
      onMoveDashboardCard={vi.fn()}
      onCycleDashboardCardSize={vi.fn()}
      onToggleDashboardCardHidden={vi.fn()}
      onReset={vi.fn()}
    />,
  );
  return onChange;
}

describe("CustomizePanel palettes", () => {
  it("offers every palette and marks the current one", () => {
    renderPanel({ themePreset: "sepia" });
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "themeSepia", pressed: true })).toBeTruthy();
  });

  it("writes the palette's colours, not just its name", async () => {
    const onChange = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "themeNight" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        themePreset: "night",
        background: themePresets.night.background,
        muted: themePresets.night.muted,
      }),
    );
  });

  it("keeps the accent when the palette changes", async () => {
    const onChange = renderPanel({ accent: "#123456" });
    await userEvent.click(screen.getByRole("button", { name: "themeMist" }));
    expect(onChange.mock.calls[0][0].accent).toBe("#123456");
  });

  it("leaves custom colours alone until a palette is chosen", () => {
    renderPanel({ themePreset: "custom" });
    expect(screen.getByText("themePresetCustom")).toBeTruthy();
  });
});

describe("CustomizePanel accent warning", () => {
  it("stays quiet for an accent that reads", () => {
    renderPanel();
    expect(screen.queryByText(/accentTextWarning|accentLabelWarning/)).toBeNull();
  });

  it("warns when a dark accent is kept on a dark palette", () => {
    renderPanel(applyPreset({ ...defaultTheme, accent: "#2d6f62" }, "night"));
    expect(screen.getByText(/accentTextWarning/)).toBeTruthy();
  });

  it("offers the palette's own accent as the way out", async () => {
    const onChange = renderPanel(applyPreset({ ...defaultTheme, accent: "#2d6f62" }, "night"));
    await userEvent.click(screen.getByRole("button", { name: "useSuggestedAccent" }));
    expect(onChange.mock.calls[0][0].accent).toBe(themePresets.night.suggestedAccent);
  });

  it("catches the pale accent the old hardcoded white could not", () => {
    renderPanel({ accent: "#ffdd00" });
    expect(screen.getByText(/accentTextWarning|accentLabelWarning/)).toBeTruthy();
  });
});
