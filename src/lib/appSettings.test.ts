import { describe, expect, it } from "vitest";
import {
  defaultAppSettings,
  normalizeAppSettings,
  renamePinnedCollection,
  togglePinnedCollection,
  togglePinnedTag,
  togglePinnedType,
} from "./appSettings";

describe("normalizeAppSettings", () => {
  it("fills defaults and keeps valid pins in order", () => {
    expect(normalizeAppSettings({})).toEqual(defaultAppSettings);
    expect(
      normalizeAppSettings({
        pinnedTypes: ["video", "bogus", "video", "document"] as never,
        pinnedCollections: [" Inbox ", "Inbox", "", "Reading"],
        pinnedTags: [" later ", "later", "", "youtube"],
      }),
    ).toEqual({
      ...defaultAppSettings,
      pinnedTypes: ["video", "document"],
      pinnedCollections: ["Inbox", "Reading"],
      pinnedTags: ["later", "youtube"],
    });
  });
});

describe("pin toggles", () => {
  it("toggles types, collections, and tags", () => {
    const withType = togglePinnedType(defaultAppSettings, "link");
    expect(withType.pinnedTypes).toEqual(["link"]);
    expect(togglePinnedType(withType, "link").pinnedTypes).toEqual([]);

    const withCollection = togglePinnedCollection(defaultAppSettings, "Inbox");
    expect(withCollection.pinnedCollections).toEqual(["Inbox"]);
    expect(togglePinnedCollection(withCollection, "Inbox").pinnedCollections).toEqual([]);

    const withTag = togglePinnedTag(defaultAppSettings, "reading");
    expect(withTag.pinnedTags).toEqual(["reading"]);
    expect(togglePinnedTag(withTag, "reading").pinnedTags).toEqual([]);
  });

  it("renames pinned collections and dedupes", () => {
    const settings = normalizeAppSettings({
      pinnedCollections: ["Inbox", "Reading"],
    });
    expect(renamePinnedCollection(settings, "Inbox", "Later").pinnedCollections).toEqual([
      "Later",
      "Reading",
    ]);
    expect(renamePinnedCollection(settings, "Inbox", "Reading").pinnedCollections).toEqual([
      "Reading",
    ]);
  });
});
