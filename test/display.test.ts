import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, sanitizeForDisplay, sanitizeMultiline } from '../src/display';

describe('display helpers', () => {
  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB');
  });

  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1m 05s');
    expect(formatDuration(3665)).toBe('1h 01m 05s');
  });

  it('escapes terminal control characters', () => {
    expect(sanitizeForDisplay('\u001b[31mred\u001b[0m')).toBe('\\x1b[31mred\\x1b[0m');
    expect(sanitizeMultiline('line 1\n\u001b]0;title\u0007')).toBe('line 1\n\\x1b]0;title\\x07');
  });
});
