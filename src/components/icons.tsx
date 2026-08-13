import type React from "react";
import { BookOpen, FolderOpen, Grid3X3, Library, Link, Music2, Play, Tags } from "lucide-react";
import type { CollectionIcon, ContentType } from "../types";

export const typeIcons: Record<ContentType, React.ReactNode> = {
  document: <BookOpen size={18} />,
  video: <Play size={18} />,
  audio: <Music2 size={18} />,
  image: <Library size={18} />,
  link: <Link size={18} />,
  folder: <FolderOpen size={18} />,
};

export const collectionIcons: Record<CollectionIcon, React.ReactNode> = {
  book: <BookOpen size={18} />,
  play: <Play size={18} />,
  music: <Music2 size={18} />,
  link: <Link size={18} />,
  folder: <FolderOpen size={18} />,
  tag: <Tags size={18} />,
  grid: <Grid3X3 size={18} />,
};

export const collectionIconOptions: CollectionIcon[] = [
  "grid",
  "book",
  "play",
  "music",
  "link",
  "folder",
  "tag",
];
