import type { ComponentType } from "preact";
import type {
  Platform,
  PlatformSettingKey,
  Settings
} from "../../shared/settings";
import {
  ArticleIcon,
  BellIcon,
  BoltIcon,
  CircleDashedIcon,
  CompassIcon,
  MovieIcon,
  NavbarIcon,
  SparklesIcon,
  TimelineIcon,
  TrendingIcon,
  VideoIcon
} from "./Icons";
import { Switch } from "./Switch";

type RowDefinition = readonly [string, string, ComponentType];

const ROWS: Record<Platform, readonly RowDefinition[]> = {
  facebook: [
    ["reels", "Hide Reels", MovieIcon],
    ["stories", "Hide Stories", CircleDashedIcon],
    ["videos", "Hide Videos", VideoIcon]
  ],
  instagram: [
    ["reels", "Hide Reels", MovieIcon],
    ["stories", "Hide Stories", CircleDashedIcon],
    ["explore", "Hide Explore", CompassIcon]
  ],
  youtube: [
    ["shorts", "Hide Shorts", BoltIcon],
    ["navigation", "Hide Shorts Nav", NavbarIcon],
    ["sidebar", "Hide Recommended", SparklesIcon]
  ]
};

type SettingsPanelProps<P extends Platform> = {
  disabled: boolean;
  onChange: <K extends PlatformSettingKey<P>>(key: K, value: boolean) => void;
  platform: P;
  settings: Settings[P];
};

export function SettingsPanel<P extends Platform>({
  disabled,
  onChange,
  platform,
  settings
}: SettingsPanelProps<P>) {
  return (
    <div
      aria-labelledby={`tab-${platform}`}
      class="settings-panel"
      id={`panel-${platform}`}
      role="tabpanel"
    >
      {ROWS[platform].map(([key, label, IconComponent]) => (
        <Switch
          checked={Boolean(settings[key as keyof Settings[P]])}
          disabled={disabled}
          icon={<IconComponent />}
          id={`${platform}-${key}`}
          key={key}
          onChange={(value) =>
            onChange(key as PlatformSettingKey<P>, value)
          }
        >
          {label}
        </Switch>
      ))}
    </div>
  );
}
