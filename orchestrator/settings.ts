import type { Database } from 'bun:sqlite';
import { z } from 'zod';

export const BrowserInferenceSettingsSchema = z.object({
  decisionProvider: z.string().trim().min(1),
  decisionModel: z.string().trim().min(1).nullable(),
  textModel: z.string().trim().min(1).nullable(),
  textModelSource: z.string().trim().min(1).nullable(),
});

export type BrowserInferenceSettings = z.infer<
  typeof BrowserInferenceSettingsSchema
>;

export function createBrowserSettingsTable(db: Database): void {
  db.run(
    'CREATE TABLE IF NOT EXISTS browser_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  );
}

export function getBrowserInferenceSettings(
  db: Database,
): BrowserInferenceSettings {
  const row = db
    .query("SELECT value FROM browser_settings WHERE key = 'inference'")
    .get() as { value: string } | null;

  return row
    ? BrowserInferenceSettingsSchema.parse(JSON.parse(row.value))
    : {
        decisionProvider: 'auto',
        decisionModel: null,
        textModel: null,
        textModelSource: null,
      };
}

export function saveBrowserInferenceSettings(
  db: Database,
  settings: BrowserInferenceSettings,
): void {
  const parsed = BrowserInferenceSettingsSchema.parse(settings);

  db.run(
    "INSERT INTO browser_settings (key, value) VALUES ('inference', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(parsed)],
  );
}
