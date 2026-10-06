import { describe, expect, it } from 'vitest';
import { cleanPrompt } from '../../src/shared/prompt-text';

describe('cleanPrompt', () => {
  it('keeps plain prompt text', () => {
    expect(cleanPrompt('fix the build')).toBe('fix the build');
  });

  it('removes injected context blocks', () => {
    const raw = '<system-reminder>secret context</system-reminder>\nfix it<ide_selection>code</ide_selection>';
    expect(cleanPrompt(raw)).toBe('fix it');
  });

  it('removes browser instructions and ide notices', () => {
    const raw = '<browser_instruction># Chrome\nlots</browser_instruction>\n\n<ide_opened_file>a.ts</ide_opened_file>do the thing';
    expect(cleanPrompt(raw)).toBe('do the thing');
  });

  it('unwraps pasted content but keeps its text', () => {
    expect(cleanPrompt('first fix this <pasted_content id="1">ERROR x</pasted_content>')).toBe('first fix this ERROR x');
  });

  it('turns a slash command into its typed form', () => {
    const raw = '<command-message>review</command-message>\n<command-name>/code-review</command-name>\n<command-args>high</command-args>';
    expect(cleanPrompt(raw)).toBe('/code-review high');
  });

  it('collapses runs of blank lines and trims', () => {
    expect(cleanPrompt('\n\n a\n\n\n\nb \n')).toBe('a\n\nb');
  });

  it('returns an empty string when only injected content remains', () => {
    expect(cleanPrompt('<system-reminder>x</system-reminder>')).toBe('');
  });
});
