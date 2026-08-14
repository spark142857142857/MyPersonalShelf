import { describe, expect, it } from "vitest";
import { collectShelfHealth } from "./shelfHealth";

const none = { brokenPathCount: 0, duplicateGroupCount: 0, inboxCount: 0 };

describe("collectShelfHealth", () => {
  it("says nothing when the shelf is tidy", () => {
    expect(collectShelfHealth(none)).toEqual([]);
  });

  it("drops the counts that are zero", () => {
    expect(collectShelfHealth({ ...none, inboxCount: 4 })).toEqual([
      { kind: "inbox", count: 4 },
    ]);
  });

  it("puts what cannot be opened before what is merely untidy", () => {
    const entries = collectShelfHealth({
      brokenPathCount: 1,
      duplicateGroupCount: 2,
      inboxCount: 30,
    });

    expect(entries.map((entry) => entry.kind)).toEqual([
      "brokenPaths",
      "duplicates",
      "inbox",
    ]);
  });

  it("keeps that order when the middle one is absent", () => {
    const entries = collectShelfHealth({
      brokenPathCount: 3,
      duplicateGroupCount: 0,
      inboxCount: 1,
    });

    expect(entries).toEqual([
      { kind: "brokenPaths", count: 3 },
      { kind: "inbox", count: 1 },
    ]);
  });

  it("ignores a negative count rather than rendering it", () => {
    expect(collectShelfHealth({ ...none, duplicateGroupCount: -1 })).toEqual([]);
  });
});
