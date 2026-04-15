import { renderHelpText } from '@src/commands/help/renderers/text';
import type { HelpRepresentation } from '@src/commands/help/representation';
import type { TextRenderContext } from '@src/system/render-context';

import type { MessageRepresentation } from './output';

export type BrowserRenderable = HelpRepresentation | MessageRepresentation;

export function renderBrowserText(
  representation: BrowserRenderable,
  context: TextRenderContext,
): string {
  if (representation.kind === 'help') {
    return renderHelpText(representation, context);
  }

  return representation.data.text;
}
