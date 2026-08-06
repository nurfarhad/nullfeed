import type { JSX } from "preact";

import { PLATFORM_LABELS } from "../../shared/constants";
import type { Platform } from "../../shared/settings";

const PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[];

type PlatformTabsProps = {
  active: Platform;
  onChange: (platform: Platform) => void;
};

export function PlatformTabs({ active, onChange }: PlatformTabsProps) {
  function handleKeyDown(
    event: JSX.TargetedKeyboardEvent<HTMLButtonElement>
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const currentIndex = PLATFORMS.indexOf(active);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + delta + PLATFORMS.length) % PLATFORMS.length;
    const nextPlatform = PLATFORMS[nextIndex];
    onChange(nextPlatform);
    document.getElementById(`tab-${nextPlatform}`)?.focus();
  }

  return (
    <div aria-label="Platforms" class="platform-tabs" role="tablist">
      {PLATFORMS.map((platform) => (
        <button
          aria-controls={`panel-${platform}`}
          aria-selected={active === platform}
          class="platform-tab"
          id={`tab-${platform}`}
          key={platform}
          onClick={() => onChange(platform)}
          onKeyDown={handleKeyDown}
          role="tab"
          tabIndex={active === platform ? 0 : -1}
          type="button"
        >
          {PLATFORM_LABELS[platform]}
        </button>
      ))}
    </div>
  );
}
