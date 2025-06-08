import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface BootState {
  isBooting: boolean;
  isFirstBoot: boolean;
  currentLine: number;
  lines: string[];
  progress: number;
  complete: boolean;
}

export const bootState = writable<BootState>({
  isBooting: false,
  isFirstBoot: false,
  currentLine: 0,
  lines: [],
  progress: 0,
  complete: false
});

const FIRST_BOOT_KEY = 'hypergate-first-boot';
const BOOT_COUNT_KEY = 'hypergate-boot-count';

// ASCII art logo
const HYPERGATE_LOGO = [
  "██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗  ██████╗  █████╗ ████████╗███████╗",
  "██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝",
  "███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║  ███╗███████║   ██║   █████╗  ",
  "██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗██║   ██║██╔══██║   ██║   ██╔══╝  ",
  "██║  ██║   ██║   ██║     ███████╗██║  ██║╚██████╔╝██║  ██║   ██║   ███████╗",
  "╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝"
];

// First boot sequence - full initialization
const FIRST_BOOT_SEQUENCE = [
  { text: "HYPERGATE SYSTEMS v0.1.337", delay: 100, className: "text-green-400 font-bold" },
  { text: "Copyright (c) 2024 Notemine Industries", delay: 50 },
  { text: "All rights reserved.", delay: 50 },
  { text: "", delay: 100 },
  { text: "[ SYSTEM INITIALIZATION ]", delay: 200, className: "text-yellow-400" },
  { text: "CPU: Quantum Processing Unit detected", delay: 150 },
  { text: "RAM: ∞ TB available", delay: 100 },
  { text: "Storage: Distributed across 14,000,605 timelines", delay: 150 },
  { text: "", delay: 100 },
  { text: "Loading kernel modules...", delay: 200 },
  { text: "  [OK] nostr-protocol.ko", delay: 100, className: "text-green-500" },
  { text: "  [OK] proof-of-work.ko", delay: 100, className: "text-green-500" },
  { text: "  [OK] lightning-network.ko", delay: 100, className: "text-green-500" },
  { text: "  [OK] reality-anchor.ko", delay: 150, className: "text-green-500" },
  { text: "", delay: 100 },
  { text: "Initializing subsystems...", delay: 200 },
  { text: "► Tiling Window Manager.........[ACTIVE]", delay: 150, className: "text-cyan-400" },
  { text: "► Decay Engine.................[ONLINE]", delay: 150, className: "text-cyan-400" },
  { text: "► Mining Cores.................[ARMED]", delay: 150, className: "text-cyan-400" },
  { text: "► Radio Receiver...............[TUNED]", delay: 150, className: "text-cyan-400" },
  { text: "► Relay Network................[CONNECTED]", delay: 150, className: "text-cyan-400" },
  { text: "", delay: 200 },
  { text: "[ SECURITY CHECK ]", delay: 300, className: "text-red-400" },
  { text: "Scanning for temporal anomalies...", delay: 200 },
  { text: "No paradoxes detected.", delay: 150, className: "text-green-500" },
  { text: "Reality coherence: 99.7%", delay: 150 },
  { text: "", delay: 100 },
  { text: "[ HYPERGATE ACTIVATION ]", delay: 400, className: "text-purple-400 font-bold animate-pulse" },
  { text: "Charging capacitors...", delay: 300 },
  { text: "████████████████████ 100%", delay: 500, className: "text-green-400" },
  { text: "", delay: 200 },
  { text: "WELCOME TO THE HYPERGATE", delay: 600, className: "text-green-400 text-xl font-bold animate-pulse" },
  { text: "Your portal to the decentralized future.", delay: 400 },
  { text: "", delay: 200 },
  { text: "Type 'help' for commands or click anywhere to begin.", delay: 300, className: "text-gray-400" },
  { text: "", delay: 100 },
  { text: "> _", delay: 500, className: "text-green-400" }
];

// Random easter eggs
const EASTER_EGGS = [
  "Detecting quantum entanglement...",
  "Reticulating splines...",
  "Calibrating flux capacitors...",
  "Synchronizing with parallel universes...",
  "Defragmenting reality matrix...",
  "Optimizing meme propagation vectors...",
  "Initializing cat picture protocols...",
  "Loading sarcasm engine v4.20...",
  "Establishing connection to the void...",
  "Downloading more RAM...",
  "Mining digital gold...",
  "Activating cypherpunk mode...",
  "Decentralizing the centralized...",
  "Proof of Snack: Pizza detected...",
  "Satoshi initialization complete...",
  "Reality.exe has stopped responding..."
];

// Regular boot sequence - shorter
const REGULAR_BOOT_SEQUENCE = [
  { text: "HYPERGATE SYSTEMS", delay: 50, className: "text-green-400 font-bold" },
  { text: "Resuming session...", delay: 100 },
  { text: "", delay: 50 },
  { text: "[■■■■■■■■■■] Core systems", delay: 150, className: "text-cyan-400" },
  { text: "[■■■■■■■■■■] Relay network", delay: 150, className: "text-cyan-400" },
  { text: "[■■■■■■■■■■] Mining engine", delay: 150, className: "text-cyan-400" },
  { text: "", delay: 100 },
  { text: "All systems operational.", delay: 200, className: "text-green-500" },
  { text: "Welcome back, traveler.", delay: 300, className: "text-green-400" }
];

