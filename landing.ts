import type { PluginLandingDefinition } from '../../apps/landing/content-types';

export const landingPage: PluginLandingDefinition = {
  route: '/apps/browser-actions',
  name: 'Browser Actions',
  shortName: 'Browser',
  description: 'Run browser automation tasks from your AppWeaver workspace.',
  features: [
    'Use browser tools through AI prompts.',
    'Keep browser tasks, profiles, and checkpoints together in your workspace.',
  ],
  hasInteractiveDemo: false,
  installScreenshot: 'landing/assets/browser-actions.png',
  assetAliases: [],
  demoStories: [],
  presentation: null,
  roadmapRepoId: null,
};
