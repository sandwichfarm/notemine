<script lang="ts">
  import { soundService } from '$lib/services/sound';
  import { Volume2, VolumeX, Play } from 'lucide-svelte';
  
  // Sound settings store
  let settings = soundService?.getSettings() || {
    enabled: false,
    volume: 0.3,
    windowActions: true,
    miningActions: true,
    networkActions: true,
    radioActions: true,
    notificationActions: true
  };
  
  // Subscribe to settings changes
  $: if (soundService) {
    soundService.settingsStore.subscribe(newSettings => {
      settings = newSettings;
    });
  }
  
  // Get available sound effects grouped by category
  const effects = soundService?.getEffects() || [];
  const effectsByCategory = effects.reduce((acc, effect) => {
    if (!acc[effect.category]) {
      acc[effect.category] = [];
    }
    acc[effect.category].push(effect);
    return acc;
  }, {} as Record<string, typeof effects>);
  
  function updateSetting(key: keyof typeof settings, value: any) {
    settings = { ...settings, [key]: value };
    soundService?.updateSettings({ [key]: value });
  }
  
  function testSound(soundId: string) {
    soundService?.testSound(soundId);
  }
  
  function getCategoryTitle(category: string): string {
    switch (category) {
      case 'window': return 'Window Management';
      case 'mining': return 'Mining Operations';
      case 'network': return 'Network & Relays';
      case 'radio': return 'Radio Controls';
      case 'notification': return 'Notifications';
      default: return category;
    }
  }
  
  function getCategoryEnabled(category: string): boolean {
    switch (category) {
      case 'window': return settings.windowActions;
      case 'mining': return settings.miningActions;
      case 'network': return settings.networkActions;
      case 'radio': return settings.radioActions;
      case 'notification': return settings.notificationActions;
      default: return true;
    }
  }
  
  function setCategoryEnabled(category: string, enabled: boolean) {
    switch (category) {
      case 'window': updateSetting('windowActions', enabled); break;
      case 'mining': updateSetting('miningActions', enabled); break;
      case 'network': updateSetting('networkActions', enabled); break;
      case 'radio': updateSetting('radioActions', enabled); break;
      case 'notification': updateSetting('notificationActions', enabled); break;
    }
  }
</script>

<div class="space-y-4">
  <h4 class="text-green-400 font-bold flex items-center gap-2">
    {#if settings.enabled}
      <Volume2 class="w-4 h-4" />
    {:else}
      <VolumeX class="w-4 h-4" />
    {/if}
    SOUND_EFFECTS
  </h4>
  
  <!-- Master Controls -->
  <div class="space-y-2 bg-green-900/10 border border-green-800 p-3 rounded">
    <div class="grid grid-cols-2 gap-2">
      <label class="text-green-600">sound_enabled:</label>
      <input 
        type="checkbox" 
        bind:checked={settings.enabled}
        onchange={() => updateSetting('enabled', settings.enabled)}
        class="accent-green-600"
      />
      
      <label class="text-green-600">master_volume:</label>
      <div class="flex items-center gap-2">
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.1"
          bind:value={settings.volume}
          onchange={() => updateSetting('volume', settings.volume)}
          disabled={!settings.enabled}
          class="flex-1 accent-green-600"
        />
        <span class="text-green-400 text-xs w-8">{Math.round(settings.volume * 100)}%</span>
      </div>
    </div>
    
    {#if !settings.enabled}
      <div class="text-green-600 text-xs">
        ℹ️ Sounds are disabled by default. Enable to hear cypherpunk-themed audio feedback.
      </div>
    {/if}
  </div>
  
  <!-- Category Controls -->
  {#if settings.enabled}
    <div class="space-y-3">
      <h5 class="text-green-400 font-bold text-xs">SOUND_CATEGORIES</h5>
      
      {#each Object.entries(effectsByCategory) as [category, categoryEffects]}
        <div class="space-y-2 bg-green-900/5 border border-green-800 p-2 rounded">
          <div class="flex items-center justify-between">
            <span class="text-green-400 text-xs font-bold">{getCategoryTitle(category).toUpperCase()}</span>
            <input 
              type="checkbox" 
              checked={getCategoryEnabled(category)}
              onchange={(e) => setCategoryEnabled(category, e.target.checked)}
              class="accent-green-600"
            />
          </div>
          
          <!-- Sound Effects in Category -->
          <div class="space-y-1 pl-2">
            {#each categoryEffects as effect}
              <div class="flex items-center justify-between text-xs">
                <div class="flex-1">
                  <span class="text-green-300">{effect.name}</span>
                  <div class="text-green-600 text-xs">{effect.description}</div>
                </div>
                <button
                  onclick={() => testSound(effect.id)}
                  disabled={!getCategoryEnabled(category)}
                  class="px-2 py-1 bg-green-900/20 border border-green-800 text-green-400 
                         hover:bg-green-800/30 disabled:opacity-50 disabled:cursor-not-allowed
                         text-xs flex items-center gap-1"
                >
                  <Play class="w-3 h-3" />
                  TEST
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  
  <!-- Sound Info -->
  <div class="text-green-600 text-xs space-y-1 border-t border-green-800 pt-2">
    <div class="font-bold">ABOUT SOUND EFFECTS:</div>
    <div>• Crisp, pleasant tones designed for extended use</div>
    <div>• Cypherpunk aesthetic with digital/industrial themes</div>
    <div>• Generated using Tone.js synthesizers (no audio files)</div>
    <div>• Minimal CPU impact, real-time synthesis</div>
    <div>• Category-specific controls for fine-tuning</div>
  </div>
</div>

<style>
  /* Custom range slider styling to match theme */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }
  
  input[type="range"]::-webkit-slider-track {
    background: #166534;
    height: 2px;
  }
  
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: #22c55e;
    height: 12px;
    width: 12px;
    border-radius: 50%;
    margin-top: -5px;
  }
  
  input[type="range"]::-moz-range-track {
    background: #166534;
    height: 2px;
  }
  
  input[type="range"]::-moz-range-thumb {
    background: #22c55e;
    height: 12px;
    width: 12px;
    border-radius: 50%;
    border: none;
  }
  
  input[type="range"]:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>