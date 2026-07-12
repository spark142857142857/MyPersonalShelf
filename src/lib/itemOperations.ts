export class ItemOperationRegistry {
  private readonly opening = new Set<string>();
  private readonly deleting = new Set<string>();

  beginOpen(itemId: string) {
    if (this.opening.has(itemId) || this.deleting.has(itemId)) return false;
    this.opening.add(itemId);
    return true;
  }

  endOpen(itemId: string) {
    this.opening.delete(itemId);
  }

  beginDelete(itemId: string) {
    if (this.opening.has(itemId) || this.deleting.size > 0) return false;
    this.deleting.add(itemId);
    return true;
  }

  endDelete(itemId: string) {
    this.deleting.delete(itemId);
  }

  isDeleting(itemId: string) {
    return this.deleting.has(itemId);
  }
}
