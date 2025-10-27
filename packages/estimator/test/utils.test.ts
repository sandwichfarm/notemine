import { describe, it, expect } from 'vitest';
import { utf8ByteLength, formatTime } from '../src/utils.js';
import { attemptsFromBits } from '../src/difficulty.js';

describe('utils', () => {
  it('utf8ByteLength counts bytes correctly', () => {
    expect(utf8ByteLength('a')).toBe(1);
    expect(utf8ByteLength('😀')).toBe(4);
    expect(utf8ByteLength('ä')).toBe(2);
    expect(utf8ByteLength('abc')).toBe(3);
  });

  it('formatTime formats properly', () => {
    expect(formatTime(0.2)).toMatch(/ms$/);
    expect(formatTime(5)).toBe('5s');
    expect(formatTime(5.2)).toBe('5.2s');
    expect(formatTime(65)).toBe('1m05s');
  });

  it('attemptsFromBits grows exponentially', () => {
    expect(attemptsFromBits(0)).toBe(1);
    expect(attemptsFromBits(1)).toBe(2);
    expect(attemptsFromBits(10)).toBe(1024);
  });
});
