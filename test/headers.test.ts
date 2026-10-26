import { describe, it, expect } from 'vitest';
import { buildRequestHeaders } from '../src/headers';

describe('buildRequestHeaders', () => {
  it('adds browser-like defaults and a User-Agent', () => {
    const headers = buildRequestHeaders();

    expect(headers.get('accept')).toBe('*/*');
    expect(headers.get('sec-fetch-mode')).toBe('cors');
    expect(headers.get('user-agent')).toContain('Mozilla/5.0');
  });

  it('lets a custom lowercase user-agent override the default', () => {
    const headers = buildRequestHeaders({ 'user-agent': 'custom-agent' });

    expect(headers.get('user-agent')).toBe('custom-agent');
    expect(headers.get('User-Agent')).toBe('custom-agent');
  });

  it('lets custom headers override defaults case-insensitively', () => {
    const headers = buildRequestHeaders({ accept: 'application/json' });

    expect(headers.get('accept')).toBe('application/json');
  });
});
