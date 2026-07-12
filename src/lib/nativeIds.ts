export function encodeNativeItemId(itemId: string) {
  return Array.from(
    new TextEncoder().encode(itemId),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
