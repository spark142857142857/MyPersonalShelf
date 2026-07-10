export type SearchCommand = "text" | "tag" | "type" | "collection" | "open" | "play" | string;

export interface ParsedSearchQuery {
  command: SearchCommand;
  value: string;
}

interface ShortcutLikeEvent {
  ctrlKey: boolean;
  metaKey: boolean;
  key: string;
}

export function isSearchFocusShortcut(event: ShortcutLikeEvent, dialogOpen: boolean) {
  return !dialogOpen && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
}

const commandAliases: Record<string, SearchCommand> = {
  "명령": "text",
  "검색": "text",
  "태그": "tag",
  "종류": "type",
  "타입": "type",
  "컬렉션": "collection",
  "모음": "collection",
  "열기": "open",
  "재생": "play",
};

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmed = query.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0) {
    return { command: "text", value: trimmed.toLowerCase() };
  }

  const rawCommand = trimmed.slice(0, separatorIndex).toLowerCase();
  const knownCommand = commandAliases[rawCommand] ??
    (["text", "tag", "type", "collection", "open", "play"].includes(rawCommand)
      ? rawCommand
      : null);
  if (!knownCommand) {
    return { command: "text", value: trimmed.toLowerCase() };
  }

  return {
    command: knownCommand,
    value: trimmed.slice(separatorIndex + 1).trim().toLowerCase(),
  };
}
