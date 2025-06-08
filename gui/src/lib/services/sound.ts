import * as Tone from 'tone';
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface SoundSettings {
  enabled: boolean;
  volume: number;
  windowActions: boolean;
  miningActions: boolean;
  networkActions: boolean;
  radioActions: boolean;
  notificationActions: boolean;
}

const DEFAULT_SETTINGS: SoundSettings = {
  enabled: false,
  volume: 0.3,
  windowActions: true,
  miningActions: true,
  networkActions: true,
  radioActions: true,
  notificationActions: true
};

class SoundService {
  private initialized = false;
  private synths = {
    // Window sounds
    windowOpen: null as Tone.Synth | null,
    windowClose: null as Tone.Synth | null,
    windowMove: null as Tone.Synth | null,
    
    // Mining sounds
    miningStart: null as Tone.Synth | null,
    miningComplete: null as Tone.PolySynth | null,
    
    // Network sounds
    relayConnect: null as Tone.Synth | null,
    relayDisconnect: null as Tone.Synth | null,
    eventReceived: null as Tone.Synth | null,
    
    // Radio sounds
    radioTune: null as Tone.Synth | null,
    radioScan: null as Tone.PolySynth | null,
    
    // Static/TV sounds
    static: null as Tone.Noise | null,
    
    // Notification sounds
    notification: null as Tone.PolySynth | null,
    error: null as Tone.Synth | null
  };
  
  public settingsStore = writable<SoundSettings>(this.loadSettings());
  
  constructor() {
    if (browser) {
      this.initialize();
    }
  }
  
  private loadSettings(): SoundSettings {
    if (!browser) return DEFAULT_SETTINGS;
    
    try {
      const saved = localStorage.getItem('notemine:soundSettings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load sound settings:', error);
    }
    
    return DEFAULT_SETTINGS;
  }
  
  private saveSettings(settings: SoundSettings) {
    if (!browser) return;
    
    try {
      localStorage.setItem('notemine:soundSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save sound settings:', error);
    }
  }
  
  public getSettings(): SoundSettings {
    return get(this.settingsStore);
  }
  
  public updateSettings(updates: Partial<SoundSettings>) {
    this.settingsStore.update(settings => {
      const newSettings = { ...settings, ...updates };
      this.saveSettings(newSettings);
      
      // Update volume if changed
      if (updates.volume !== undefined) {
        Tone.Destination.volume.value = Tone.gainToDb(updates.volume);
      }
      
      return newSettings;
    });
  }
  
  private async initialize() {
    if (this.initialized) return;
    
    try {
      await Tone.start();
      
      const settings = this.getSettings();
      Tone.Destination.volume.value = Tone.gainToDb(settings.volume);
      
      // Window sounds
      this.synths.windowOpen = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
      }).toDestination();
      
