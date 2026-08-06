import { describe, expect, it } from "vitest";

import { migrateSettings } from "../../src/shared/migrations";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS
} from "../../src/shared/settings";

describe("settings migration", () => {
  it("adds defaults for new or missing keys", () => {
    expect(
      migrateSettings({
        schemaVersion: 0,
        enabled: false,
        youtube: { shorts: false }
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabled: false,
      youtube: {
        ...DEFAULT_SETTINGS.youtube,
        shorts: false
      }
    });
  });
});
