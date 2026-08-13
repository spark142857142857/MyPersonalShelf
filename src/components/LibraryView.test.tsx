// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../lib/i18n";
import type { ContentItem, ContentType } from "../types";
import { LibraryView } from "./LibraryView";

afterEach(cleanup);

const contentTypes: ContentType[] = ["document", "video", "link"];

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    title: "Lecture notes",
    type: "document",
    source: "path",
    location: "C:/shelf/notes.txt",
    collection: "Reading",
    tags: [],
    accent: "#2563eb",
    isFavorite: false,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderLibrary(props: Partial<Parameters<typeof LibraryView>[0]> = {}) {
  const handlers = {
    onSelectType: vi.fn(),
    onPinType: vi.fn(),
    onScanBrokenPaths: vi.fn(),
    onFocusInboxCleanup: vi.fn(),
    onBulkCollectionChange: vi.fn(),
    onBulkTagsChange: vi.fn(),
    onApplyBulkEdits: vi.fn(),
    onClearSelection: vi.fn(),
    onSelectAllVisible: vi.fn(),
    onToggleItemSelection: vi.fn(),
    onSelectItem: vi.fn(),
    onOpenItem: vi.fn(),
    onAddContent: vi.fn(),
  };

  render(
    <LibraryView
      t={(key: MessageKey) => key}
      items={[item()]}
      contentTypes={contentTypes}
      collectionCount={2}
      inboxItems={[]}
      query=""
      activeType="all"
      pinnedTypes={[]}
      pathHealthFilter={false}
      pathScanInFlight={false}
      brokenPathCount={0}
      showBrokenPathFilter={false}
      selectedItemId="item-1"
      selectedItemIds={new Set()}
      bulkCollection=""
      bulkTags=""
      {...handlers}
      {...props}
    />,
  );

  return handlers;
}

describe("LibraryView", () => {
  it("selects on click and opens on double click", async () => {
    const handlers = renderLibrary();
    const row = screen.getByRole("button", { name: /Lecture notes/ });

    await userEvent.click(row);
    expect(handlers.onSelectItem).toHaveBeenCalledOnce();

    await userEvent.dblClick(row);
    expect(handlers.onOpenItem).toHaveBeenCalled();
  });

  it("opens the selected item on Ctrl+Enter", async () => {
    const handlers = renderLibrary();
    screen.getByRole("button", { name: /Lecture notes/ }).focus();

    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(handlers.onOpenItem).toHaveBeenCalledOnce();
  });

  it("shows the add-content prompt only when the shelf itself is empty", () => {
    const handlers = renderLibrary({ items: [] });
    expect(screen.getByText("emptyLibraryTitle")).toBeTruthy();

    cleanup();
    renderLibrary({ items: [], query: "novel" });
    expect(screen.getByText("noSearchResults")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "addContent" })).toBeNull();
    expect(handlers.onAddContent).not.toHaveBeenCalled();
  });

  it("hides the broken-path filter outside the desktop app", () => {
    renderLibrary();
    expect(screen.queryByRole("button", { name: /brokenPathsFilter/ })).toBeNull();

    cleanup();
    renderLibrary({ showBrokenPathFilter: true, brokenPathCount: 3 });
    expect(screen.getByRole("button", { name: /brokenPathsFilter \(3\)/ })).toBeTruthy();
  });

  it("swaps the idle bar for bulk controls once items are selected", async () => {
    const handlers = renderLibrary({ selectedItemIds: new Set(["item-1"]) });

    expect(screen.queryByRole("button", { name: "selectAllVisible" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "applyBulk" }));
    expect(handlers.onApplyBulkEdits).toHaveBeenCalledOnce();
  });

  it("reports type filter changes without touching the pin control", async () => {
    const handlers = renderLibrary();

    await userEvent.click(screen.getByRole("button", { name: "typeVideo" }));
    expect(handlers.onSelectType).toHaveBeenCalledWith("video");

    // One pin control per type chip; the first belongs to "document".
    await userEvent.click(screen.getAllByRole("button", { name: "pinType" })[0]);
    expect(handlers.onPinType).toHaveBeenCalledWith("document");
  });
});
