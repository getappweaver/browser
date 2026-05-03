// ---------------------------------------------------------------------------
// plugins/browser/init.ts — BrowserPlugin definition
// ---------------------------------------------------------------------------

import { basename } from 'path';

import type { Database } from 'bun:sqlite';

import {
  parsePluginPackageJson,
  type BotPlugin,
  type PluginContext,
  type PluginInvocationContext,
} from '@src/core/plugin';
import type { WebNodeRoot } from '@src/web/ui-schema';

import { handleBrowserAdapter } from './adapter';
import { aiDefinition } from './ai';
import {
  getBrowserCommandDefinition,
  getBrowserHelpLines,
} from './commands/help/module';
import { openDb } from './db';

const pluginDir = import.meta.dir;
const alias = basename(pluginDir);

const browserPkg = parsePluginPackageJson({ pluginDir });

if (!browserPkg) {
  throw new Error(
    `Browser plugin: invalid or missing package.json. Required: name, version, dmBot.coreApiVersion, dmBot.description`,
  );
}

export let BrowserPluginContext: PluginContext | null = null;
export let BrowserPluginDb: Database | null = null;

export const BrowserPlugin: BotPlugin = {
  identity: {
    name: browserPkg.name,
    alias,
    version: browserPkg.version,
    description: browserPkg.description,
  },
  handler: async (
    args: string[],
    context: PluginInvocationContext,
  ): Promise<string | WebNodeRoot> => {
    if (!BrowserPluginContext) {
      throw new Error('BrowserPlugin not initialized');
    }

    if (!BrowserPluginDb) {
      throw new Error('BrowserPluginDb not initialized');
    }

    return handleBrowserAdapter({
      args,
      prefix: context.prefix,
      alias,
      db: BrowserPluginDb,
      source: context.source,
      identity: BrowserPlugin.identity,
      storedCtx: BrowserPluginContext,
      runAgent: context.runAgent,
    });
  },
  onInit: (ctx: PluginContext) => {
    BrowserPluginContext = ctx;
    BrowserPluginDb = openDb();
  },
  helpText: (helpAlias: string, prefix: string) => [
    `Browser automation — AI drives your browser to complete tasks. Use "${prefix}${helpAlias} run <prompt>" to start.`,
    '',
    `${prefix}${helpAlias} help [topic] — structured help`,
    ...getBrowserHelpLines(prefix, helpAlias),
  ],
  aiDefinition,
  commandDefinition: (prefix: string, pluginAlias: string) =>
    getBrowserCommandDefinition(prefix, pluginAlias),
};
