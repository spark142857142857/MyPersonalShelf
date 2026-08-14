// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MessageKey } from "../lib/i18n";
import type { ShelfHealthEntry, ShelfHealthKind } from "../lib/shelfHealth";
import type { ContentItem } from "../types";
import { DashboardView } from "./DashboardView";

afterEach(cleanup);

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    title: "Lecture notes",
    type: "document",
    source: "note",
    location: "note",
    collection: "Reading",
    tags: [],
    accent: "#2563eb",
    isFavorite: true,
    openCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderDashboard({
  items = [item()],
  healthEntries = [],
  onOpenItem = vi.fn(),
  onToggleFavorite = vi.fn(),
  onFixShelfHealth = vi.fn(),
}: {
  items?: ContentItem[];
  healthEntries?: ShelfHealthEntry[];
  onOpenItem?: Mock<(item: ContentItem) => void>;
  onToggleFavorite?: Mock<(item: ContentItem) => void>;
  onFixShelfHealth?: Mock<(kind: ShelfHealthKind) => void>;
} = {}) {
  render(
    <DashboardView
      t={(key: MessageKey) => key}
      tCount={(count: number, key: MessageKey) => `${count} ${key}`}
      items={items}
      healthEntries={healthEntries}
      favoriteItems={items.filter((entry) => entry.isFavorite)}
      recentItems={items}
      frequentItems={[]}
      unfinishedItems={[]}
      collectionCount={1}
      dashboardCards={items.map((entry, order) => ({
        item: entry,
        layout: { itemId: entry.id, order, size: "standard" as const, hidden: false },
      }))}
      selectedItemId=""
      draggingItemId={null}
      dropTargetId={null}
      onNavigate={vi.fn()}
      onFixShelfHealth={onFixShelfHealth}
      onFilterTag={vi.fn()}
      onOpenItem={onOpenItem}
      onToggleFavorite={onToggleFavorite}
      onAddContent={vi.fn()}
      onReorderStart={vi.fn()}
      onReorderHover={vi.fn()}
      onReorderEnd={vi.fn()}
    />,
  );
  return { onOpenItem, onToggleFavorite, onFixShelfHealth };
}

/*
 * Everything on the dashboard opens on one click. The cards and the activity
 * rows used to select on a click and open on a double, which could never fire:
 * selecting navigates to the library, so the card or row was unmounted before
 * the second click arrived.
 */
describe("DashboardView activation", () => {
  it("opens a pinned card on a single click", async () => {
    const { onOpenItem } = renderDashboard();

    await userEvent.click(document.querySelector(".cardHitArea") as HTMLElement);

    expect(onOpenItem).toHaveBeenCalledOnce();
    expect(onOpenItem.mock.calls[0][0].id).toBe("item-1");
  });

  it("opens a pinned card from the keyboard", async () => {
    const { onOpenItem } = renderDashboard();

    (document.querySelector(".cardHitArea") as HTMLElement).focus();
    await userEvent.keyboard("{Enter}");

    expect(onOpenItem).toHaveBeenCalledOnce();
  });

  it("opens an activity row on a single click", async () => {
    const { onOpenItem } = renderDashboard();

    const rows = screen.getAllByRole("button", { name: /Lecture notes/ });
    const activityRow = rows.find((row) => row.classList.contains("listItem"));
    await userEvent.click(activityRow as HTMLElement);

    expect(onOpenItem).toHaveBeenCalledOnce();
  });

  it("leaves the card's star out of the open path", async () => {
    const { onOpenItem, onToggleFavorite } = renderDashboard();

    await userEvent.click(screen.getByRole("button", { name: "unpin" }));

    expect(onToggleFavorite).toHaveBeenCalledOnce();
    expect(onOpenItem).not.toHaveBeenCalled();
  });
});

describe("DashboardView shelf health", () => {
  it("says nothing when there are no chores", () => {
    renderDashboard();

    expect(document.querySelector(".shelfHealth")).toBeNull();
  });

  it("shows one count per chore, in the order it was given", () => {
    renderDashboard({
      healthEntries: [
        { kind: "brokenPaths", count: 3 },
        { kind: "duplicates", count: 2 },
        { kind: "inbox", count: 12 },
      ],
    });

    const counts = [...document.querySelectorAll(".shelfHealth button")].map(
      (button) => button.textContent,
    );
    expect(counts).toEqual([
      "3shelfHealthBroken",
      "2shelfHealthDuplicates",
      "12shelfHealthInbox",
    ]);
  });

  it("sends each count to whatever clears it", async () => {
    const { onFixShelfHealth } = renderDashboard({
      healthEntries: [
        { kind: "brokenPaths", count: 1 },
        { kind: "inbox", count: 4 },
      ],
    });

    const buttons = [...document.querySelectorAll(".shelfHealth button")];
    await userEvent.click(buttons[0]);
    await userEvent.click(buttons[1]);

    expect(onFixShelfHealth.mock.calls.map((call) => call[0])).toEqual([
      "brokenPaths",
      "inbox",
    ]);
  });
});
