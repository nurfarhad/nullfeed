export const CURRENT_SCHEMA_VERSION = 1 as const;

export type Platform = "facebook" | "instagram" | "youtube";

export type FacebookSettings = {
  reels: boolean;
  stories: boolean;
  videos: boolean;
  ads: boolean;
};

export type InstagramSettings = {
  reels: boolean;
  stories: boolean;
  explore: boolean;
};

export type YouTubeSettings = {
  shorts: boolean;
  navigation: boolean;
  redirect: boolean;
  sidebar: boolean;
};

export type Settings = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  enabled: boolean;
  showQuotes: boolean;
  /** Let the Scroll Detector end a Focus Cycle break early when it spots a
   * fast, sustained scroll pace, instead of waiting for the fixed 15-minute
   * timer. Facebook, LinkedIn, X, and Reddit only — the platforms that
   * already have a Focus Cycle. */
  smartTrigger: boolean;
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
  smartTrigger: true,
  lastPlatform: "facebook",
  facebook: Object.freeze({
    reels: true,
    stories: true,
    videos: false,
    ads: true
  }),
  instagram: Object.freeze({
    reels: true,
    stories: true,
    explore: true
  }),
  youtube: Object.freeze({
    shorts: true,
    navigation: true,
    redirect: true,
    sidebar: true
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
    smartTrigger: booleanOrDefault(source.smartTrigger, DEFAULT_SETTINGS.smartTrigger),
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
      )
    },
    youtube: {
      shorts: booleanOrDefault(
        youtube.shorts,
        DEFAULT_SETTINGS.youtube.shorts
      ),
      navigation: booleanOrDefault(
        youtube.navigation,
        DEFAULT_SETTINGS.youtube.navigation
      ),
      redirect: booleanOrDefault(
        youtube.redirect,
        DEFAULT_SETTINGS.youtube.redirect
      ),
      sidebar: booleanOrDefault(
        youtube.sidebar,
        DEFAULT_SETTINGS.youtube.sidebar
      )
    }
  };
}

export function hasActiveFilters(settings: Settings): boolean {
  return (
    Boolean(settings.facebook.reels || settings.facebook.stories || settings.facebook.videos) ||
    Boolean(settings.instagram.reels || settings.instagram.stories || settings.instagram.explore) ||
    Boolean(settings.youtube.shorts || settings.youtube.navigation || settings.youtube.sidebar)
  );
}

