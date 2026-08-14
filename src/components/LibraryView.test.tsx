// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCount, type Language, type MessageKey } from "../lib/i18n";
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

  const view = render(
    <LibraryView
      t={(key: MessageKey) => key}
      tCount={(count: number, key: MessageKey) => `${count} ${key}`}
      items={[item()]}
      contentTypes={contentTypes}
      collectionCount={2}
      query=""
      activeType="all"
      pinnedTypes={[]}
      pathHealthFilter={false}
      pathScanInFlight={false}
      brokenPathCount={0}
      brokenItemIds={new Set()}
      showBrokenPathFilter={false}
      selectedItemId="item-1"
      selectedItemIds={new Set()}
      bulkCollection=""
      bulkTags=""
      {...handlers}
      {...props}
    />,
  );

  return { ...handlers, container: view.container };
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

  it("writes the selection count the way each language joins it", () => {
    const withLanguage = (language: Language) =>
      renderLibrary({
        tCount: (count: number, key: MessageKey) => formatCount(language, count, key),
        selectedItemIds: new Set(["item-1", "item-2"]),
      });

    withLanguage("en");
    expect(screen.getByText("2 selected")).toBeTruthy();

    cleanup();
    withLanguage("ko");
    expect(screen.getByText("2개 선택")).toBeTruthy();
  });

  it("hides the broken-path filter outside the desktop app", () => {
    renderLibrary();
    expect(screen.queryByRole("button", { name: /brokenPathsFilter/ })).toBeNull();

    cleanup();
    renderLibrary({ showBrokenPathFilter: true, brokenPathCount: 3 });
    expect(screen.getByRole("button", { name: /brokenPathsFilter \(3\)/ })).toBeTruthy();
  });

  it("marks rows whose local path is missing, and leaves the rest alone", () => {
    renderLibrary();
    expect(screen.queryByText("pathMissing")).toBeNull();

    cleanup();
    renderLibrary({ brokenItemIds: new Set(["item-1"]) });
    expect(screen.getByText("pathMissing")).toBeTruthy();
  });

  it("offers a way out only on the rows that need one", async () => {
    const onRelinkItem = vi.fn();
    const onRemoveItem = vi.fn();
    renderLibrary({ onRelinkItem, onRemoveItem });
    expect(screen.queryByRole("button", { name: "relinkPath" })).toBeNull();

    cleanup();
    renderLibrary({ brokenItemIds: new Set(["item-1"]), onRelinkItem, onRemoveItem });
    await userEvent.click(screen.getByRole("button", { name: "relinkPath" }));
    expect(onRelinkItem).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(onRemoveItem).toHaveBeenCalledOnce();
  });

  it("drops the relink action when there is no desktop runtime to relink with", () => {
    renderLibrary({ brokenItemIds: new Set(["item-1"]), onRemoveItem: vi.fn() });

    expect(screen.queryByRole("button", { name: "relinkPath" })).toBeNull();
    expect(screen.getByRole("button", { name: "delete" })).toBeTruthy();
  });

  it("draws a window of rows and reserves the height of the ones it skipped", () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      item({ id: `item-${index}`, title: `Item ${index}` }),
    );
    const { container } = renderLibrary({ items: many });

    const rows = screen.getAllByRole("button", { name: /Item \d+/ });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(many.length);

    const list = container.querySelector(".itemList");
    const reserved = [...(list?.children ?? [])]
      .filter((child) => !child.classList.contains("listItemRow"))
      .reduce((total, child) => total + Number.parseInt((child as HTMLElement).style.height, 10), 0);

    // What keeps the scrollbar honest: every row left undrawn still holds its
    // place, so the list is the same height whatever part of it is on screen.
    expect(reserved).toBe((many.length - rows.length) * 61);
  });

  it("swaps the idle bar for bulk controls once items are selected", async () => {
    const handlers = renderLibrary({ selectedItemIds: new Set(["item-1"]) });

    expect(screen.queryByRole("button", { name: "selectAllVisible" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "applyBulk" }));
    expect(handlers.onApplyBulkEdits).toHaveBeenCalledOnce();
  });

  it("shows a link icon even when the row has no saved preview", () => {
    // Rows used to read item.previewImage alone, so a link saved before
    // previews existed showed artwork on its card but a bare type icon here.
    const { container } = renderLibrary({
      items: [
        item({
          type: "link",
          source: "url",
          location: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        }),
      ],
    });

    const icon = container.querySelector("img.listFavicon");
    expect(icon?.getAttribute("src")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
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
