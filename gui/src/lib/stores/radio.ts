import { writable, derived, get } from 'svelte/store';
import type { RadioStation, MusicTrack } from '$lib/types/music';
import * as Tone from 'tone';
import { playSound } from '$lib/services/sound';

interface RadioState {
  stations: RadioStation[];
  currentStation: RadioStation | null;
  isPlaying: boolean;
  isLoading: boolean;
  isScanning: boolean; // New: scan mode state
  scanInterval: number; // New: how long to stay on each station during scan (ms)
  volume: number;
  staticDuration: number; // How long static plays when changing stations
  error: string | null;
}

function createRadioStore() {
  const { subscribe, set, update } = writable<RadioState>({
    stations: [],
    currentStation: null,
    isPlaying: false,
    isLoading: false,
    isScanning: false,
    scanInterval: 5000, // 5 seconds per station during scan
    volume: 0.7,
    staticDuration: 800, // milliseconds
    error: null
  });

  let audioElement: HTMLAudioElement | null = null;
  let staticNoise: Tone.Noise | null = null;
  let staticFilter: Tone.Filter | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let audioSource: MediaElementAudioSourceNode | null = null;

  // Initialize Tone.js static noise generator
  async function initializeStatic() {
    if (!staticNoise) {
      await Tone.start();
      
      // Create white noise generator with filter for radio static effect
      staticNoise = new Tone.Noise('white');
      staticFilter = new Tone.Filter({
        frequency: 2000,
        type: 'bandpass',
        rolloff: -24
      });
      
      // Connect noise -> filter -> output
      staticNoise.connect(staticFilter);
      staticFilter.toDestination();
      staticNoise.volume.value = -20; // Quieter than music
    }
  }

  // Play static sound effect
  async function playStatic(duration: number) {
    await initializeStatic();
    if (staticNoise) {
      staticNoise.start();
      setTimeout(() => {
        staticNoise?.stop();
      }, duration);
    }
  }

  // Play radio station
  async function play() {
    const state = get({ subscribe });
    if (!state.currentStation) return;
    
    // Get the stream URL from the current track (which contains the actual stream URL)
    const streamUrl = state.currentStation.currentTrack?.url;
    if (!streamUrl) {
      console.error('No stream URL found for station:', state.currentStation.name);
      update(s => ({ 
        ...s, 
        isPlaying: false, 
        error: 'No stream URL available for this station' 
      }));
      return;
    }

    try {
      // Stop any existing audio
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }

      // Create new audio element
      audioElement = new Audio(streamUrl);
      audioElement.volume = state.volume;
      audioElement.crossOrigin = 'anonymous';
      
      // Set up event listeners
      audioElement.onplay = () => {
        update(s => ({ ...s, isPlaying: true, error: null }));
      };
      
      audioElement.onpause = () => {
        update(s => ({ ...s, isPlaying: false }));
      };
      
      audioElement.onerror = (e) => {
        console.error('Audio playback error:', e);
        console.error('Failed stream URL:', streamUrl);
        update(s => ({ 
          ...s, 
          isPlaying: false, 
          error: `Failed to play station. The stream URL (${streamUrl}) might be invalid or blocked by CORS.` 
        }));
      };

      // Play the audio
      await audioElement.play();
      
    } catch (error) {
      console.error('Failed to play station:', error);
      update(s => ({ 
        ...s, 
        isPlaying: false, 
        error: 'Failed to play station' 
      }));
      
      // Record failure
      const currentStation = get({ subscribe }).currentStation;
      if (currentStation && typeof window !== 'undefined' && (window as any).radioService) {
        (window as any).radioService.recordStationFailure(currentStation.id);
      }
    }
  }

  // Stop playback
  function stop() {
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
      audioElement = null;
    }
    update(s => ({ ...s, isPlaying: false }));
  }

  // Change to a random station
  async function changeStation() {
    const state = get({ subscribe });
    if (state.stations.length === 0) return;

    // Stop current playback
    stop();

    // Play radio tune sound
    playSound.radioTune();

    // Play static effect
    await playStatic(state.staticDuration);

    // Pick a random station (different from current if possible)
    let randomStation: RadioStation;
    if (state.stations.length === 1) {
      randomStation = state.stations[0];
    } else {
      do {
        randomStation = state.stations[Math.floor(Math.random() * state.stations.length)];
      } while (randomStation.id === state.currentStation?.id && state.stations.length > 1);
    }

    // Update current station
    update(s => ({ 
      ...s, 
      currentStation: randomStation,
      error: null 
    }));

    // Wait for static to finish, then play new station
    setTimeout(() => {
      play();
    }, state.staticDuration);
  }

  // Set volume
  function setVolume(volume: number) {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    if (audioElement) {
      audioElement.volume = clampedVolume;
    }
    
    update(s => ({ ...s, volume: clampedVolume }));
  }

  // Add stations
  function addStations(newStations: RadioStation[]) {
    update(s => {
      const existingIds = new Set(s.stations.map(st => st.id));
      const uniqueStations = newStations.filter(st => !existingIds.has(st.id));
      return {
        ...s,
        stations: [...s.stations, ...uniqueStations]
      };
    });
  }

  // Clear all stations
  function clearStations() {
    stop();
    update(s => ({
      ...s,
      stations: [],
      currentStation: null,
      error: null
    }));
  }

  // Set loading state
  function setLoading(isLoading: boolean) {
    update(s => ({ ...s, isLoading }));
  }

  // Cleanup on destroy
  function cleanup() {
    stop();
    stopScan(); // Stop any active scan
    if (staticNoise) {
      staticNoise.dispose();
      staticNoise = null;
    }
    if (staticFilter) {
      staticFilter.dispose();
      staticFilter = null;
    }
  }

  // Scan functionality
  let scanTimeout: NodeJS.Timeout | null = null;

  async function startScan() {
    const state = get({ subscribe });
    if (state.stations.length === 0) return;
    
    // Play radio scan sound
    playSound.radioScan();
    
    update(s => ({ ...s, isScanning: true, error: null }));
    
    // Start with first station change
    await changeStation();
    
    // Set up recurring station changes
    async function scanNext() {
      const currentState = get({ subscribe });
      if (!currentState.isScanning) return;
      
      await changeStation();
      
      // Schedule next change
      scanTimeout = setTimeout(scanNext, currentState.scanInterval + currentState.staticDuration);
    }
    
    // Schedule first automatic change
    scanTimeout = setTimeout(scanNext, state.scanInterval);
  }

  function stopScan() {
    if (scanTimeout) {
      clearTimeout(scanTimeout);
      scanTimeout = null;
    }
    update(s => ({ ...s, isScanning: false }));
  }

  function toggleScan() {
    const state = get({ subscribe });
    if (state.isScanning) {
      stopScan();
    } else {
      startScan();
    }
  }
  
  function getStations(): RadioStation[] {
    return get({ subscribe }).stations;
  }

  // Get audio element for external use
  function getAudioElement(): HTMLAudioElement | null {
    return audioElement;
  }
  
  // Get or create audio context and analyser
  function getAudioContext(): AudioContext | null {
    if (!audioContext && typeof window !== 'undefined') {
      audioContext = new AudioContext();
    }
    return audioContext;
  }
  
  function getAnalyser(): AnalyserNode | null {
    if (!analyser && audioElement && audioContext) {
      try {
        // Create analyser node
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        // Create source from audio element if not already created
        if (!audioSource) {
          audioSource = audioContext.createMediaElementSource(audioElement);
          audioSource.connect(analyser);
          analyser.connect(audioContext.destination);
        }
      } catch (error) {
        console.error('Failed to create analyser:', error);
      }
    }
    return analyser;
  }
  
  return {
    subscribe,
    update,
    play,
    stop,
    changeStation,
    setVolume,
    addStations,
    clearStations,
    setLoading,
    cleanup,
    startScan,
    stopScan,
    toggleScan,
    getAudioElement,
    getAudioContext,
    getAnalyser,
    getStations
  };
}

export const radioStore = createRadioStore();

// Derived stores
export const currentStation = derived(
  radioStore,
  $radioStore => $radioStore.currentStation
);

export const isPlaying = derived(
  radioStore,
  $radioStore => $radioStore.isPlaying
);

export const stationCount = derived(
  radioStore,
  $radioStore => $radioStore.stations.length
);

export const isScanning = derived(
  radioStore,
  $radioStore => $radioStore.isScanning
);