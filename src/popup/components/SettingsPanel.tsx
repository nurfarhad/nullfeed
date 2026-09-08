import type { ComponentType } from "preact";
import type {
  Platform,
  PlatformSettingKey,
  Settings
} from "../../shared/settings";
import {
  BoltIcon,
  CircleDashedIcon,
  CompassIcon,
  LayoutGridIcon,
  MessageCircleIcon,
  MovieIcon,
  PlayerStopIcon,
  SparklesIcon,
  VideoIcon
} from "./Icons";
import { Switch } from "./Switch";

type RowDefinition = readonly [string, string, ComponentType];

const ROWS: Record<Platform, readonly RowDefinition[]> = {
  facebook: [
    ["reels", "Hide Reels", MovieIcon],
    ["stories", "Hide Stories", CircleDashedIcon],
    ["videos", "Hide Videos", VideoIcon],
    ["messages", "Direct to Messages", MessageCircleIcon]
  ],
  instagram: [
    ["reels", "Hide Reels", MovieIcon],
    ["stories", "Hide Stories", CircleDashedIcon],
    ["explore", "Hide Explore", CompassIcon],
    ["messages", "Direct to Messages", MessageCircleIcon]
  ],
  youtube: [
    ["shorts", "Hide Shorts", BoltIcon],
    ["sidebar", "Hide Recommended", SparklesIcon],
    ["feed", "Hide Home Feed", LayoutGridIcon],
    ["comments", "Hide Comments", MessageCircleIcon],
    ["endscreen", "Hide End Screens", PlayerStopIcon]
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
