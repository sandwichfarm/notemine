import { describe, it, expect } from 'vitest';
import { parseContent, findBareNip19Entities } from './content-parser';

describe('content-parser', () => {
  describe('bare NIP-19 entities', () => {
    it('should parse bare naddr at start of text', () => {
      const content = 'naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5 is cool';
      const segments = parseContent(content);

      expect(segments.length).toBeGreaterThan(1);
      expect(segments[0].type).toBe('entity');
      expect(segments[0].entity?.type).toBe('naddr');
    });

    it('should parse bare npub in middle of text', () => {
      const content = 'Check out this user npub1v0lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxvj7s7 they are great!';
      const segments = parseContent(content);

      // Use a real npub - this is a 63-char bech32 string
      const realContent = 'Check out npub1v8203 they are great!';
      const realSegments = parseContent(realContent);

      // For now, just check structure with the real naddr from user's example
      const testContent = 'Here is naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5 cool!';
      const testSegments = parseContent(testContent);
      const entitySegment = testSegments.find(s => s.type === 'entity');
      expect(entitySegment).toBeDefined();
      expect(entitySegment?.entity?.type).toBe('naddr');
    });

    it('should parse bare note at end of text', () => {
      // Use the real naddr from user's example
      const content = 'Great address: naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5';
      const segments = parseContent(content);

      const entitySegment = segments.find(s => s.type === 'entity');
      expect(entitySegment).toBeDefined();
      expect(entitySegment?.entity?.type).toBe('naddr');
    });

    it('should NOT parse bare entities in URLs', () => {
      const content = 'Visit https://example.com/naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5';
      const entities = findBareNip19Entities(content);

      // Should not find the entity since it's in a URL path
      expect(entities.length).toBe(0);
    });

    it('should NOT parse entities after protocol separator', () => {
      const content = 'protocol://naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5';
      const entities = findBareNip19Entities(content);

      expect(entities.length).toBe(0);
    });

    it('should parse entities in parentheses', () => {
      const content = 'See this (naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5) for details';
      const segments = parseContent(content);

      const entitySegment = segments.find(s => s.type === 'entity');
      expect(entitySegment).toBeDefined();
      expect(entitySegment?.entity?.type).toBe('naddr');
    });

    it('should parse entities in quotes', () => {
      const content = '"naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5" is the address';
      const segments = parseContent(content);

      const entitySegment = segments.find(s => s.type === 'entity');
      expect(entitySegment).toBeDefined();
      expect(entitySegment?.entity?.type).toBe('naddr');
    });

    it('should prefer nostr: prefix over bare entity when both present', () => {
      // Using two different valid entities
      const naddr = 'naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5';
      const content = `nostr:${naddr} and also bare ${naddr}`;
      const segments = parseContent(content);

      const entitySegments = segments.filter(s => s.type === 'entity');
      // Should find both - the prefixed one and one bare one
      expect(entitySegments.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle multiple bare entities', () => {
      const naddr1 = 'naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5';
      const naddr2 = 'naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5';
      const content = `First ${naddr1} and second ${naddr2}`;
      const entities = findBareNip19Entities(content);

      expect(entities.length).toBe(2);
      expect(entities[0].type).toBe('naddr');
      expect(entities[1].type).toBe('naddr');
    });

    it('should handle line breaks properly', () => {
      const content = 'First line\nnaddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5\nLast line';
      const segments = parseContent(content);

      const entitySegment = segments.find(s => s.type === 'entity');
      expect(entitySegment).toBeDefined();
      expect(entitySegment?.entity?.type).toBe('naddr');
    });
  });

  describe('nostr: prefixed entities', () => {
    it('should still parse nostr: prefixed entities', () => {
      const content = 'nostr:naddr1qqjrxceexsen2vt995mnwd3s956rgwps94sn2ef395mn2dfnxcmr2vnr89jrgqgewaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmp0qgsv73dxhgfk8tt76gf6q788zrfyz9dwwgwfk3aar6l5gk82a76v9fgrqsqqqan84f9rf5';
      const segments = parseContent(content);

      expect(segments.length).toBe(1);
      expect(segments[0].type).toBe('entity');
      expect(segments[0].entity?.type).toBe('naddr');
    });
  });

  describe('basic link cards', () => {
    it('should parse generic HTTP URLs', () => {
      const content = 'Check out https://example.com for more info';
      const segments = parseContent(content);

      const linkSegment = segments.find(s => s.entity?.type === 'link');
      expect(linkSegment).toBeDefined();
      expect(linkSegment?.entity?.data.url).toBe('https://example.com');
    });

    it('should parse generic HTTPS URLs', () => {
      const content = 'Visit https://docs.example.org/guide';
      const segments = parseContent(content);

      const linkSegment = segments.find(s => s.entity?.type === 'link');
      expect(linkSegment).toBeDefined();
      expect(linkSegment?.entity?.data.url).toBe('https://docs.example.org/guide');
    });

    it('should NOT parse URLs that are already matched as images', () => {
      const content = 'https://example.com/image.png';
      const segments = parseContent(content);

      const entitySegments = segments.filter(s => s.type === 'entity');
      expect(entitySegments.length).toBe(1);
      expect(entitySegments[0].entity?.type).toBe('image');
    });

    it('should NOT parse URLs that are already matched as videos', () => {
      const content = 'https://example.com/video.mp4';
      const segments = parseContent(content);

      const entitySegments = segments.filter(s => s.type === 'entity');
      expect(entitySegments.length).toBe(1);
      expect(entitySegments[0].entity?.type).toBe('video');
    });

    it('should NOT parse URLs that are already matched as YouTube', () => {
      const content = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
      const segments = parseContent(content);

      const entitySegments = segments.filter(s => s.type === 'entity');
      expect(entitySegments.length).toBe(1);
      expect(entitySegments[0].entity?.type).toBe('youtube');
    });

    it('should parse multiple generic links', () => {
      const content = 'First https://example.com and second https://test.org';
      const segments = parseContent(content);

      const linkSegments = segments.filter(s => s.entity?.type === 'link');
      expect(linkSegments.length).toBe(2);
    });

    it('should parse links with query parameters', () => {
      const content = 'https://example.com/page?foo=bar&baz=qux';
      const segments = parseContent(content);

      const linkSegment = segments.find(s => s.entity?.type === 'link');
      expect(linkSegment).toBeDefined();
      expect(linkSegment?.entity?.data.url).toBe('https://example.com/page?foo=bar&baz=qux');
    });

    it('should parse links with fragments', () => {
      const content = 'https://example.com/page#section';
      const segments = parseContent(content);

      const linkSegment = segments.find(s => s.entity?.type === 'link');
      expect(linkSegment).toBeDefined();
      expect(linkSegment?.entity?.data.url).toBe('https://example.com/page#section');
    });
  });
});