      this.synths.windowClose = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
      }).toDestination();
      
      this.synths.windowMove = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 }
      }).toDestination();
      
      // Mining sounds
      this.synths.miningStart = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.2 }
      }).toDestination();
      
      this.synths.miningComplete = new Tone.PolySynth().toDestination();
      
      // Network sounds
      this.synths.relayConnect = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 }
      }).toDestination();
      
      this.synths.relayDisconnect = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 }
      }).toDestination();
      
      this.synths.eventReceived = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 }
      }).toDestination();
      
      // Radio sounds
      this.synths.radioTune = new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.2 }
      }).toDestination();
      
      this.synths.radioScan = new Tone.PolySynth().toDestination();
      
      // Static/TV sounds
      this.synths.static = new Tone.Noise({
        type: 'white',
        volume: -20
      }).toDestination();
      
      // Notification sounds
      this.synths.notification = new Tone.PolySynth().toDestination();
      
      this.synths.error = new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
      }).toDestination();
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize sound service:', error);
    }
  }
  
  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
  
  private shouldPlay(category: keyof Pick<SoundSettings, 'windowActions' | 'miningActions' | 'networkActions' | 'radioActions' | 'notificationActions'>): boolean {
    const settings = this.getSettings();
    return settings.enabled && settings[category];
  }
  
  // Window sounds
  async windowOpen() {
    if (!this.shouldPlay('windowActions')) return;
    await this.ensureInitialized();
    this.synths.windowOpen?.triggerAttackRelease('C5', '32n');
  }
  
  async windowClose() {
    if (!this.shouldPlay('windowActions')) return;
    await this.ensureInitialized();
    this.synths.windowClose?.triggerAttackRelease('C4', '32n');
  }
  
  async windowMove() {
    if (!this.shouldPlay('windowActions')) return;
    await this.ensureInitialized();
    this.synths.windowMove?.triggerAttackRelease('G4', '64n');
  }
  
  // Mining sounds
  async miningStart() {
    if (!this.shouldPlay('miningActions')) return;
    await this.ensureInitialized();
    const now = Tone.now();
    this.synths.miningStart?.triggerAttackRelease('C3', '8n', now);
    this.synths.miningStart?.triggerAttackRelease('E3', '8n', now + 0.1);
  }
  
  async miningComplete() {
    if (!this.shouldPlay('miningActions')) return;
    await this.ensureInitialized();
    const now = Tone.now();
    this.synths.miningComplete?.triggerAttackRelease(['C4', 'E4', 'G4'], '4n', now);
    this.synths.miningComplete?.triggerAttackRelease(['E4', 'G4', 'C5'], '4n', now + 0.2);
  }
  
  // Network sounds
  async relayConnect() {
    if (!this.shouldPlay('networkActions')) return;
    await this.ensureInitialized();
    const now = Tone.now();
    this.synths.relayConnect?.triggerAttackRelease('C4', '16n', now);
    this.synths.relayConnect?.triggerAttackRelease('G4', '16n', now + 0.05);
  }
  
  async relayDisconnect() {
    if (!this.shouldPlay('networkActions')) return;
    await this.ensureInitialized();
    const now = Tone.now();
    this.synths.relayDisconnect?.triggerAttackRelease('G4', '16n', now);
    this.synths.relayDisconnect?.triggerAttackRelease('C4', '16n', now + 0.05);
  }
  
  async eventReceived() {
    if (!this.shouldPlay('networkActions')) return;
    await this.ensureInitialized();
    this.synths.eventReceived?.triggerAttackRelease('A5', '64n');
  }
  
  // Radio sounds
  async radioTune() {
    if (!this.shouldPlay('radioActions')) return;
    await this.ensureInitialized();
    const now = Tone.now();
    this.synths.radioTune?.triggerAttackRelease('C4', '8n', now);
    this.synths.radioTune?.triggerAttackRelease('E4', '8n', now + 0.05);
    this.synths.radioTune?.triggerAttackRelease('G4', '8n', now + 0.1);
  }
  
  async radioScan() {
    if (!this.shouldPlay('radioActions')) return;
    await this.ensureInitialized();
    const now = Tone.now();
    this.synths.radioScan?.triggerAttackRelease(['C5', 'E5'], '16n', now);
    this.synths.radioScan?.triggerAttackRelease(['D5', 'F5'], '16n', now + 0.1);
    this.synths.radioScan?.triggerAttackRelease(['E5', 'G5'], '16n', now + 0.2);
  }
  
  // Notification sounds
  async notification() {
    if (!this.shouldPlay('notificationActions')) return;
    await this.ensureInitialized();
    const now = Tone.now();
    this.synths.notification?.triggerAttackRelease(['C5', 'E5'], '8n', now);
    this.synths.notification?.triggerAttackRelease(['E5', 'G5'], '8n', now + 0.1);
  }
  
  async error() {
    if (!this.shouldPlay('notificationActions')) return;
    await this.ensureInitialized();
    this.synths.error?.triggerAttackRelease('A3', '4n');
  }
  
  // Static/TV sounds
  async playStatic() {
    if (!this.shouldPlay('radioActions')) return;
    await this.ensureInitialized();
    this.synths.static?.start();
  }
  
  async stopStatic() {
    if (this.synths.static) {
      this.synths.static.stop();
    }
  }
  
  // Test sound
  async testSound() {
    await this.ensureInitialized();
    const now = Tone.now();
    this.synths.notification?.triggerAttackRelease(['C4', 'E4', 'G4'], '8n', now);
  }
  
  // Get available sound effects
  getEffects() {
    return [
      // Window actions
      { id: 'windowOpen', name: 'Window Open', category: 'windowActions', method: () => this.windowOpen() },
      { id: 'windowClose', name: 'Window Close', category: 'windowActions', method: () => this.windowClose() },
      { id: 'windowMove', name: 'Window Move', category: 'windowActions', method: () => this.windowMove() },
      
      // Mining actions
      { id: 'miningStart', name: 'Mining Start', category: 'miningActions', method: () => this.miningStart() },
      { id: 'miningComplete', name: 'Mining Complete', category: 'miningActions', method: () => this.miningComplete() },
      
      // Network actions
      { id: 'relayConnect', name: 'Relay Connect', category: 'networkActions', method: () => this.relayConnect() },
      { id: 'relayDisconnect', name: 'Relay Disconnect', category: 'networkActions', method: () => this.relayDisconnect() },
      { id: 'eventReceived', name: 'Event Received', category: 'networkActions', method: () => this.eventReceived() },
      
      // Radio actions
      { id: 'radioTune', name: 'Radio Tune', category: 'radioActions', method: () => this.radioTune() },
      { id: 'radioScan', name: 'Radio Scan', category: 'radioActions', method: () => this.radioScan() },
      
      // Notification actions
      { id: 'notification', name: 'Notification', category: 'notificationActions', method: () => this.notification() },
      { id: 'error', name: 'Error', category: 'notificationActions', method: () => this.error() }
    ];
  }
}

export const soundService = new SoundService();

// Legacy export for backward compatibility
export const playSound = {
  radioTune: () => soundService.radioTune(),
  radioScan: () => soundService.radioScan(),
  miningStart: () => soundService.miningStart(),
  miningSuccess: () => soundService.miningComplete(),
  windowOpen: () => soundService.windowOpen(),
  windowClose: () => soundService.windowClose(),
  windowFocus: () => soundService.windowMove()
};