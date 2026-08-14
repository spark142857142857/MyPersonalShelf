// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../lib/i18n";
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

function renderDashboard(items: ContentItem[], onOpenItem = vi.fn()) {
  render(
    <DashboardView
      t={(key: MessageKey) => key}
      tCount={(count: number, key: MessageKey) => `${count} ${key}`}
      items={items}
      inboxItems={[]}
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
      onFocusInboxCleanup={vi.fn()}
      onFilterTag={vi.fn()}
      onOpenItem={onOpenItem}
      onToggleFavorite={vi.fn()}
      onAddContent={vi.fn()}
      onReorderStart={vi.fn()}
      onReorderHover={vi.fn()}
      onReorderEnd={vi.fn()}
    />,
  );
  return { onOpenItem };
}

/*
 * Everything on the dashboard opens on one click. The cards and the activity
 * rows used to select on a click and open on a double, which could never fire:
 * selecting navigates to the library, so the card or row was unmounted before
 * the second click arrived.
 */
describe("DashboardView activation", () => {
  it("opens a pinned card on a single click", async () => {
    const { onOpenItem } = renderDashboard([item()]);

    await userEvent.click(document.querySelector(".cardHitArea") as HTMLElement);

    expect(onOpenItem).toHaveBeenCalledOnce();
    expect(onOpenItem.mock.calls[0][0].id).toBe("item-1");
  });

  it("opens a pinned card from the keyboard", async () => {
    const { onOpenItem } = renderDashboard([item()]);

    (document.querySelector(".cardHitArea") as HTMLElement).focus();
    await userEvent.keyboard("{Enter}");

    expect(onOpenItem).toHaveBeenCalledOnce();
  });

  it("opens an activity row on a single click", async () => {
    const { onOpenItem } = renderDashboard([item()]);

    const rows = screen.getAllByRole("button", { name: /Lecture notes/ });
    const activityRow = rows.find((row) => row.classList.contains("listItem"));
    await userEvent.click(activityRow as HTMLElement);

    expect(onOpenItem).toHaveBeenCalledOnce();
  });

  it("leaves the card's star and drag handle out of the open path", async () => {
    const onToggleFavorite = vi.fn();
    const onOpenItem = vi.fn();
    render(
      <DashboardView
        t={(key: MessageKey) => key}
        tCount={(count: number, key: MessageKey) => `${count} ${key}`}
        items={[item()]}
        inboxItems={[]}
        favoriteItems={[item()]}
        recentItems={[]}
        frequentItems={[]}
        unfinishedItems={[]}
        collectionCount={1}
        dashboardCards={[{ item: item(), layout: { itemId: "item-1", order: 0, size: "standard", hidden: false } }]}
        selectedItemId=""
        draggingItemId={null}
        dropTargetId={null}
        onNavigate={vi.fn()}
        onFocusInboxCleanup={vi.fn()}
        onFilterTag={vi.fn()}
        onOpenItem={onOpenItem}
        onToggleFavorite={onToggleFavorite}
        onAddContent={vi.fn()}
        onReorderStart={vi.fn()}
        onReorderHover={vi.fn()}
        onReorderEnd={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "unpin" }));

    expect(onToggleFavorite).toHaveBeenCalledOnce();
    expect(onOpenItem).not.toHaveBeenCalled();
  });
});
