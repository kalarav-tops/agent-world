const INJECTED_BLOCKS = [
  'system-reminder',
  'browser_instruction',
  'ide_selection',
  'ide_opened_file',
  'ide_diagnostics',
  'local-command-caveat',
  'command-message',
];

const INJECTED_PATTERN = new RegExp(`<(${INJECTED_BLOCKS.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'g');
const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/;
const PASTED_TAG = /<\/?pasted_content\b[^>]*>/g;

/**
 * Turn a raw prompt, as stored in a transcript, into the text the human typed.
 * Context Claude Code injects (reminders, IDE selections, browser instructions) is removed,
 * pasted content is unwrapped, and a slash command is shown as `/name args`.
 * @param raw - prompt text from the transcript
 * @returns cleaned prompt
 */
export function cleanPrompt(raw: string): string {
  const command = COMMAND_NAME.exec(raw);
  if (command) {
    const args = COMMAND_ARGS.exec(raw)?.[1]?.trim() ?? '';
    return `${command[1]?.trim() ?? ''}${args ? ` ${args}` : ''}`;
  }
  return raw
    .replace(INJECTED_PATTERN, '')
    .replace(PASTED_TAG, '')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}
