import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mineEvent } from './mining';
import type { UnsignedEvent } from '$lib/types';

// Mock the notemine wrapper
vi.mock('@notemine/wrapper', () => ({
  Notemine: vi.fn().mockImplementation(() => ({
    mine: vi.fn().mockResolvedValue({
      id: '000000mined',
      pubkey: 'testpubkey',
      created_at: 1234567890,
      kind: 1,
      tags: [['nonce', '123456', '21']],
      content: 'test content',
      sig: 'signature'
    })
  }))
}));

// Mock the key manager
vi.mock('./keys', () => ({
  keyManager: {
    signEvent: vi.fn().mockImplementation((event) => ({
      ...event,
      sig: 'signature'
    }))
  }
}));

describe('mineEvent', () => {
  const mockUnsignedEvent: UnsignedEvent = {
    pubkey: 'testpubkey',
    created_at: 1234567890,
    kind: 1,
    tags: [],
    content: 'test content'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should mine an event with specified difficulty', async () => {
    const difficulty = 21;
    const result = await mineEvent(mockUnsignedEvent, difficulty);

    expect(result).toBeDefined();
    expect(result.id).toBe('000000mined');
    expect(result.tags).toContainEqual(['nonce', '123456', '21']);
    expect(result.sig).toBe('signature');
  });

  it('should add nonce tag to the event', async () => {
    const difficulty = 16;
    const result = await mineEvent(mockUnsignedEvent, difficulty);

    const nonceTag = result.tags.find(tag => tag[0] === 'nonce');
    expect(nonceTag).toBeDefined();
    expect(nonceTag![2]).toBe('21'); // Mocked value
  });

  it('should preserve existing tags', async () => {
    const eventWithTags: UnsignedEvent = {
      ...mockUnsignedEvent,
      tags: [['p', 'somepubkey'], ['e', 'someeventid']]
    };

    const result = await mineEvent(eventWithTags, 21);

    expect(result.tags).toContainEqual(['p', 'somepubkey']);
    expect(result.tags).toContainEqual(['e', 'someeventid']);
    expect(result.tags.some(tag => tag[0] === 'nonce')).toBe(true);
  });

  it('should sign the mined event', async () => {
    const { keyManager } = await import('./keys');
    
    await mineEvent(mockUnsignedEvent, 21);

    expect(keyManager.signEvent).toHaveBeenCalled();
  });
});