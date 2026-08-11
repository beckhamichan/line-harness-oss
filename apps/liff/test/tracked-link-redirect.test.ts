import { describe, expect, it } from 'vitest';
import { buildTrackedLinkRedirect } from '../src/lib/tracked-link-redirect.js';

const ALLOWED_ORIGIN = 'https://worker.example';

describe('buildTrackedLinkRedirect', () => {
  it('adds the LINE user ID when the redirect has no query', () => {
    expect(buildTrackedLinkRedirect('https://worker.example/t/link-1', 'U123', ALLOWED_ORIGIN)).toBe(
      'https://worker.example/t/link-1?lu=U123',
    );
  });

  it('preserves existing query parameters and encodes the LINE user ID', () => {
    expect(
      buildTrackedLinkRedirect('https://worker.example/t/link-1?source=line', 'U 123', ALLOWED_ORIGIN),
    ).toBe('https://worker.example/t/link-1?source=line&lu=U+123');
  });

  it('rejects non-HTTP redirect protocols', () => {
    expect(() => buildTrackedLinkRedirect('javascript:alert(1)', 'U123', ALLOWED_ORIGIN)).toThrow(
      'Unsupported redirect protocol',
    );
  });

  it('rejects redirects to a different origin', () => {
    expect(() =>
      buildTrackedLinkRedirect('https://evil.example/phish', 'U123', ALLOWED_ORIGIN),
    ).toThrow('Unsupported redirect origin');
  });
});
