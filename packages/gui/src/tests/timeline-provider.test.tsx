import { render } from '@solidjs/testing-library';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Component, createEffect } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { TimelineProvider, useTimelineContext, type WotContext } from '../providers/TimelineProvider';

let currentUser: { isAnon: boolean; pubkey: string } | null = null;
let preferencesState: { debugMode: boolean; anonWotPreference: any } = {
  debugMode: false,
  anonWotPreference: null,
};
const clearAnonPreferenceMock = vi.fn();

vi.mock('../providers/UserProvider', () => ({
  useUser: () => ({
    user: () => currentUser,
  }),
}));

vi.mock('../providers/PreferencesProvider', () => ({
  usePreferences: () => ({
    preferences: () => preferencesState,
    clearAnonWotPreference: clearAnonPreferenceMock,
  }),
}));

vi.mock('../lib/applesauce', () => ({
  DEFAULT_POW_RELAY: 'wss://default',
  PROFILE_RELAYS: ['wss://profile-a', 'wss://profile-b'],
  getUserInboxRelaysSignal: () => [],
  getUserOutboxRelaysSignal: () => [],
}));

const CaptureContext: Component<{ onUpdate: (ctx: WotContext | null) => void }> = (props) => {
  const { context } = useTimelineContext();
  createEffect(() => {
    props.onUpdate(context());
  });
  return null;
};

describe('TimelineProvider', () => {
  beforeEach(() => {
    currentUser = null;
    preferencesState = { debugMode: false, anonWotPreference: null };
    clearAnonPreferenceMock.mockClear();
  });

  it('emits authenticated context when user is signed in', () => {
    currentUser = { isAnon: false, pubkey: 'f'.repeat(64) };
    let ctx: WotContext | null = null;

    const dispose = render(() => (
      <TimelineProvider>
        <CaptureContext onUpdate={(next) => (ctx = next)} />
      </TimelineProvider>
    ));

    expect(ctx).toBeTruthy();
    expect(ctx?.source).toBe('authenticated');
    expect(ctx?.pubkey).toBe(currentUser!.pubkey);
    expect(ctx?.relaySet).toContain('wss://default');
    dispose.unmount();
  });

  it('returns null context for anonymous users without a saved preference', () => {
    currentUser = { isAnon: true, pubkey: 'abcd' };
    let ctx: WotContext | null = null;

    const dispose = render(() => (
      <TimelineProvider>
        <CaptureContext onUpdate={(next) => (ctx = next)} />
      </TimelineProvider>
    ));

    expect(ctx).toBeNull();
    dispose.unmount();
  });

  it('derives anon context from saved preference', () => {
    currentUser = { isAnon: true, pubkey: 'abcd' };
    const hex = '1'.repeat(64);
    const npub = nip19.npubEncode(hex);
    preferencesState = {
      debugMode: false,
      anonWotPreference: { npub, relayHints: ['wss://hint.test'], lastUsed: 123 },
    };

    let ctx: WotContext | null = null;
    const dispose = render(() => (
      <TimelineProvider>
        <CaptureContext onUpdate={(next) => (ctx = next)} />
      </TimelineProvider>
    ));

    expect(ctx).toBeTruthy();
    expect(ctx?.source).toBe('anon');
    expect(ctx?.pubkey).toBe(hex);
    expect(ctx?.relaySet).toContain('wss://hint.test');
    dispose.unmount();
  });

  it('clears invalid anon preference and exposes null context', async () => {
    currentUser = { isAnon: true, pubkey: 'abcd' };
    preferencesState = {
      debugMode: false,
      anonWotPreference: { npub: 'invalid', relayHints: [], lastUsed: 0 },
    };

    let ctx: WotContext | null = null;
    const dispose = render(() => (
      <TimelineProvider>
        <CaptureContext onUpdate={(next) => (ctx = next)} />
      </TimelineProvider>
    ));

    await Promise.resolve();

    expect(ctx).toBeNull();
    expect(clearAnonPreferenceMock).toHaveBeenCalledTimes(1);
    dispose.unmount();
  });
});
