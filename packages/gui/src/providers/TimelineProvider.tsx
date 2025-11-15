import { ParentComponent, createContext, useContext, createMemo, createSignal, Accessor, createEffect } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { useUser } from './UserProvider';
import { usePreferences } from './PreferencesProvider';
import type { AnonWotPreference } from '../types/preferences';
import {
  DEFAULT_POW_RELAY,
  PROFILE_RELAYS,
  getUserInboxRelaysSignal,
  getUserOutboxRelaysSignal,
} from '../lib/applesauce';
import { parseNpub } from '../lib/npub';

const createRunId = () => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface WotContext {
  runId: string;
  npub: string;
  pubkey: string;
  relaySet: string[];
  createdAt: number;
  source: 'authenticated' | 'anon';
  preference?: AnonWotPreference;
}

interface TimelineContextValue {
  context: Accessor<WotContext | null>;
  ensureContext: () => WotContext;
  refreshContext: () => void;
}

const TimelineContext = createContext<TimelineContextValue | null>(null);

const dedupeRelays = (relays: (string | undefined)[] = []) => {
  return Array.from(new Set(relays.filter(Boolean))) as string[];
};

export const TimelineProvider: ParentComponent = (props) => {
  const { user } = useUser();
  const { preferences, clearAnonWotPreference } = usePreferences();
  const [version, setVersion] = createSignal(0);

  const logDebug = (...args: unknown[]) => {
    if (preferences().debugMode) {
      console.debug('[wot-context]', ...args);
    }
  };

  // Clear obviously invalid anon preferences eagerly so guards can run immediately.
  createEffect(() => {
    const pref = preferences().anonWotPreference;
    if (!pref) return;
    if (!parseNpub(pref.npub)) {
      logDebug('Clearing invalid anon preference npub');
      clearAnonWotPreference();
    }
  });

  const context = createMemo<WotContext | null>(() => {
    version(); // depend on manual refreshes
    const currentUser = user();
    if (currentUser && !currentUser.isAnon) {
      const relays = dedupeRelays([
        DEFAULT_POW_RELAY,
        ...PROFILE_RELAYS,
        ...getUserInboxRelaysSignal(),
        ...getUserOutboxRelaysSignal(),
      ]);
      const npub = nip19.npubEncode(currentUser.pubkey);
      logDebug('Derived authenticated WoT context', npub.slice(0, 12));
      return {
        runId: createRunId(),
        npub,
        pubkey: currentUser.pubkey,
        relaySet: relays,
        createdAt: Date.now(),
        source: 'authenticated',
      };
    }

    const pref = preferences().anonWotPreference;
    if (!pref) {
      logDebug('No anon WoT preference found');
      return null;
    }

    const parsed = parseNpub(pref.npub);
    if (!parsed) {
      // Preference will be cleared by the effect above.
      logDebug('Anon WoT preference invalid after decode');
      return null;
    }

    const relaySet = dedupeRelays([
      DEFAULT_POW_RELAY,
      ...PROFILE_RELAYS,
      ...(pref.relayHints ?? []),
    ]);

    logDebug('Derived anon WoT context', parsed.npub.slice(0, 12));
    return {
      runId: createRunId(),
      npub: parsed.npub,
      pubkey: parsed.hex,
      relaySet,
      createdAt: pref.lastUsed || Date.now(),
      source: 'anon',
      preference: pref,
    };
  });

  const ensureContext = () => {
    const ctx = context();
    if (!ctx) throw new Error('Timeline context unavailable');
    return ctx;
  };

  const refreshContext = () => setVersion((v) => v + 1);

  return (
    <TimelineContext.Provider value={{ context, ensureContext, refreshContext }}>
      {props.children}
    </TimelineContext.Provider>
  );
};

export function useTimelineContext(): TimelineContextValue {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error('useTimelineContext must be used within TimelineProvider');
  }
  return ctx;
}
