import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { getEventHash, verifyEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { 
  SimpleSigner, 
  ExtensionSigner, 
  NostrConnectSigner,
  PasswordSigner,
  AmberClipboardSigner
} from 'applesauce-signers';
import { browser } from '$app/environment';
import type { NostrEvent, UnsignedEvent } from '$lib/types';
import { bech32 } from 'bech32';
import { writable } from 'svelte/store';

export type SigningMethod = 'private-key' | 'nip-07' | 'nostr-connect' | 'encrypted-key' | 'amber' | 'anonymous';

export interface SigningConfig {
  method: SigningMethod;
  connectUrl?: string;
  privateKey?: string;
  encryptedKey?: string;
  password?: string;
}

export class KeyManager {
  private secretKey: Uint8Array | null = null;
  private publicKey: string | null = null;
  private signer: SimpleSigner | ExtensionSigner | NostrConnectSigner | PasswordSigner | AmberClipboardSigner | null = null;
  private currentSigningMethod: SigningMethod = 'private-key';
  
  // NostrConnect specific properties
  private nostrConnectPool: SimplePool | null = null;
  private nostrConnectRelays: string[] = [];
  
  // Reactive stores
  public signingMethod = writable<SigningMethod>('private-key');
  public isConnected = writable<boolean>(false);
  public availableMethods = writable<SigningMethod[]>([]);
  public nostrConnectStatus = writable<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  constructor() {
    if (browser) {
      this.detectAvailableMethods();
      this.loadKeys();
      this.loadSigningConfig();
    }
  }
  
  private async detectAvailableMethods() {
    const methods: SigningMethod[] = ['anonymous', 'private-key']; // Always available
    
    // Check for NIP-07 (browser extension)
    if (typeof window !== 'undefined' && window.nostr) {
      console.log('NIP-07 extension detected:', window.nostr);
      console.log('NIP-07 methods available:', {
        getPublicKey: typeof window.nostr.getPublicKey,
        signEvent: typeof window.nostr.signEvent,
        getRelays: typeof window.nostr.getRelays,
        nip04: !!window.nostr.nip04
      });
      methods.push('nip-07');
    } else {
      console.log('No NIP-07 extension found');
      console.log('window object:', typeof window);
      console.log('window.nostr:', window?.nostr);
    }
    
    // Always available options
    methods.push('nostr-connect', 'encrypted-key', 'amber');
    
    this.availableMethods.set(methods);
  }

  private loadKeys() {
    if (!browser) return;
    
    const stored = localStorage.getItem('nostr-keys');
    console.log('Loading keys from localStorage, found:', !!stored);
    
    if (stored) {
      try {
        const keys = JSON.parse(stored);
        this.secretKey = new Uint8Array(keys.secretKey);
        this.publicKey = keys.publicKey;
        this.signer = new SimpleSigner(this.secretKey);
        this.isConnected.set(true);
        console.log('Keys loaded successfully, publicKey:', this.publicKey);
      } catch (error) {
        console.error('Failed to load stored keys:', error);
        // Fall back to ephemeral keys
        this.generateEphemeralKeys();
      }
    } else {
      console.log('No stored keys found, using ephemeral session keys');
      // Default to ephemeral keys for each session
      this.generateEphemeralKeys();
    }
  }
  
  private async loadSigningConfig() {
    if (!browser) return;
    
    const stored = localStorage.getItem('nostr-signing-config');
    if (!stored) return;
    
    try {
      const config = JSON.parse(stored);
      console.log('Loading signing config:', config);
      
      // Only restore non-private-key methods (private-key is handled by loadKeys)
      if (config.method && config.method !== 'private-key') {
        // For methods that require user interaction, just set the method but not connected
        this.signingMethod.set(config.method);
        
        // Try to auto-connect for some methods
        if (config.method === 'anonymous') {
          await this.setSigningMethod({ method: 'anonymous' });
        } else if (config.method === 'nip-07' && window.nostr) {
          // Auto-connect NIP-07 if extension is available
          try {
            await this.setSigningMethod({ method: 'nip-07' });
          } catch (error) {
            console.error('Failed to auto-connect NIP-07:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load signing config:', error);
    }
  }

  async generateKeys(): Promise<{ privateKey: string; publicKey: string }> {
    this.secretKey = generateSecretKey();
    this.publicKey = getPublicKey(this.secretKey);
    this.signer = new SimpleSigner(this.secretKey);
    this.saveKeys();
    
    // Update stores
    this.isConnected.set(true);
    this.signingMethod.set('private-key');
    this.currentSigningMethod = 'private-key';
    
    // Return keys in nsec/npub format
    const privateKey = this.encodePrivateKey(this.secretKey);
    const publicKey = this.encodePublicKey(this.publicKey);
    
    console.log('Persistent keys generated and saved, publicKey:', this.publicKey);
    return { privateKey, publicKey };
  }

  async generateEphemeralKeys(): Promise<{ privateKey: string; publicKey: string }> {
    console.log('Generating ephemeral session keys (not stored)');
    this.secretKey = generateSecretKey();
    this.publicKey = getPublicKey(this.secretKey);
    this.signer = new SimpleSigner(this.secretKey);
    
    // Update stores
    this.isConnected.set(true);
    this.signingMethod.set('private-key');
    this.currentSigningMethod = 'private-key';
    
    // Don't save keys - they're ephemeral
    
    // Return keys in nsec/npub format
    const privateKey = this.encodePrivateKey(this.secretKey);
    const publicKey = this.encodePublicKey(this.publicKey);
    
    console.log('Ephemeral keys generated, publicKey:', this.publicKey);
    return { privateKey, publicKey };
  }

  async importPrivateKey(key: string): Promise<{ privateKey: string; publicKey: string }> {
    try {
      // Handle both nsec and hex formats
      let secretKey: Uint8Array;
      
      if (key.startsWith('nsec1')) {
        // Decode from nsec format
        const decoded = bech32.decode(key);
        const words = bech32.fromWords(decoded.words);
        secretKey = new Uint8Array(words);
      } else {
        // Assume hex format
        secretKey = hexToBytes(key);
      }
      
      // Validate key length
      if (secretKey.length !== 32) {
        throw new Error('Invalid private key length');
      }
      
      this.secretKey = secretKey;
      this.publicKey = getPublicKey(secretKey);
      this.signer = new SimpleSigner(secretKey);
      this.saveKeys();
      
      // Return keys in bech32 format
      const privateKey = this.encodePrivateKey(secretKey);
      const publicKey = this.encodePublicKey(this.publicKey);
      
      return { privateKey, publicKey };
    } catch (error) {
      throw new Error('Invalid private key format');
    }
  }

  private encodePrivateKey(secretKey: Uint8Array): string {
    const words = bech32.toWords(secretKey);
    return bech32.encode('nsec', words, 1000);
  }

  private encodePublicKey(publicKey: string): string {
    const pubkeyBytes = hexToBytes(publicKey);
    const words = bech32.toWords(pubkeyBytes);
    return bech32.encode('npub', words, 1000);
  }

  private saveKeys() {
    if (!browser || !this.secretKey || !this.publicKey) return;
    
    const keys = {
      secretKey: Array.from(this.secretKey),
      publicKey: this.publicKey
    };
    
    localStorage.setItem('nostr-keys', JSON.stringify(keys));
  }

  getPublicKey(): string | null {
    return this.publicKey;
  }

  getSecretKey(): Uint8Array | null {
    return this.secretKey;
  }

  getSecretKeyHex(): string | null {
    const key = this.getSecretKey();
    return key ? bytesToHex(key) : null;
  }
  
  getNsec(): string | null {
    const key = this.getSecretKey();
    return key ? this.encodePrivateKey(key) : null;
  }
  
  getNpub(): string | null {
    const pubkey = this.getPublicKey();
    return pubkey ? this.encodePublicKey(pubkey) : null;
  }

  clearKeys() {
    this.secretKey = null;
    this.publicKey = null;
    this.signer = null;
    if (browser) {
      localStorage.removeItem('nostr-keys');
    }
  }

  getSigner(): SimpleSigner | ExtensionSigner | NostrConnectSigner | PasswordSigner | AmberClipboardSigner | null {
    return this.signer;
  }
  
  async setSigningMethod(config: SigningConfig): Promise<void> {
    console.log('KeyManager.setSigningMethod called with:', config);
    try {
      this.currentSigningMethod = config.method;
      
      switch (config.method) {
        case 'anonymous':
          // Generate ephemeral key (not saved)
          this.secretKey = generateSecretKey();
          this.publicKey = getPublicKey(this.secretKey);
          this.signer = new SimpleSigner(this.secretKey);
          console.log('Anonymous keys generated, publicKey:', this.publicKey);
          break;
          
        case 'private-key':
          if (config.privateKey) {
            await this.importPrivateKey(config.privateKey);
          } else if (!this.secretKey) {
            throw new Error('No private key available');
          }
          break;
          
        case 'nip-07':
          console.log('Setting up NIP-07 signer...');
          console.log('window.nostr available?', !!window.nostr);
          
          if (!window.nostr) {
            throw new Error('NIP-07 extension not found. Please install a Nostr browser extension like Alby, nos2x, or similar.');
          }
          
          // Check if the extension supports the required methods
          console.log('Checking NIP-07 methods...');
          console.log('getPublicKey:', typeof window.nostr.getPublicKey);
          console.log('signEvent:', typeof window.nostr.signEvent);
          
          if (!window.nostr.getPublicKey || !window.nostr.signEvent) {
            throw new Error('NIP-07 extension does not support required methods. Please update your extension.');
          }
          
          console.log('Creating ExtensionSigner for NIP-07...');
          this.signer = new ExtensionSigner();
          
          try {
            console.log('Requesting public key from extension...');
            this.publicKey = await this.signer.getPublicKey();
            console.log('NIP-07 connection successful, pubkey:', this.publicKey);
            
            // Clear any existing private key since we're using extension
            this.secretKey = null;
          } catch (error) {
            console.error('NIP-07 getPublicKey failed:', error);
            throw new Error(`Failed to connect to NIP-07 extension: ${error.message}`);
          }
          break;
          
        case 'nostr-connect':
          if (!config.connectUrl) {
            throw new Error('Nostr Connect URL required');
          }
          await this.setupNostrConnect(config.connectUrl);
          break;
          
        case 'encrypted-key':
          if (!config.encryptedKey || !config.password) {
            throw new Error('Encrypted key and password required');
          }
          this.signer = new PasswordSigner(config.encryptedKey, config.password);
          this.publicKey = await this.signer.getPublicKey();
          break;
          
        case 'amber':
          this.signer = new AmberClipboardSigner();
          this.publicKey = await this.signer.getPublicKey();
          break;
          
        default:
          throw new Error(`Unknown signing method: ${config.method}`);
      }
      
      this.signingMethod.set(config.method);
      this.isConnected.set(true);
      
      // Store the configuration
      if (browser) {
        const configToStore: any = {
          method: config.method
        };
        
        // Store method-specific config (except sensitive data)
        if (config.method === 'nostr-connect' && config.connectUrl) {
          configToStore.connectUrl = config.connectUrl;
        } else if (config.method === 'encrypted-key' && config.encryptedKey) {
          configToStore.encryptedKey = config.encryptedKey;
          // Don't store password
        }
        
        localStorage.setItem('nostr-signing-config', JSON.stringify(configToStore));
      }
      
    } catch (error) {
      console.error('Failed to set signing method:', error);
      this.isConnected.set(false);
      throw error;
    }
  }
  
  getCurrentSigningMethod(): SigningMethod {
    return this.currentSigningMethod;
  }
  
  async getPublicKeyFromSigner(): Promise<string | null> {
    if (!this.signer) return null;
    
    try {
      return await this.signer.getPublicKey();
    } catch (error) {
      console.error('Failed to get public key from signer:', error);
      return null;
    }
  }

  async signEvent(event: UnsignedEvent): Promise<NostrEvent> {
    const signer = this.getSigner();
    if (!signer) {
      throw new Error('No signing method configured. Please set up your keys or connect a signer.');
    }
    
    try {
      // All applesauce signers handle the event ID generation and signing
      const signedEvent = await signer.signEvent(event);
      
      // Verify the signature is valid
      if (!verifyEvent(signedEvent)) {
        throw new Error('Failed to create valid signed event');
      }
      
      return signedEvent;
    } catch (error) {
      console.error('Signing error:', error);
      throw new Error(`Failed to sign event: ${error.message}`);
    }
  }
  
  private async setupNostrConnect(connectUrl: string): Promise<void> {
    this.nostrConnectStatus.set('connecting');
    
    try {
      // Parse the NostrConnect URL
      const { pubkey, relays, secret } = this.parseNostrConnectUrl(connectUrl);
      
      console.log('Setting up NostrConnect with:', { pubkey, relays: relays.length, hasSecret: !!secret });
      
      // Set up relay pool for NostrConnect communication
      this.nostrConnectPool = new SimplePool();
      this.nostrConnectRelays = relays;
      
      // Create the NostrConnect signer with subscription and publish methods
      this.signer = new NostrConnectSigner({
        target: pubkey,
        secret: secret,
        subscribe: (filters, relayUrls) => {
          console.log('NostrConnect subscribe:', filters, relayUrls);
          return this.nostrConnectPool!.subscribeMany(relayUrls || this.nostrConnectRelays, filters, {
            onevent: (event) => console.log('NostrConnect event received:', event),
            oneose: () => console.log('NostrConnect EOSE'),
            onclose: (reason) => console.log('NostrConnect subscription closed:', reason)
          });
        },
        publish: async (event, relayUrls) => {
          console.log('NostrConnect publish:', event, relayUrls);
          const targets = relayUrls || this.nostrConnectRelays;
          await Promise.allSettled(
            targets.map(url => this.nostrConnectPool!.publish([url], event))
          );
        }
      });
      
      // Get the public key to confirm connection
      this.publicKey = await this.signer.getPublicKey();
      this.nostrConnectStatus.set('connected');
      
      console.log('NostrConnect setup successful, pubkey:', this.publicKey);
      
    } catch (error) {
      console.error('NostrConnect setup failed:', error);
      this.nostrConnectStatus.set('error');
      this.cleanupNostrConnect();
      throw error;
    }
  }
  
  private parseNostrConnectUrl(url: string): { pubkey: string; relays: string[]; secret?: string } {
    try {
      // Handle both nostrconnect:// and bunker:// protocols
      if (url.startsWith('nostrconnect://') || url.startsWith('bunker://')) {
        const parsedUrl = new URL(url);
        const pubkey = parsedUrl.hostname || parsedUrl.pathname.replace('//', '');
        const relays = parsedUrl.searchParams.getAll('relay');
        const secret = parsedUrl.searchParams.get('secret') || undefined;
        
        if (!pubkey) {
          throw new Error('Invalid NostrConnect URL: missing pubkey');
        }
        
        if (relays.length === 0) {
          // Default relays if none specified
          relays.push('wss://relay.damus.io', 'wss://nos.lol');
        }
        
        return { pubkey, relays, secret };
      } else {
        throw new Error('Invalid NostrConnect URL format. Must start with nostrconnect:// or bunker://');
      }
    } catch (error) {
      throw new Error(`Failed to parse NostrConnect URL: ${error.message}`);
    }
  }
  
  private cleanupNostrConnect(): void {
    if (this.nostrConnectPool) {
      this.nostrConnectPool.close(this.nostrConnectRelays);
      this.nostrConnectPool = null;
    }
    this.nostrConnectRelays = [];
    this.nostrConnectStatus.set('disconnected');
  }

  async disconnect(): Promise<void> {
    if (this.signer && 'disconnect' in this.signer) {
      await this.signer.disconnect();
    }
    
    // Clean up NostrConnect resources
    this.cleanupNostrConnect();
    
    this.signer = null;
    this.isConnected.set(false);
    
    if (browser) {
      localStorage.removeItem('nostr-signing-config');
    }
  }
}

export const keyManager = new KeyManager();