import { Star, Tags } from "lucide-react";
import { getCollectionSettings } from "../lib/collections";
import type { MessageKey } from "../lib/i18n";
import { getCollectionLabel, getTagLabel, getTypeLabel } from "../lib/shelfDisplay";
import type { CollectionSettings, ContentItem, ContentType } from "../types";
import { collectionIcons, typeIcons } from "./icons";

/**
 * Pinned shortcuts, which used to be a row of cards on the dashboard.
 *
 * They belong beside the navigation because that is what they are: every one of
 * their handlers ends in a jump to the library with a filter applied. On the
 * dashboard they could only be reached by first navigating home, which is the
 * opposite of a shortcut.
 */
export function SidebarShortcuts({
  t,
  items,
  collectionSettings,
  pinnedTypes,
  pinnedCollections,
  pinnedTags,
  onFilterType,
  onFilterCollection,
  onFilterTag,
  onUnpinType,
  onUnpinCollection,
  onUnpinTag,
}: {
  t: (key: MessageKey) => string;
  items: ContentItem[];
  collectionSettings: Record<string, CollectionSettings>;
  pinnedTypes: ContentType[];
  pinnedCollections: string[];
  pinnedTags: string[];
  onFilterType: (type: ContentType) => void;
  onFilterCollection: (collection: string) => void;
  onFilterTag: (tag: string) => void;
  onUnpinType: (type: ContentType) => void;
  onUnpinCollection: (collection: string) => void;
  onUnpinTag: (tag: string) => void;
}) {
  if (pinnedTypes.length + pinnedCollections.length + pinnedTags.length === 0) {
    return null;
  }

  return (
    <div className="sidebarShortcuts">
      <span className="panelLabel">{t("dashboardShortcutsTitle")}</span>
      <div className="sidebarShortcutList">
        {pinnedTypes.map((type) => (
          <ShortcutRow
            key={`type:${type}`}
            color="var(--app-accent)"
            icon={typeIcons[type]}
            label={getTypeLabel(type, t)}
            count={items.filter((item) => item.type === type).length}
            unpinLabel={t("unpinType")}
            onOpen={() => onFilterType(type)}
            onUnpin={() => onUnpinType(type)}
          />
        ))}
        {pinnedCollections.map((collection) => {
          const settings = getCollectionSettings(collection, collectionSettings, items);
          return (
            <ShortcutRow
              key={`collection:${collection}`}
              color={settings.color}
              icon={collectionIcons[settings.icon]}
              label={getCollectionLabel(collection, t)}
              count={items.filter((item) => item.collection === collection).length}
              unpinLabel={t("unpinCollection")}
              onOpen={() => onFilterCollection(collection)}
              onUnpin={() => onUnpinCollection(collection)}
            />
          );
        })}
        {pinnedTags.map((tag) => (
          <ShortcutRow
            key={`tag:${tag}`}
            color="var(--app-accent)"
            icon={<Tags size={16} />}
            label={`#${getTagLabel(tag, t)}`}
            count={items.filter((item) => item.tags.includes(tag)).length}
            unpinLabel={t("unpinTag")}
            onOpen={() => onFilterTag(tag)}
            onUnpin={() => onUnpinTag(tag)}
          />
        ))}
      </div>
    </div>
  );
}

function ShortcutRow({
  color,
  icon,
  label,
  count,
  unpinLabel,
  onOpen,
  onUnpin,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  unpinLabel: string;
  onOpen: () => void;
  onUnpin: () => void;
}) {
  return (
    <div className="sidebarShortcut">
      <button className="sidebarShortcutMain" type="button" onClick={onOpen}>
        <span className="sidebarShortcutIcon" style={{ color }}>{icon}</span>
        <span className="sidebarShortcutName">{label}</span>
        <span className="sidebarShortcutCount">{count}</span>
      </button>
      {/* Hidden until the row is hovered or something inside it takes focus: a
        * permanent unpin column would cost 36px of a 252px sidebar, and it is
        * the rarest thing anyone does to a shortcut. */}
      <button
        className="sidebarShortcutUnpin"
        type="button"
        aria-label={unpinLabel}
        title={unpinLabel}
        onClick={onUnpin}
      >
        <Star size={13} fill="currentColor" />
      </button>
    </div>
  );
}
