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
};

export type SnoozeSites = {
  facebook: boolean;
  instagram: boolean;
  youtube: boolean;
};

export type SnoozeSettings = {
  active: boolean;
  until: number | null;
  sites: SnoozeSites;
};

export type Settings = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  enabled: boolean;
  lastPlatform: Platform;
  facebook: FacebookSettings;
  instagram: InstagramSettings;
  youtube: YouTubeSettings;
  snooze: SnoozeSettings;
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
    redirect: true
  }),
  snooze: Object.freeze({
    active: false,
    until: null,
    sites: Object.freeze({ facebook: true, instagram: true, youtube: true })
  })
});

const PLATFORMS = new Set<Platform>(["facebook", "instagram", "youtube"]);

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
  const snooze = recordOrEmpty(source.snooze);
  const snoozeSites = recordOrEmpty(snooze.sites);
  const platform = source.lastPlatform;

  const untilRaw = snooze.until;
  const untilValid =
    typeof untilRaw === "number" && Number.isFinite(untilRaw)
      ? untilRaw
      : null;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: booleanOrDefault(source.enabled, DEFAULT_SETTINGS.enabled),
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
      )
    },
    snooze: {
      active: booleanOrDefault(
        snooze.active,
        DEFAULT_SETTINGS.snooze.active
      ),
      until: untilValid,
      sites: {
        facebook: booleanOrDefault(
          snoozeSites.facebook,
          DEFAULT_SETTINGS.snooze.sites.facebook
        ),
        instagram: booleanOrDefault(
          snoozeSites.instagram,
          DEFAULT_SETTINGS.snooze.sites.instagram
        ),
        youtube: booleanOrDefault(
          snoozeSites.youtube,
          DEFAULT_SETTINGS.snooze.sites.youtube
        )
      }
    }
  };
}

export function hasActiveFilters(settings: Settings): boolean {
  return Object.values(settings.facebook).some(Boolean) ||
    Object.values(settings.instagram).some(Boolean) ||
    Object.values(settings.youtube).some(Boolean);
}
