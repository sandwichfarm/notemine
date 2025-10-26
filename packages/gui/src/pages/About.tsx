import { Component } from 'solid-js';

const About: Component = () => {
  return (
    <div class="space-y-8 max-w-4xl mx-auto">
      <section class="text-center py-12">
        <h1 class="text-4xl font-bold mb-4">
          notemine<span class="text-[var(--accent)]">⛏️</span>
        </h1>
        <p class="text-xl text-[var(--text-secondary)] mb-4">
          a proof-of-work first nostr client
        </p>
        <p class="text-[var(--text-secondary)]">
          Quality over quantity. Every interaction requires computational effort.
        </p>
      </section>

      <section class="grid md:grid-cols-3 gap-6">
        <div class="card">
          <h3 class="font-bold mb-2">⛏️ POW First</h3>
          <p class="text-sm text-[var(--text-secondary)]">
            Every note, reaction, and profile edit requires proof-of-work. Quality over quantity.
          </p>
        </div>

        <div class="card">
          <h3 class="font-bold mb-2">🔒 Anonymous by Default</h3>
          <p class="text-sm text-[var(--text-secondary)]">
            Start posting immediately with ephemeral keys. Login optional.
          </p>
        </div>

        <div class="card">
          <h3 class="font-bold mb-2">📊 POW Scoring</h3>
          <p class="text-sm text-[var(--text-secondary)]">
            Notes ranked by combined POW of content + reactions. Best content rises.
          </p>
        </div>
      </section>

      <section class="card">
        <h2 class="font-bold text-lg mb-4">How it works</h2>
        <ol class="space-y-3 text-sm text-[var(--text-secondary)] list-decimal list-inside">
          <li>Write your note (140 chars max)</li>
          <li>Set difficulty (higher = more exclusive)</li>
          <li>Mine with WASM workers (rust-powered)</li>
          <li>Publish to POW relay network</li>
          <li>Get scored by POW + engagement</li>
        </ol>
      </section>

      <section class="card">
        <h2 class="font-bold text-lg mb-4">Technology Stack</h2>
        <div class="grid md:grid-cols-2 gap-4 text-sm text-[var(--text-secondary)]">
          <div>
            <h4 class="font-medium text-[var(--text-primary)] mb-2">Client</h4>
            <ul class="space-y-1 list-disc list-inside">
              <li>SolidJS - Reactive UI framework</li>
              <li>Applesauce - Nostr SDK</li>
              <li>WASM Workers - Rust-based POW mining</li>
              <li>NIP-13 - Proof of Work</li>
              <li>NIP-65 - Inbox/Outbox routing</li>
            </ul>
          </div>
          <div>
            <h4 class="font-medium text-[var(--text-primary)] mb-2">Relay</h4>
            <ul class="space-y-1 list-disc list-inside">
              <li>Go - High-performance backend</li>
              <li>LMDB - Lightning-fast database</li>
              <li>POW-based retention algorithm</li>
              <li>Max 1000 kind 1 events</li>
              <li>Automatic low-POW eviction</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="card">
        <h2 class="font-bold text-lg mb-4">Supported NIPs</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
            <div class="font-medium text-accent">NIP-01</div>
            <div class="text-xs text-text-secondary">Basic protocol</div>
          </div>
          <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
            <div class="font-medium text-accent">NIP-07</div>
            <div class="text-xs text-text-secondary">Browser signing</div>
          </div>
          <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
            <div class="font-medium text-accent">NIP-13</div>
            <div class="text-xs text-text-secondary">Proof of Work</div>
          </div>
          <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
            <div class="font-medium text-accent">NIP-19</div>
            <div class="text-xs text-text-secondary">Bech32 entities</div>
          </div>
          <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
            <div class="font-medium text-accent">NIP-46</div>
            <div class="text-xs text-text-secondary">Remote signing</div>
          </div>
          <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
            <div class="font-medium text-accent">NIP-65</div>
            <div class="text-xs text-text-secondary">Relay lists</div>
          </div>
          <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
            <div class="font-medium text-accent">NIP-66</div>
            <div class="text-xs text-text-secondary">Relay discovery</div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
