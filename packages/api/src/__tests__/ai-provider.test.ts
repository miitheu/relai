import { describe, it, expect } from 'vitest';
import { getDefaultModel } from '../ai/provider';

describe('AI Provider', () => {
  it('returns correct default models', () => {
    expect(getDefaultModel('anthropic')).toContain('claude');
    expect(getDefaultModel('openai')).toBe('gpt-4o');
    expect(getDefaultModel('google')).toContain('gemini');
    expect(getDefaultModel('ollama')).toBe('llama3.1');
  });
});
