import { describe, expect, it } from 'vitest';
import { answerFor } from '../../src/web/ui/RequestForm';

const single = { question: 'Colour?', header: 'C', multiSelect: false, options: [] };
const multiple = { ...single, multiSelect: true };

describe('answerFor', () => {
  it('lets typed text replace a single-choice pick', () => {
    expect(answerFor(single, ['Blue'], '')).toBe('Blue');
    expect(answerFor(single, ['Blue'], '  Teal ')).toBe('Teal');
    expect(answerFor(single, [], '')).toBe('');
  });

  it('adds typed text to multiple-choice picks', () => {
    expect(answerFor(multiple, ['Blue', 'Red'], 'Teal')).toBe('Blue, Red, Teal');
    expect(answerFor(multiple, ['Blue'], ' ')).toBe('Blue');
  });
});
