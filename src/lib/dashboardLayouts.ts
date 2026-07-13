import type { DashboardLayoutItem } from "../types";

export function reorderDashboardLayouts(
  layouts: DashboardLayoutItem[],
  activeItemId: string,
  overItemId: string,
): DashboardLayoutItem[] {
  if (activeItemId === overItemId) {
    return layouts;
  }

  const ordered = [...layouts].sort((left, right) => left.order - right.order);
  const fromIndex = ordered.findIndex((layout) => layout.itemId === activeItemId);
  const toIndex = ordered.findIndex((layout) => layout.itemId === overItemId);
  if (fromIndex < 0 || toIndex < 0) {
    return layouts;
  }

  const next = [...ordered];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((layout, order) => ({ ...layout, order }));
}
