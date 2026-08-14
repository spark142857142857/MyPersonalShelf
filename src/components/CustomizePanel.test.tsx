// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCount, getMessage, type Language, type MessageKey } from "../lib/i18n";
import { defaultTheme } from "../lib/theme";
import { applyPreset, themePresets } from "../lib/themePresets";
import type { ContentItem, DashboardLayoutItem, ThemeSettings } from "../types";
import { CustomizePanel } from "./CustomizePanel";

afterEach(cleanup);

function layoutItem(id: string, hidden: boolean, order: number): DashboardLayoutItem {
  return { itemId: id, order, size: "standard", hidden };
}

function layoutCard(id: string): ContentItem {
  return {
    id,
    title: id,
    type: "document",
    source: "path",
    location: `C:/shelf/${id}.txt`,
    collection: "Reading",
    tags: [],
    accent: "#2563eb",
    isFavorite: false,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPanel(
  theme: Partial<ThemeSettings> = {},
  props: Partial<Parameters<typeof CustomizePanel>[0]> = {},
) {
  const onChange = vi.fn();
  render(
    <CustomizePanel
      theme={{ ...defaultTheme, ...theme }}
      items={[]}
      dashboardLayouts={[]}
      t={(key: MessageKey) => key}
      tCount={(count: number, key: MessageKey) => `${count} ${key}`}
      onChange={onChange}
      onMoveDashboardCard={vi.fn()}
      onCycleDashboardCardSize={vi.fn()}
      onToggleDashboardCardHidden={vi.fn()}
      onReset={vi.fn()}
      {...props}
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

describe("CustomizePanel layout summary", () => {
  function renderSummary(language: Language) {
    renderPanel(
      {},
      {
        items: [layoutCard("kept"), layoutCard("tucked")],
        dashboardLayouts: [layoutItem("kept", false, 0), layoutItem("tucked", true, 1)],
        t: (key: MessageKey) => getMessage(language, key),
        tCount: (count: number, key: MessageKey) => formatCount(language, count, key),
      },
    );
  }

  it("joins the counts the way each language does", () => {
    renderSummary("en");
    expect(screen.getByText("1 visible / 1 hidden")).toBeTruthy();

    cleanup();
    renderSummary("ko");
    // The counter belongs to the number in Korean: "1개 표시", not "1 개 표시".
    expect(screen.getByText("1개 표시 / 1개 숨김")).toBeTruthy();
  });

  it("leaves the per-card badges without a counter", () => {
    renderSummary("ko");
    // layoutVisible/layoutHidden label one card, so they stay bare even though
    // the summary above them counts with visible/hidden. Adding a counter to
    // them to fix the summary would break these.
    const badges = Array.from(document.querySelectorAll(".layoutBadges b")).map(
      (badge) => badge.textContent,
    );
    expect(badges).toContain("표시");
    expect(badges).toContain("숨김");
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
