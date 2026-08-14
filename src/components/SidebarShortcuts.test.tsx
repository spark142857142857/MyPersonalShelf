// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../lib/i18n";
import type { ContentItem } from "../types";
import { SidebarShortcuts } from "./SidebarShortcuts";

afterEach(cleanup);

function item(overrides: Partial<ContentItem>): ContentItem {
  return {
    id: "id",
    title: "title",
    type: "document",
    source: "path",
    location: "C:/x",
    collection: "reading",
    tags: [],
    accent: "#2d6f62",
    isFavorite: false,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const items = [
  item({ id: "1", type: "document", collection: "reading", tags: ["메모"] }),
  item({ id: "2", type: "document", collection: "work", tags: [] }),
  item({ id: "3", type: "link", collection: "reading", tags: ["메모"] }),
];

function renderShortcuts(pins: {
  types?: ContentItem["type"][];
  collections?: string[];
  tags?: string[];
}) {
  const handlers = {
    onFilterType: vi.fn(),
    onFilterCollection: vi.fn(),
    onFilterTag: vi.fn(),
    onUnpinType: vi.fn(),
    onUnpinCollection: vi.fn(),
    onUnpinTag: vi.fn(),
  };
  render(
    <SidebarShortcuts
      t={(key: MessageKey) => key}
      items={items}
      collectionSettings={{}}
      pinnedTypes={pins.types ?? []}
      pinnedCollections={pins.collections ?? []}
      pinnedTags={pins.tags ?? []}
      {...handlers}
    />,
  );
  return handlers;
}

describe("SidebarShortcuts", () => {
  it("renders nothing at all when nothing is pinned", () => {
    const { container } = render(
      <SidebarShortcuts
        t={(key: MessageKey) => key}
        items={items}
        collectionSettings={{}}
        pinnedTypes={[]}
        pinnedCollections={[]}
        pinnedTags={[]}
        onFilterType={vi.fn()}
        onFilterCollection={vi.fn()}
        onFilterTag={vi.fn()}
        onUnpinType={vi.fn()}
        onUnpinCollection={vi.fn()}
        onUnpinTag={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("counts only the items each shortcut would actually show", () => {
    renderShortcuts({ types: ["document"], collections: ["reading"], tags: ["메모"] });
    // 2 documents, 2 items in reading, 2 tagged 메모 — but "work" has 1, so the
    // counts are not just the shelf size repeated.
    expect(screen.getByRole("button", { name: /document/i }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: /reading/ }).textContent).toContain("2");
  });

  it("opens the library filtered when a shortcut is clicked", async () => {
    const handlers = renderShortcuts({ collections: ["reading"] });
    await userEvent.click(screen.getByRole("button", { name: /reading/ }));
    expect(handlers.onFilterCollection).toHaveBeenCalledWith("reading");
    expect(handlers.onUnpinCollection).not.toHaveBeenCalled();
  });

  it("keeps unpinning reachable without opening the shortcut", async () => {
    const handlers = renderShortcuts({ tags: ["메모"] });
    await userEvent.click(screen.getByRole("button", { name: "unpinTag" }));
    expect(handlers.onUnpinTag).toHaveBeenCalledWith("메모");
    expect(handlers.onFilterTag).not.toHaveBeenCalled();
  });

  it("lists types, then collections, then tags", () => {
    renderShortcuts({ types: ["link"], collections: ["work"], tags: ["메모"] });
    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => text.length > 0);
    // t is stubbed to echo the message key, so a type reads as "typeLink".
    expect(names[0]).toContain("typeLink");
    expect(names[1]).toContain("work");
    expect(names[2]).toContain("메모");
  });
});
