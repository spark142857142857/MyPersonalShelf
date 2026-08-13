import { Star } from "lucide-react";
import type { MessageKey } from "../lib/i18n";
import { getCollectionSettings } from "../lib/collections";
import { getCollectionLabel, getTagLabel, getTypeLabel } from "../lib/shelfDisplay";
import type { CollectionIcon, CollectionSettings, ContentItem } from "../types";
import { collectionIconOptions, collectionIcons } from "./icons";

export function CollectionsView({
  t,
  items,
  collectionNames,
  groupedCollections,
  groupedTags,
  collectionSettings,
  pinnedCollections,
  pinnedTags,
  editingCollection,
  newCollectionName,
  onNewCollectionNameChange,
  onCreateCollection,
  onFilterCollection,
  onFilterTag,
  onPinCollection,
  onPinTag,
  onEditingCollectionChange,
  onDeleteEmptyCollection,
  onRenameCollection,
  onUpdateCollectionSettings,
}: {
  t: (key: MessageKey) => string;
  items: ContentItem[];
  collectionNames: string[];
  groupedCollections: Record<string, ContentItem[]>;
  groupedTags: Record<string, ContentItem[]>;
  collectionSettings: Record<string, CollectionSettings>;
  pinnedCollections: string[];
  pinnedTags: string[];
  editingCollection: string | null;
  newCollectionName: string;
  onNewCollectionNameChange: (value: string) => void;
  onCreateCollection: (name: string) => void;
  onFilterCollection: (collection: string) => void;
  onFilterTag: (tag: string) => void;
  onPinCollection: (collection: string) => void;
  onPinTag: (tag: string) => void;
  onEditingCollectionChange: (collection: string | null) => void;
  onDeleteEmptyCollection: (collection: string) => void;
  onRenameCollection: (previousName: string, nextName: string) => boolean;
  onUpdateCollectionSettings: (collection: string, patch: Partial<CollectionSettings>) => void;
}) {
  function countLabel(count: number) {
    return `${count} ${count === 1 ? t("itemSingular") : t("itemPlural")}`;
  }

  return (
    <>
      <section className="pageIntro">
        <div>
          <span className="eyebrow">{t("collectionsEyebrow")}</span>
          <h1>{t("collectionsTitle")}</h1>
        </div>
        <div className="pageIntroStats">
          <span>{collectionNames.length} {t("groups")}</span>
          <span>{items.length} {t("items")}</span>
        </div>
      </section>
      <section className="libraryPanel">
        <div className="sectionTitle">
          <h2>{t("navCollections")}</h2>
          <span>{t("clickCollection")}</span>
        </div>
        <form
          className="createCollectionRow"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateCollection(newCollectionName);
          }}
        >
          <input
            value={newCollectionName}
            onChange={(event) => onNewCollectionNameChange(event.target.value)}
            placeholder={t("createCollectionPlaceholder")}
            aria-label={t("createCollection")}
          />
          <button className="primaryButton" type="submit">
            {t("createCollection")}
          </button>
        </form>
        <p className="collectionCreateHint">{t("createCollectionHint")}</p>
        <div className="collectionGrid">
          {collectionNames.map((collection) => {
            const collectionItems = groupedCollections[collection] ?? [];
            const settings = getCollectionSettings(collection, collectionSettings, items);
            const isEditing = editingCollection === collection;
            const collectionPinned = pinnedCollections.includes(collection);
            const isEmpty = collectionItems.length === 0;
            return (
              <article className={`collectionCard ${isEditing ? "collectionEditorCard isEditing" : "collectionEditorCard"} ${isEmpty ? "emptyCollectionCard" : ""}`} key={collection} style={{ borderColor: settings.color }}>
                <button className="collectionOpenButton" type="button" onClick={() => onFilterCollection(collection)}>
                  <span className="collectionIcon" style={{ color: settings.color }}>
                    {collectionIcons[settings.icon]}
                  </span>
                  <strong>{getCollectionLabel(collection, t)}</strong>
                  <span>{countLabel(collectionItems.length)}</span>
                  <small>
                    {isEmpty
                      ? t("emptyCollectionHint")
                      : collectionItems.map((item) => getTypeLabel(item.type, t)).join(", ")}
                  </small>
                </button>
                <div className="collectionCardActions">
                  <button
                    className={`pinChipButton ${collectionPinned ? "pinned" : ""}`}
                    type="button"
                    aria-pressed={collectionPinned}
                    aria-label={collectionPinned ? t("unpinCollection") : t("pinCollection")}
                    title={collectionPinned ? t("unpinCollection") : t("pinCollection")}
                    onClick={() => onPinCollection(collection)}
                  >
                    <Star size={14} fill={collectionPinned ? "currentColor" : "none"} />
                  </button>
                  <button
                    className="collectionEditToggle"
                    type="button"
                    onClick={() => onEditingCollectionChange(isEditing ? null : collection)}
                  >
                    {isEditing ? t("doneEditingCollection") : t("editCollection")}
                  </button>
                  {isEmpty && (
                    <button
                      className="collectionEditToggle"
                      type="button"
                      onClick={() => onDeleteEmptyCollection(collection)}
                    >
                      {t("deleteEmptyCollection")}
                    </button>
                  )}
                </div>
                {isEditing && (
                  <div className="collectionEditGrid">
                    <label>
                      {t("collectionName")}
                      <input
                        defaultValue={collection}
                        onBlur={(event) => {
                          if (!onRenameCollection(collection, event.currentTarget.value)) {
                            event.currentTarget.value = collection;
                          } else {
                            onEditingCollectionChange(event.currentTarget.value.trim() || collection);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    </label>
                    <label>
                      {t("collectionColor")}
                      <input
                        type="color"
                        value={settings.color}
                        onChange={(event) => onUpdateCollectionSettings(collection, { color: event.target.value })}
                      />
                    </label>
                    <label>
                      {t("collectionIcon")}
                      <select
                        value={settings.icon}
                        onChange={(event) => onUpdateCollectionSettings(collection, { icon: event.target.value as CollectionIcon })}
                      >
                        {collectionIconOptions.map((icon) => (
                          <option value={icon} key={icon}>
                            {t(`collectionIcon${icon[0].toUpperCase()}${icon.slice(1)}` as MessageKey)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section className="libraryPanel">
        <div className="sectionTitle">
          <h2>{t("tagOverview")}</h2>
          <span>{Object.keys(groupedTags).length} {t("tags")}</span>
        </div>
        <div className="tagCloud">
          {Object.entries(groupedTags)
            .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
            .map(([tag, tagItems]) => {
              const tagPinned = pinnedTags.includes(tag);
              return (
                <div className="tagCloudItem" key={tag}>
                  <button type="button" onClick={() => onFilterTag(tag)}>
                    <strong>#{getTagLabel(tag, t)}</strong>
                    <span>{countLabel(tagItems.length)}</span>
                  </button>
                  <button
                    className={`pinChipButton ${tagPinned ? "pinned" : ""}`}
                    type="button"
                    aria-pressed={tagPinned}
                    aria-label={tagPinned ? t("unpinTag") : t("pinTag")}
                    title={tagPinned ? t("unpinTag") : t("pinTag")}
                    onClick={() => onPinTag(tag)}
                  >
                    <Star size={13} fill={tagPinned ? "currentColor" : "none"} />
                  </button>
                </div>
              );
            })}
          {Object.keys(groupedTags).length === 0 && <p className="emptyText">{t("noTags")}</p>}
        </div>
      </section>
    </>
  );
}
