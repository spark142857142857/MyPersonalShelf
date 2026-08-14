import { describe, expect, it } from "vitest";
import { formatCount, messages } from "./i18n";

describe("formatCount", () => {
  it("separates the count from an English unit", () => {
    expect(formatCount("en", 10, "items")).toBe("10 items");
    expect(formatCount("en", 3, "opens")).toBe("3 opens");
    expect(formatCount("en", 2, "selectedCount")).toBe("2 selected");
  });

  it("binds the count to the Korean counter", () => {
    expect(formatCount("ko", 10, "items")).toBe("10개 항목");
    expect(formatCount("ko", 3, "opens")).toBe("3회 열림");
    expect(formatCount("ko", 2, "selectedCount")).toBe("2개 선택");
  });

  it("keeps zero and large counts on the same rule", () => {
    expect(formatCount("en", 0, "groups")).toBe("0 groups");
    expect(formatCount("ko", 0, "groups")).toBe("0개 그룹");
    expect(formatCount("ko", 1024, "visible")).toBe("1024개 표시");
  });

  it("uses the counter forms, not the labels they read like", () => {
    // layoutVisible/layoutHidden label a single card and tags labels a field;
    // none of the three carries a counter, so counting with them would read
    // "5표시" or "12태그". These are the counted forms of the same words.
    expect(formatCount("ko", 5, "visible")).toBe("5개 표시");
    expect(formatCount("ko", 2, "hidden")).toBe("2개 숨김");
    expect(formatCount("ko", 12, "tagCount")).toBe("12개 태그");
    expect(formatCount("en", 5, "visible")).toBe("5 visible");
    expect(formatCount("en", 2, "hidden")).toBe("2 hidden");
    expect(formatCount("en", 12, "tagCount")).toBe("12 tags");
  });

  it("counts the status-strip notices, which are whole sentences", () => {
    // These read as one sentence rather than a label, but the number still
    // meets a counter and the join is the same decision.
    expect(formatCount("ko", 3, "brokenPathsFound")).toBe("3개의 끊긴 경로를 찾았어요.");
    expect(formatCount("ko", 2, "duplicatesCleaned")).toBe("2개의 중복 항목을 정리했어요.");
    expect(formatCount("ko", 20, "bookmarksImported")).toBe("20개 북마크를 가져왔어요.");
    expect(formatCount("ko", 5, "bookmarksSkipped")).toBe("5개 중복을 건너뛰었어요.");
    expect(formatCount("ko", 12, "localFolderSummary")).toBe("12개 항목을 이 폴더에서 불러왔어요.");

    expect(formatCount("en", 3, "brokenPathsFound")).toBe("3 broken path(s) found.");
    expect(formatCount("en", 20, "bookmarksImported")).toBe("20 bookmarks imported.");
    expect(formatCount("en", 12, "localFolderSummary")).toBe("12 entries loaded from this folder.");
  });
});

describe("messages", () => {
  it("holds the same keys in every language", () => {
    expect(Object.keys(messages.ko).sort()).toEqual(Object.keys(messages.en).sort());
  });
});
