// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../lib/i18n";
import type { ContentItem } from "../types";
import { CollectionsView } from "./CollectionsView";

afterEach(cleanup);

function item(collection: string): ContentItem {
  return {
    id: `id-${collection}`,
    title: `${collection} item`,
    type: "document",
    source: "path",
    location: "C:/shelf/notes.txt",
    collection,
    tags: ["later"],
    accent: "#2563eb",
    isFavorite: false,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderCollections(props: Partial<Parameters<typeof CollectionsView>[0]> = {}) {
  const handlers = {
    onNewCollectionNameChange: vi.fn(),
    onCreateCollection: vi.fn(),
    onFilterCollection: vi.fn(),
    onFilterTag: vi.fn(),
    onPinCollection: vi.fn(),
    onPinTag: vi.fn(),
    onEditingCollectionChange: vi.fn(),
    onDeleteEmptyCollection: vi.fn(),
    onRenameCollection: vi.fn(() => true),
    onUpdateCollectionSettings: vi.fn(),
  };

  const reading = item("Reading");
  render(
    <CollectionsView
      t={(key: MessageKey) => key}
      items={[reading]}
      collectionNames={["Reading", "Empty"]}
      groupedCollections={{ Reading: [reading] }}
      groupedTags={{ later: [reading] }}
      collectionSettings={{}}
      pinnedCollections={[]}
      pinnedTags={[]}
      editingCollection={null}
      newCollectionName=""
      {...handlers}
      {...props}
    />,
  );

  // Callers may override a handler through props; return what the component
  // actually received so assertions target the live spy.
  return { ...handlers, ...props };
}

describe("CollectionsView", () => {
  it("submits the create form with the pending name", async () => {
    const handlers = renderCollections({ newCollectionName: "Archive" });

    await userEvent.click(screen.getByRole("button", { name: "createCollection" }));
    expect(handlers.onCreateCollection).toHaveBeenCalledWith("Archive");
  });

  it("offers deletion only for empty collections", () => {
    renderCollections();
    // "Empty" has no items, "Reading" has one, so exactly one delete control.
    expect(screen.getAllByRole("button", { name: "deleteEmptyCollection" })).toHaveLength(1);
  });

  it("filters by collection and by tag", async () => {
    const handlers = renderCollections();

    await userEvent.click(screen.getByRole("button", { name: /collectionReading/ }));
    expect(handlers.onFilterCollection).toHaveBeenCalledWith("Reading");

    // "later" is a known tag, so it renders through its message key.
    await userEvent.click(screen.getByRole("button", { name: /#tagLater/ }));
    expect(handlers.onFilterTag).toHaveBeenCalledWith("later");
  });

  it("restores the previous name when a rename is rejected", async () => {
    const handlers = renderCollections({
      editingCollection: "Reading",
      onRenameCollection: vi.fn(() => false),
    });

    const nameInput = screen.getByRole("textbox", { name: "collectionName" }) as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Media");
    await userEvent.tab();

    expect(handlers.onRenameCollection).toHaveBeenCalledWith("Reading", "Media");
    expect(nameInput.value).toBe("Reading");
  });

  it("follows the rename when it is accepted", async () => {
    const handlers = renderCollections({ editingCollection: "Reading" });

    const nameInput = screen.getByRole("textbox", { name: "collectionName" });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Media");
    await userEvent.tab();

    expect(handlers.onEditingCollectionChange).toHaveBeenCalledWith("Media");
  });

  it("shows an empty-state message when no tags exist", () => {
    renderCollections({ groupedTags: {} });
    expect(screen.getByText("noTags")).toBeTruthy();
  });
});
