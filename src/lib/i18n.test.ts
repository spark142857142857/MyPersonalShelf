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

  it("uses the counter forms, not the standalone layout badges", () => {
    // layoutVisible/layoutHidden label a single card and carry no counter, so
    // counting with them would read "5표시". visible/hidden are the counted pair.
    expect(formatCount("ko", 5, "visible")).toBe("5개 표시");
    expect(formatCount("ko", 2, "hidden")).toBe("2개 숨김");
    expect(formatCount("en", 5, "visible")).toBe("5 visible");
    expect(formatCount("en", 2, "hidden")).toBe("2 hidden");
  });
});

describe("messages", () => {
  it("holds the same keys in every language", () => {
    expect(Object.keys(messages.ko).sort()).toEqual(Object.keys(messages.en).sort());
  });
});
