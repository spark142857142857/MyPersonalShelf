import { describe, expect, it } from "vitest";
import {
  parseYoutubeLink,
  youtubeLinkTags,
  youtubeLinkThumbnail,
  youtubeThumbnailUrl,
} from "./youtubeLinks";

// Invented ids of the right shape; none of these point at real content.
const videoId = "dQw4w9WgXcZ";
const albumPlaylistId = "OLAK5uy_abcdefghijklmnopqrstuvwxyz01";
const userPlaylistId = "PLabcdefghijklmnopqrstuvwxyz012345";
const browseId = "MPREb_abcdefghijkl";
const channelId = "UCabcdefghijklmnopqrstuv";

describe("parseYoutubeLink", () => {
  it("reads a YouTube Music track", () => {
    expect(parseYoutubeLink(`https://music.youtube.com/watch?v=${videoId}`)).toEqual({
      kind: "track",
      videoId,
      playlistId: undefined,
      isMusic: true,
    });
  });

  it("keeps the surrounding playlist when a track is opened inside one", () => {
    const info = parseYoutubeLink(
      `https://music.youtube.com/watch?v=${videoId}&list=${albumPlaylistId}`,
    );
    expect(info?.kind).toBe("track");
    expect(info?.playlistId).toBe(albumPlaylistId);
  });

  it("separates generated album playlists from assembled ones", () => {
    expect(parseYoutubeLink(`https://music.youtube.com/playlist?list=${albumPlaylistId}`)?.kind).toBe("album");
    expect(parseYoutubeLink(`https://music.youtube.com/playlist?list=${userPlaylistId}`)?.kind).toBe("playlist");
  });

  it("reads the YouTube Music album browse address", () => {
    expect(parseYoutubeLink(`https://music.youtube.com/browse/${browseId}`)).toEqual({
      kind: "album",
      browseId,
      isMusic: true,
    });
  });

  it("reads artist and channel addresses", () => {
    expect(parseYoutubeLink(`https://music.youtube.com/channel/${channelId}`)?.kind).toBe("artist");
    expect(parseYoutubeLink(`https://www.youtube.com/channel/${channelId}`)?.channelId).toBe(channelId);
  });

  it("treats plain YouTube as video rather than track", () => {
    expect(parseYoutubeLink(`https://www.youtube.com/watch?v=${videoId}`)?.kind).toBe("video");
    expect(parseYoutubeLink(`https://www.youtube.com/watch?v=${videoId}`)?.isMusic).toBe(false);
  });

  it("reads the short form", () => {
    expect(parseYoutubeLink(`https://youtu.be/${videoId}`)).toEqual({
      kind: "video",
      videoId,
      playlistId: undefined,
      isMusic: false,
    });
  });

  it("accepts an address typed without a scheme", () => {
    expect(parseYoutubeLink(`music.youtube.com/watch?v=${videoId}`)?.kind).toBe("track");
  });

  it("returns null for anything that is not YouTube", () => {
    expect(parseYoutubeLink("https://example.com/watch?v=abc")).toBeNull();
    expect(parseYoutubeLink("not a url")).toBeNull();
    expect(parseYoutubeLink("javascript:alert(1)")).toBeNull();
    expect(parseYoutubeLink("")).toBeNull();
  });

  it("reports unknown for YouTube addresses it cannot classify", () => {
    expect(parseYoutubeLink("https://www.youtube.com/feed/subscriptions")?.kind).toBe("unknown");
    expect(parseYoutubeLink("https://music.youtube.com/watch?v=tooshort")?.kind).toBe("unknown");
    expect(parseYoutubeLink(`https://music.youtube.com/browse/NOTANALBUM`)?.kind).toBe("unknown");
  });

  it("rejects ids that are the wrong shape rather than passing them through", () => {
    expect(parseYoutubeLink("https://youtu.be/../../etc/passwd")?.kind).toBe("unknown");
    expect(parseYoutubeLink(`https://www.youtube.com/watch?v=${videoId}x`)?.kind).toBe("unknown");
  });
});

describe("youtubeThumbnailUrl", () => {
  it("builds an i.ytimg.com still for a well-formed id", () => {
    expect(youtubeThumbnailUrl(videoId)).toBe(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  });

  it("refuses ids that are not the expected shape", () => {
    expect(youtubeThumbnailUrl("../evil")).toBeNull();
    expect(youtubeThumbnailUrl("")).toBeNull();
  });

  it("has no thumbnail for playlist-only links", () => {
    const info = parseYoutubeLink(`https://music.youtube.com/playlist?list=${userPlaylistId}`);
    expect(info && youtubeLinkThumbnail(info)).toBeNull();
  });
});

describe("youtubeLinkTags", () => {
  it("tags each kind, and nothing for unclassified links", () => {
    expect(youtubeLinkTags({ kind: "track", isMusic: true })).toEqual(["yt-track"]);
    expect(youtubeLinkTags({ kind: "album", isMusic: true })).toEqual(["yt-album"]);
    expect(youtubeLinkTags({ kind: "playlist", isMusic: true })).toEqual(["yt-playlist"]);
    expect(youtubeLinkTags({ kind: "artist", isMusic: true })).toEqual(["yt-artist"]);
    expect(youtubeLinkTags({ kind: "video", isMusic: false })).toEqual([]);
    expect(youtubeLinkTags({ kind: "unknown", isMusic: false })).toEqual([]);
  });
});
