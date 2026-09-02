import type {
  Platform,
  PlatformSettingKey,
  Settings
} from "../../shared/settings";
import { Switch } from "./Switch";

const ROWS = {
  facebook: [
    ["reels", "Hide Reels"],
    ["stories", "Hide Stories"],
    ["videos", "Hide Videos"]
  ],
  instagram: [
    ["reels", "Hide Reels"],
    ["stories", "Hide Stories"],
    ["explore", "Hide Explore"]
  ],
  youtube: [
    ["shorts", "Hide Shorts"],
    ["navigation", "Hide Short Navigation"],
    ["sidebar", "Hide Recommended Videos"]
  ],
  linkedin: [
    ["feed", "Hide Main Feed"],
    ["news", "Hide News Sidebar"]
  ],
  twitter: [
    ["timeline", "Hide Home Timeline"],
    ["trending", "Hide Trends & What's Happening"]
  ]
} as const;

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
      {ROWS[platform].map(([key, label]) => (
        <Switch
          checked={Boolean(settings[key as keyof Settings[P]])}
          disabled={disabled}
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
