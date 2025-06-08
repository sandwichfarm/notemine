import { writable, derived, get } from 'svelte/store';

export type InterfaceState = {
  hasKeys: boolean;
  hasRelays: boolean;
  hasNotes: boolean;
  isMining: boolean;
  isTyping: boolean;
  noteCount: number;
  relayCount: number;
  miningQueueSize: number;
  lastInteraction: number;
  viewportWidth: number;
  viewportHeight: number;
  focusArea: 'compose' | 'feed' | 'settings' | 'none';
};

export type ElementMetrics = {
  scale: number;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  priority: number;
};

const initialState: InterfaceState = {
  hasKeys: false,
  hasRelays: false,
  hasNotes: false,
  isMining: false,
  isTyping: false,
  noteCount: 0,
  relayCount: 0,
  miningQueueSize: 0,
  lastInteraction: Date.now(),
  viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
  viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 768,
  focusArea: 'none'
};

export const interfaceState = writable<InterfaceState>(initialState);

// Track user interactions
export function trackInteraction(area: InterfaceState['focusArea']) {
  interfaceState.update(s => ({
    ...s,
    lastInteraction: Date.now(),
    focusArea: area
  }));
}

// Update viewport dimensions
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    interfaceState.update(s => ({
      ...s,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    }));
  });
}

// Derive element metrics based on current state
export const composeMetrics = derived(interfaceState, ($state): ElementMetrics => {
  const base = {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fontSize: 16,
    priority: 1
  };

  // No keys = minimal presence
  if (!$state.hasKeys) {
    return {
      ...base,
      scale: 0.3,
      opacity: 0.4,
      x: $state.viewportWidth / 2 - 150,
      y: $state.viewportHeight / 2 - 50,
      width: 300,
      height: 100
    };
  }

  // Typing = expand and center
  if ($state.isTyping || $state.focusArea === 'compose') {
    return {
      ...base,
      scale: 1.2,
      opacity: 1,
      x: $state.viewportWidth * 0.1,
      y: $state.viewportHeight * 0.3,
      width: $state.viewportWidth * 0.8,
      height: $state.viewportHeight * 0.4,
      fontSize: 24,
      priority: 10
    };
  }

  // Mining = show progress prominently
  if ($state.isMining) {
    return {
      ...base,
      scale: 0.9,
      opacity: 0.95,
      x: $state.viewportWidth * 0.6,
      y: 50,
      width: $state.viewportWidth * 0.35,
      height: 200,
      fontSize: 18,
      priority: 8
    };
  }

  // Default state
  return {
    ...base,
    scale: 0.7,
    opacity: 0.8,
    x: 50,
    y: 50,
    width: 400,
    height: 150,
    fontSize: 16,
    priority: 5
  };
});

export const feedMetrics = derived(interfaceState, ($state): ElementMetrics => {
  const base = {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fontSize: 14,
    priority: 1
  };

  // No notes = hidden
  if (!$state.hasNotes) {
    return {
      ...base,
      scale: 0,
      opacity: 0,
      width: 0,
      height: 0
    };
  }

  // Focus on feed = maximize
  if ($state.focusArea === 'feed') {
    return {
      ...base,
      scale: 1,
      opacity: 1,
      x: 0,
      y: 0,
      width: $state.viewportWidth,
      height: $state.viewportHeight,
      fontSize: 16,
      priority: 10
    };
  }

  // Typing = minimize feed
  if ($state.isTyping) {
    return {
      ...base,
      scale: 0.5,
      opacity: 0.3,
      x: $state.viewportWidth * 0.7,
      y: $state.viewportHeight * 0.6,
      width: $state.viewportWidth * 0.25,
      height: $state.viewportHeight * 0.35,
      fontSize: 12,
      priority: 2
    };
  }

  // Default state
  return {
    ...base,
    scale: 0.8,
    opacity: 0.9,
    x: 50,
    y: 250,
    width: $state.viewportWidth - 100,
    height: $state.viewportHeight - 300,
    fontSize: 14,
    priority: 6
  };
});

export const settingsMetrics = derived(interfaceState, ($state): ElementMetrics => {
  const base = {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fontSize: 12,
    priority: 1
  };

  // Settings focused = expand
  if ($state.focusArea === 'settings') {
    return {
      ...base,
      scale: 1,
      opacity: 0.95,
      x: $state.viewportWidth * 0.2,
      y: $state.viewportHeight * 0.2,
      width: $state.viewportWidth * 0.6,
      height: $state.viewportHeight * 0.6,
      fontSize: 14,
      priority: 9
    };
  }

  // Hide when typing
  if ($state.isTyping) {
    return {
      ...base,
      scale: 0,
      opacity: 0,
      width: 0,
      height: 0
    };
  }

  // Default minimized
  return {
    ...base,
    scale: 0.6,
    opacity: 0.7,
    x: $state.viewportWidth - 200,
    y: 20,
    width: 180,
    height: 80,
    fontSize: 11,
    priority: 3
  };
});

// Auto-hide idle elements
export const idleTimeout = derived(interfaceState, ($state) => {
  const idleTime = Date.now() - $state.lastInteraction;
  return idleTime > 30000; // 30 seconds
});