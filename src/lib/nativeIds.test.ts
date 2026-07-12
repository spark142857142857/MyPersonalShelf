import { describe, expect, it } from "vitest";
import { encodeNativeItemId } from "./nativeIds";

describe("encodeNativeItemId", () => {
  it("keeps dot-segment IDs from becoming URL path segments", () => {
    expect(encodeNativeItemId(".")).toBe("2e");
    expect(encodeNativeItemId("..")).toBe("2e2e");
  });

  it("encodes distinct Unicode IDs without collisions", () => {
    expect(encodeNativeItemId("한글")).not.toBe(encodeNativeItemId("--"));
  });
});