// Glitch effects for style
const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";

class BootService {
  private bootCount = 0;
  private typewriterSpeed = 20; // ms per character
  
  constructor() {
    if (browser) {
      this.bootCount = parseInt(localStorage.getItem(BOOT_COUNT_KEY) || '0');
    }
  }
  
  async startBoot(): Promise<void> {
    if (!browser) return;
    
    const isFirstBoot = !localStorage.getItem(FIRST_BOOT_KEY);
    const sequence = isFirstBoot ? FIRST_BOOT_SEQUENCE : REGULAR_BOOT_SEQUENCE;
    
    // Update boot count
    this.bootCount++;
    localStorage.setItem(BOOT_COUNT_KEY, String(this.bootCount));
    
    if (isFirstBoot) {
      localStorage.setItem(FIRST_BOOT_KEY, 'true');
    }
    
    bootState.set({
      isBooting: true,
      isFirstBoot,
      currentLine: 0,
      lines: [],
      progress: 0,
      complete: false
    });
    
    // Show logo on first boot
    if (isFirstBoot) {
      await this.displayLogo();
      await this.delay(500);
    }
    
    // Run boot sequence
    await this.runSequence(sequence);
    
    // Mark complete
    bootState.update(state => ({
      ...state,
      complete: true,
      progress: 100
    }));
    
    // Auto-close after delay
    await this.delay(isFirstBoot ? 2000 : 1000);
    this.completeBoot();
  }
  
  private async displayLogo(): Promise<void> {
    for (const line of HYPERGATE_LOGO) {
      bootState.update(state => ({
        ...state,
        lines: [...state.lines, { text: line, className: 'text-green-400 text-xs' }]
      }));
      await this.delay(50);
    }
    
    bootState.update(state => ({
      ...state,
      lines: [...state.lines, { text: '', className: '' }]
    }));
  }
  
  private async runSequence(sequence: any[]): Promise<void> {
    const totalSteps = sequence.length;
    
    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];
      
      // Update progress
      bootState.update(state => ({
        ...state,
        progress: Math.floor((i / totalSteps) * 100),
        currentLine: state.lines.length
      }));
      
      // Random easter egg insertion (10% chance on regular boots)
      if (!get(bootState).isFirstBoot && Math.random() < 0.1 && i === Math.floor(sequence.length / 2)) {
        const easterEgg = EASTER_EGGS[Math.floor(Math.random() * EASTER_EGGS.length)];
        bootState.update(state => ({
          ...state,
          lines: [...state.lines, { text: easterEgg, className: 'text-purple-400 italic' }]
        }));
        await this.delay(300);
      }
      
      // Typewriter effect for important lines
      if (step.className?.includes('font-bold') || step.className?.includes('animate-pulse')) {
        await this.typewriterEffect(step.text, step.className);
      } else {
        bootState.update(state => ({
          ...state,
          lines: [...state.lines, { text: step.text, className: step.className || 'text-green-600' }]
        }));
      }
      
      await this.delay(step.delay);
    }
  }
  
  private async typewriterEffect(text: string, className: string): Promise<void> {
    let currentText = '';
    const lineIndex = get(bootState).lines.length;
    
    // Add empty line
    bootState.update(state => ({
      ...state,
      lines: [...state.lines, { text: '', className }]
    }));
    
    for (let i = 0; i < text.length; i++) {
      currentText += text[i];
      
      // Add glitch effect occasionally
      if (Math.random() < 0.1 && i < text.length - 1) {
        const glitchChar = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        bootState.update(state => {
          const newLines = [...state.lines];
          newLines[lineIndex] = { text: currentText + glitchChar, className };
          return { ...state, lines: newLines };
        });
        await this.delay(50);
      }
      
      bootState.update(state => {
        const newLines = [...state.lines];
        newLines[lineIndex] = { text: currentText, className };
        return { ...state, lines: newLines };
      });
      
      await this.delay(this.typewriterSpeed);
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  completeBoot(): void {
    bootState.set({
      isBooting: false,
      isFirstBoot: false,
      currentLine: 0,
      lines: [],
      progress: 0,
      complete: false
    });
  }
  
  skipBoot(): void {
    this.completeBoot();
  }
  
  getBootCount(): number {
    return this.bootCount;
  }
  
  // Easter egg sequences for special boot counts
  getSpecialBootMessage(): string | null {
    switch (this.bootCount) {
      case 42:
        return "The answer to life, universe, and everything.";
      case 69:
        return "Nice.";
      case 100:
        return "Century boot! You're dedicated.";
      case 256:
        return "0xFF boots. Perfectly balanced, as all things should be.";
      case 420:
        return "Dank boot achieved.";
      case 1337:
        return "1337 h4x0r mode activated.";
      default:
        return null;
    }
  }
}

export const bootService = new BootService();