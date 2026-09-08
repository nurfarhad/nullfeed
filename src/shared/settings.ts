export const CURRENT_SCHEMA_VERSION = 1 as const;

export type Platform = "facebook" | "instagram" | "youtube";

export type FacebookSettings = {
  reels: boolean;
  stories: boolean;
  videos: boolean;
  ads: boolean;
  messages: boolean;
  interactions: boolean;
};

export type InstagramSettings = {
  reels: boolean;
  stories: boolean;
  explore: boolean;
  messages: boolean;
};

export type YouTubeSettings = {
  shorts: boolean;
  redirect: boolean;
  sidebar: boolean;
  feed: boolean;
  comments: boolean;
  endscreen: boolean;
};

export type Settings = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  enabled: boolean;
  showQuotes: boolean;
  lastPlatform: Platform;
  facebook: FacebookSettings;
  instagram: InstagramSettings;
  youtube: YouTubeSettings;
};

export type PlatformSettings = {
  facebook: FacebookSettings;
  instagram: InstagramSettings;
  youtube: YouTubeSettings;
};

export type PlatformSettingKey<P extends Platform> = keyof PlatformSettings[P];

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  enabled: true,
  showQuotes: true,
  lastPlatform: "facebook",
  facebook: Object.freeze({
    reels: true,
    stories: true,
    videos: false,
    ads: true,
    messages: false,
    interactions: false
  }),
  instagram: Object.freeze({
    reels: true,
    stories: true,
    explore: true,
    messages: false
  }),
  youtube: Object.freeze({
    shorts: true,
    redirect: true,
    sidebar: true,
    feed: false,
    comments: false,
    endscreen: true
  })
});

const PLATFORMS = new Set<Platform>([
  "facebook",
  "instagram",
  "youtube"
]);

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function validateSettings(value: unknown): Settings {
  const source = recordOrEmpty(value);
  const facebook = recordOrEmpty(source.facebook);
  const instagram = recordOrEmpty(source.instagram);
  const youtube = recordOrEmpty(source.youtube);
  const platform = source.lastPlatform;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: booleanOrDefault(source.enabled, DEFAULT_SETTINGS.enabled),
    showQuotes: booleanOrDefault(source.showQuotes, DEFAULT_SETTINGS.showQuotes),
    lastPlatform:
      typeof platform === "string" && PLATFORMS.has(platform as Platform)
        ? (platform as Platform)
        : DEFAULT_SETTINGS.lastPlatform,
    facebook: {
      reels: booleanOrDefault(
        facebook.reels,
        DEFAULT_SETTINGS.facebook.reels
      ),
      stories: booleanOrDefault(
        facebook.stories,
        DEFAULT_SETTINGS.facebook.stories
      ),
      videos: booleanOrDefault(
        facebook.videos,
        DEFAULT_SETTINGS.facebook.videos
      ),
      ads: booleanOrDefault(
        facebook.ads,
        DEFAULT_SETTINGS.facebook.ads
      ),
      messages: booleanOrDefault(
        facebook.messages,
        DEFAULT_SETTINGS.facebook.messages
      ),
      interactions: booleanOrDefault(
        facebook.interactions,
        DEFAULT_SETTINGS.facebook.interactions
      )
    },
    instagram: {
      reels: booleanOrDefault(
        instagram.reels,
        DEFAULT_SETTINGS.instagram.reels
      ),
      stories: booleanOrDefault(
        instagram.stories,
        DEFAULT_SETTINGS.instagram.stories
      ),
      explore: booleanOrDefault(
        instagram.explore,
        DEFAULT_SETTINGS.instagram.explore
      ),
      messages: booleanOrDefault(
        instagram.messages,
        DEFAULT_SETTINGS.instagram.messages
      )
    },
    youtube: {
      shorts: booleanOrDefault(
        youtube.shorts,
        DEFAULT_SETTINGS.youtube.shorts
      ),
      redirect: booleanOrDefault(
        youtube.redirect,
        DEFAULT_SETTINGS.youtube.redirect
      ),
      sidebar: booleanOrDefault(
        youtube.sidebar,
        DEFAULT_SETTINGS.youtube.sidebar
      ),
      feed: booleanOrDefault(
        youtube.feed,
        DEFAULT_SETTINGS.youtube.feed
      ),
      comments: booleanOrDefault(
        youtube.comments,
        DEFAULT_SETTINGS.youtube.comments
      ),
      endscreen: true
    }
  };
}

export function hasActiveFilters(settings: Settings): boolean {
  return (
    Boolean(
      settings.facebook.reels ||
      settings.facebook.stories ||
      settings.facebook.videos ||
      settings.facebook.messages ||
      settings.facebook.interactions
    ) ||
    Boolean(
      settings.instagram.reels ||
      settings.instagram.stories ||
      settings.instagram.explore ||
      settings.instagram.messages
    ) ||
    Boolean(
      settings.youtube.shorts ||
      settings.youtube.sidebar ||
      settings.youtube.feed ||
      settings.youtube.comments
    )
  );
}

