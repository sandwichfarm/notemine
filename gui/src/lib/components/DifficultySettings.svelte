<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { EVENT_KINDS, type DifficultySettings, calculateTargetDifficulty } from '$lib/types/difficulty';
  
  const dispatch = createEventDispatcher();
  
  export let settings: DifficultySettings;
  export let isOpen = false;
  
  function updateGlobalDifficulty(value: number) {
    settings = { ...settings, globalDifficulty: value };
    dispatch('update', settings);
  }
  
  function updateKindModifier(kind: number, modifier: number) {
    settings = {
      ...settings,
      kindModifiers: { ...settings.kindModifiers, [kind]: modifier }
    };
    dispatch('update', settings);
  }
  
  function resetToDefaults() {
    dispatch('reset');
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-bold text-gray-100">PoW Difficulty Settings</h2>
        <button 
          on:click={() => isOpen = false}
          class="text-gray-400 hover:text-gray-200 text-2xl"
        >
          ×
        </button>
      </div>
      
      <!-- Global Difficulty -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Global Difficulty: {settings.globalDifficulty}
        </label>
        <input
          type="range"
          min="16"
          max="100"
          step="1"
          value={settings.globalDifficulty}
          on:input={(e) => updateGlobalDifficulty(parseInt(e.target.value))}
          class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>16 (Easy)</span>
          <span>28 (Medium)</span>
          <span>40 (Hard)</span>
          <span>60+ (Extreme)</span>
        </div>
      </div>
      
      <!-- Event Kind Modifiers -->
      <div class="space-y-4">
        <h3 class="text-lg font-semibold text-gray-200 mb-4">Event Type Modifiers</h3>
        
        {#each Object.values(EVENT_KINDS) as kindConfig}
          {@const currentModifier = settings.kindModifiers[kindConfig.kind] || 0}
          {@const targetDifficulty = calculateTargetDifficulty(kindConfig.kind, settings)}
          
          <div class="bg-gray-700 rounded-lg p-4">
            <div class="flex justify-between items-center mb-2">
              <div>
                <span class="font-medium text-gray-100">
                  Kind {kindConfig.kind}: {kindConfig.name}
                </span>
                <p class="text-sm text-gray-400">{kindConfig.description}</p>
              </div>
              <div class="text-right">
                <div class="text-lg font-bold text-purple-400">
                  {targetDifficulty}
                </div>
                <div class="text-xs text-gray-400">
                  {currentModifier >= 0 ? '+' : ''}{currentModifier}
                </div>
              </div>
            </div>
            
            <div class="flex items-center space-x-4">
              <label class="text-sm text-gray-300 min-w-[80px]">
                Modifier: {currentModifier}
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={currentModifier}
                on:input={(e) => updateKindModifier(kindConfig.kind, parseInt(e.target.value))}
                class="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        {/each}
        
        <!-- Special Categories -->
        <div class="bg-gray-700 rounded-lg p-4">
          <h4 class="font-medium text-gray-100 mb-3">Special Categories</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-300">Mentions:</span>
              <span class="text-purple-400">{settings.globalDifficulty - 16}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-300">Replies:</span>
              <span class="text-purple-400">{settings.globalDifficulty - 11}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="flex justify-between mt-6 pt-4 border-t border-gray-600">
        <button
          on:click={resetToDefaults}
          class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors"
        >
          Reset to Defaults
        </button>
        <button
          on:click={() => isOpen = false}
          class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #a855f7;
    cursor: pointer;
  }
  
  .slider::-moz-range-thumb {
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #a855f7;
    cursor: pointer;
    border: none;
  }
</style>