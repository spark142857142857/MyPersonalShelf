// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../lib/i18n";
import { defaultTheme } from "../lib/theme";
import type { ContentItem } from "../types";
import { DetailPanel } from "./DetailPanel";

afterEach(cleanup);

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    title: "Lecture notes",
    type: "document",
    source: "path",
    location: "C:/shelf/notes.txt",
    collection: "Reading",
    tags: ["later"],
    accent: "#2563eb",
    isFavorite: false,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ContentItem> = {}, onPatch = vi.fn()) {
  const rendered = render(
    <DetailPanel
      item={item(overrides)}
      theme={defaultTheme}
      t={(key: MessageKey) => key}
      pathReady
      collectionNames={["Reading", "Media"]}
      onPatch={onPatch}
      onDelete={vi.fn()}
      onFilterCollection={vi.fn()}
      onFilterTag={vi.fn()}
    />,
  );
  return { onPatch, rendered };
}

describe("DetailPanel notes field", () => {
  it("does not patch the shelf while notes are being typed", async () => {
    const { onPatch } = renderPanel();
    const notes = screen.getByRole("textbox", { name: "notes" });

    await userEvent.type(notes, "chapter 3");

    expect(onPatch).not.toHaveBeenCalled();
    expect((notes as HTMLTextAreaElement).value).toBe("chapter 3");
  });

  it("commits the note once on blur", async () => {
    const { onPatch } = renderPanel();
    const notes = screen.getByRole("textbox", { name: "notes" });

    await userEvent.type(notes, "chapter 3");
    await userEvent.tab();

    expect(onPatch).toHaveBeenCalledOnce();
    expect(onPatch).toHaveBeenCalledWith({ summary: "chapter 3" });
  });

  it("does not patch when the note is unchanged", async () => {
    const { onPatch } = renderPanel({ summary: "already saved" });
    const notes = screen.getByRole("textbox", { name: "notes" });

    await userEvent.click(notes);
    await userEvent.tab();

    expect(onPatch).not.toHaveBeenCalled();
  });

  it("keeps typed notes when an unrelated patch updates the same item", async () => {
    const onPatch = vi.fn();
    const { rendered } = renderPanel({}, onPatch);
    const notes = screen.getByRole("textbox", { name: "notes" });

    await userEvent.type(notes, "half-written");
    // A background enrichment bumping openCount must not clobber the draft.
    rendered.rerender(
      <DetailPanel
        item={item({ openCount: 7 })}
        theme={defaultTheme}
        t={(key: MessageKey) => key}
        pathReady
        collectionNames={["Reading", "Media"]}
        onPatch={onPatch}
        onDelete={vi.fn()}
        onFilterCollection={vi.fn()}
        onFilterTag={vi.fn()}
      />,
    );

    expect((screen.getByRole("textbox", { name: "notes" }) as HTMLTextAreaElement).value).toBe(
      "half-written",
    );
  });
});

describe("DetailPanel organize fields", () => {
  it("commits collection and tag drafts on blur", async () => {
    const { onPatch } = renderPanel();

    const collection = screen.getByRole("combobox", { name: "collection" });
    await userEvent.clear(collection);
    await userEvent.type(collection, "Media");
    await userEvent.tab();

    expect(onPatch).toHaveBeenCalledWith({ collection: "Media" });

    const tags = screen.getByRole("textbox", { name: "tagsComma" });
    await userEvent.clear(tags);
    await userEvent.type(tags, "reading, #reading, later");
    await userEvent.tab();

    expect(onPatch).toHaveBeenCalledWith({ tags: ["reading", "later"] });
  });

  it("falls back to Inbox when the collection is cleared", async () => {
    const { onPatch } = renderPanel();

    const collection = screen.getByRole("combobox", { name: "collection" });
    await userEvent.clear(collection);
    await userEvent.tab();

    expect(onPatch).toHaveBeenCalledWith({ collection: "Inbox" });
  });
});
