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

function renderModal(onClose = vi.fn()) {
  render(
    <AddContentModal
      mode="manual"
      draft={draft}
      t={(key: MessageKey) => key}
      getTypeLabel={(type) => type}
      onModeChange={vi.fn()}
      onDraftChange={vi.fn()}
      onSubmit={(event) => event.preventDefault()}
      onFile={vi.fn()}
      onNativeFile={vi.fn()}
      onNativeFolder={vi.fn()}
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
});
