import {
  CURRENT_SCHEMA_VERSION,
  type Settings,
  validateSettings
} from "./settings";

export function migrateSettings(value: unknown): Settings {
  const migrated = validateSettings(value);
  return {
    ...migrated,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}
