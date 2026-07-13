// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../lib/i18n";
import { AddContentModal, type DraftItem } from "./AddContentModal";

afterEach(cleanup);

const draft: DraftItem = {
  title: "",
  type: "document",
  source: "path",
  location: "",
  collection: "Inbox",
  tags: "",
  accent: "#2563eb",
  summary: "",
  textContent: "",
};

function renderModal(
  onClose = vi.fn(),
  isSubmitting = false,
  currentDraft = draft,
  onDraftChange = vi.fn(),
) {
  render(
    <AddContentModal
      mode="manual"
      draft={currentDraft}
      isSubmitting={isSubmitting}
      t={(key: MessageKey) => key}
      getTypeLabel={(type) => type}
      onModeChange={vi.fn()}
      onDraftChange={onDraftChange}
      onSubmit={(event) => event.preventDefault()}
      onFile={vi.fn()}
      onNativeFile={vi.fn()}
      onNativeFolder={vi.fn()}
      onImportBookmarks={vi.fn()}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("AddContentModal", () => {
  it("moves focus into the dialog and closes on Escape", async () => {
    const onClose = renderModal();
    const closeButton = screen.getByRole("button", { name: "close" });
    expect(document.activeElement).toBe(closeButton);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("traps forward Tab navigation inside the dialog", async () => {
    renderModal();
    const submitButton = screen.getByRole("button", { name: "addToShelf" });
    submitButton.focus();

    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "close" }));
  });

  it("requires a title and a path for path-based items", () => {
    renderModal();
    expect(screen.getByRole("textbox", { name: "title" }).hasAttribute("required")).toBe(true);
    expect(screen.getByRole("textbox", { name: "locationLabel" }).hasAttribute("required")).toBe(true);
  });

  it("disables submission while a native path is being registered", () => {
    renderModal(vi.fn(), true);
    expect(screen.getByRole("button", { name: "addToShelf" }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("textbox", { name: "title" }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("combobox", { name: "type" }).matches(":disabled")).toBe(true);
  });

  it("keeps the dialog open on Escape while registration is in progress", async () => {
    const onClose = renderModal(vi.fn(), true);
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("offers only sources that can be opened for the selected content type", () => {
    renderModal(vi.fn(), false, { ...draft, type: "link", source: "url" });
    const sourceSelect = screen.getByRole("combobox", { name: "source" }) as HTMLSelectElement;

    expect(sourceSelect.disabled).toBe(true);
    expect([...sourceSelect.options].map((option) => option.value)).toEqual(["url"]);
  });

  it("switches to a valid source when the content type changes", async () => {
    const onDraftChange = vi.fn();
    renderModal(vi.fn(), false, draft, onDraftChange);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "type" }), "link");
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ type: "link", source: "url" }));
  });
});
