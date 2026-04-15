import {
  createMessageRepresentation,
  type MessageRepresentation,
} from './output';

export function toneForPlainReply(text: string): 'info' | 'success' | 'error' {
  if (
    text.startsWith('Usage:') ||
    text.startsWith('Failed') ||
    text.startsWith('Error')
  ) {
    return 'error';
  }

  if (
    text.startsWith('No browser tasks') ||
    text.startsWith('No action needed') ||
    text.includes('waiting')
  ) {
    return 'info';
  }

  return 'success';
}

export function BrowserReplyMessage(params: {
  alias: string;
  subcommand: string;
  text: string;
}): MessageRepresentation {
  return createMessageRepresentation({
    command: params.alias,
    subcommand: params.subcommand,
    tone: toneForPlainReply(params.text),
    text: params.text,
  });
}
