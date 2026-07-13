// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  extractUrlFromText,
  isEditableKeyboardTarget,
  isQuickCaptureShortcut,
  titleFromUrl,
} from "./quickCapture";

describe("extractUrlFromText", () => {
  it("accepts explicit and clean schemeless web URLs", () => {
    expect(extractUrlFromText("https://example.com/path")).toBe("https://example.com/path");
    expect(extractUrlFromText("see https://example.com/docs for more")).toBe("https://example.com/docs");
    expect(extractUrlFromText("example.com")).toBe("https://example.com/");
  });

  it("rejects non-web clipboard text and executable-like tokens", () => {
    expect(extractUrlFromText("just a note")).toBeNull();
    expect(extractUrlFromText("javascript:alert(1)")).toBeNull();
    expect(extractUrlFromText("npm.cmd")).toBeNull();
    expect(extractUrlFromText("npm.cmd%20run%20tauri%20dev")).toBeNull();
    expect(extractUrlFromText("setup.exe")).toBeNull();
  });
});

describe("titleFromUrl", () => {
  it("uses hostname without www", () => {
    expect(titleFromUrl("https://www.example.com/a")).toBe("example.com");
  });
});

describe("isQuickCaptureShortcut", () => {
  it("matches Ctrl/Cmd+Shift+V", () => {
    expect(
      isQuickCaptureShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: "V" }),
    ).toBe(true);
    expect(
      isQuickCaptureShortcut({ ctrlKey: false, metaKey: false, shiftKey: true, key: "v" }),
    ).toBe(false);
  });
});

describe("isEditableKeyboardTarget", () => {
  it("detects form fields", () => {
    const input = document.createElement("input");
    const div = document.createElement("div");
    expect(isEditableKeyboardTarget(input)).toBe(true);
    expect(isEditableKeyboardTarget(div)).toBe(false);
  });
});
