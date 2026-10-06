import { describe, expect, it } from 'vitest';
import { effortLabel, modelLabel, modelTier } from '../../src/shared/models';

describe('modelTier', () => {
  it('ranks model families', () => {
    expect(modelTier('claude-fable-5-1')).toBe('fable');
    expect(modelTier('claude-opus-5-5[1m]')).toBe('opus');
    expect(modelTier('claude-sonnet-5')).toBe('sonnet');
    expect(modelTier('claude-haiku-4-5-20251001')).toBe('haiku');
    expect(modelTier('opus')).toBe('opus');
    expect(modelTier('')).toBe('unknown');
    expect(modelTier('gpt-x')).toBe('unknown');
  });
});

describe('modelLabel', () => {
  it('turns a model id into a readable name', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5');
    expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5');
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5');
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1');
    expect(modelLabel('sonnet')).toBe('Sonnet');
    expect(modelLabel('')).toBe('');
    expect(modelLabel('custom-model')).toBe('custom-model');
  });
});

describe('effortLabel', () => {
  it('names effort levels', () => {
    expect(effortLabel('xhigh')).toBe('Extra high');
    expect(effortLabel('max')).toBe('Max');
    expect(effortLabel('medium')).toBe('Medium');
    expect(effortLabel('')).toBe('');
  });
});
