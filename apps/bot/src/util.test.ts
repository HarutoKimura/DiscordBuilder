import { describe, expect, it } from 'vitest';
import { truncateText } from './util.js';

describe('truncateText', () => {
  it('returns short text unchanged', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('returns text exactly at the limit unchanged', () => {
    expect(truncateText('abcde', 5)).toBe('abcde');
  });

  it('truncates to max-1 code points plus an ellipsis', () => {
    expect(truncateText('abcdef', 4)).toBe('abc…');
    expect([...truncateText('abcdef', 4)].length).toBe(4);
  });

  it('counts emoji as single code points, not UTF-16 units', () => {
    // 3 emoji = 6 UTF-16 units but only 3 code points — must not be truncated.
    expect(truncateText('👍👍👍', 3)).toBe('👍👍👍');
  });

  it('never splits a surrogate pair when cutting inside emoji text', () => {
    const result = truncateText('👍'.repeat(10), 5);
    expect(result).toBe('👍'.repeat(4) + '…');
    // A split pair leaves a lone surrogate code unit (Discord rejects those).
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(result).not.toMatch(loneSurrogate);
  });

  it('returns only an ellipsis when max is 1', () => {
    expect(truncateText('abc', 1)).toBe('…');
  });

  it('handles max 0 without a negative slice', () => {
    expect(truncateText('abc', 0)).toBe('…');
    expect(truncateText('', 0)).toBe('');
  });
});
