import type { Database } from 'bun:sqlite';

import type { SubcommandDefinition } from '@src/system/command-definition';
import type { ParsedCliInvocation } from '@src/system/parser-cli';

import {
  getBrowserInferenceSettings,
  saveBrowserInferenceSettings,
} from '../orchestrator/settings';

export function browserSettingsDefinition(
  prefix: string,
  alias: string,
): SubcommandDefinition {
  return {
    name: 'settings',
    aliases: [],
    arguments: [],
    summary:
      'Configure System One decisions and a separate small text-helper model.',
    options: [
      'text-model',
      'text-model-source',
      'decision-provider',
      'decision-model',
    ].map((name) => ({
      name,
      flag: `--${name}`,
      aliases: [],
      kind: 'string' as const,
      summary: `${name}; use default to inherit/reset.`,
    })),
    examples: [
      `${prefix}${alias} settings --text-model <catalog-model-id>`,
      `${prefix}${alias} settings --decision-model default`,
    ],
  };
}

export function handleBrowserSettings(
  db: Database,
  parsed: ParsedCliInvocation,
): string {
  const settings = getBrowserInferenceSettings(db);

  const fields = {
    'text-model': 'textModel',
    'text-model-source': 'textModelSource',
    'decision-provider': 'decisionProvider',
    'decision-model': 'decisionModel',
  } as const;

  let changed = false;
  for (const [option, field] of Object.entries(fields)) {
    const value = parsed.options[option];

    if (typeof value !== 'string') {
      continue;
    }

    if (field === 'decisionProvider') {
      settings[field] = value === 'default' ? 'auto' : value;
    } else {
      settings[field] = value === 'default' ? null : value;
    }

    changed = true;
  }

  if (changed) {
    saveBrowserInferenceSettings(db, settings);
  }

  return [
    'Browser dual-model settings:',
    `System One provider: ${settings.decisionProvider}`,
    `Decision model: ${settings.decisionModel ?? '(System One provider default)'}`,
    `Text-helper source: ${settings.textModelSource ?? '(active workspace source)'}`,
    `Text-helper model: ${settings.textModel ?? '(not configured; choose an inexpensive catalog model)'}`,
    'Text helper is used for initial URL selection when needed, typing, and observed outcome reports. Browser master/conversation models are unchanged.',
  ].join('\n');
}
