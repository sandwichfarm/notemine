<script lang="ts">
  import { keybindsByCategory, keybindStore, categories } from '../../hyprland/services/keybind-config';
  import type { Keybind } from '../../hyprland/services/keybind-config';
  
  let editMode = false;
  let editingKeybind: Keybind | null = null;
  let captureMode = false;
  let capturedKey = '';
  let capturedModifiers: string[] = [];

  function formatModifiers(modifiers: string[]): string {
    return modifiers.map(mod => {
      switch (mod) {
        case 'ctrl': return '⌘';
        case 'shift': return '⇧';
        case 'alt': return '⌥';
        default: return mod;
      }
    }).join('');
  }
  
  function formatKey(key: string): string {
    // Special key formatting
    switch (key) {
      case ' ': return 'Space';
      case 'ArrowLeft': return '←';
      case 'ArrowRight': return '→';
      case 'ArrowUp': return '↑';
      case 'ArrowDown': return '↓';
      default: return key.toUpperCase();
    }
  }
  
  function startEditKeybind(keybind: Keybind) {
    editingKeybind = keybind;
    captureMode = true;
    capturedKey = '';
    capturedModifiers = [];
  }
  
  function cancelEdit() {
    editingKeybind = null;
    captureMode = false;
    capturedKey = '';
    capturedModifiers = [];
  }
  
  function saveKeybind() {
    if (editingKeybind && capturedKey) {
      keybindStore.updateKeybind(editingKeybind.id, {
        key: capturedKey,
        modifiers: capturedModifiers
      });
    }
    cancelEdit();
  }
  
  function handleKeyCapture(event: KeyboardEvent) {
    if (!captureMode) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // Capture modifiers
    capturedModifiers = [];
    if (event.ctrlKey || event.metaKey) capturedModifiers.push('ctrl');
    if (event.shiftKey) capturedModifiers.push('shift');
    if (event.altKey) capturedModifiers.push('alt');
    
    // Capture the key (ignore modifier-only presses)
    if (event.key !== 'Control' && event.key !== 'Meta' && 
        event.key !== 'Shift' && event.key !== 'Alt') {
      capturedKey = event.key;
    }
  }
  
  function resetKeybinds() {
    if (confirm('Reset all keybinds to defaults?')) {
      keybindStore.reset();
    }
  }
</script>

<div class="h-full flex flex-col bg-neutral-900 text-neutral-100 font-mono" on:keydown={handleKeyCapture}>
  <!-- Header -->
  <div class="p-4 border-b border-neutral-800 flex items-center justify-between">
    <div>
      <h1 class="text-xl font-bold text-orange-400">KEYBOARD_SHORTCUTS</h1>
      <p class="text-xs text-neutral-500 mt-1">
        {editMode ? 'Click a keybind to edit' : 'Hyprland-style window management keybindings'}
      </p>
    </div>
    <div class="flex gap-2">
      <button
        on:click={() => editMode = !editMode}
        class="px-3 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded 
               hover:bg-neutral-700 transition-colors {editMode ? 'text-orange-400 border-orange-400' : 'text-neutral-400'}"
      >
        {editMode ? 'Done Editing' : 'Edit Mode'}
      </button>
      {#if editMode}
        <button
          on:click={resetKeybinds}
          class="px-3 py-1 text-xs bg-red-900/20 border border-red-800 text-red-400 rounded 
                 hover:bg-red-800/30 transition-colors"
        >
          Reset All
        </button>
      {/if}
    </div>
  </div>
  
  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    <div class="max-w-4xl mx-auto space-y-6">
      {#each Object.entries($keybindsByCategory) as [categoryId, bindings]}
        {@const category = categories[categoryId]}
        <div class="border border-neutral-800 rounded-lg overflow-hidden">
          <div class="bg-neutral-800/50 px-4 py-2 border-b border-neutral-700">
            <h2 class="text-sm font-semibold text-green-400">{category?.name || categoryId}</h2>
            {#if category?.description}
              <p class="text-xs text-neutral-500 mt-0.5">{category.description}</p>
            {/if}
          </div>
          <div class="divide-y divide-neutral-800">
            {#each bindings as keybind}
              <div 
                class="flex items-center justify-between px-4 py-3 transition-colors
                       {editMode ? 'hover:bg-neutral-800/50 cursor-pointer' : 'hover:bg-neutral-800/30'}
                       {editingKeybind?.id === keybind.id ? 'bg-orange-900/20 border-l-2 border-orange-400' : ''}"
                on:click={() => editMode && startEditKeybind(keybind)}
              >
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1">
                    {#if editingKeybind?.id === keybind.id && captureMode}
                      <div class="text-orange-400 text-sm animate-pulse">
                        Press new key combination...
                      </div>
                      {#if capturedKey}
                        <div class="flex items-center gap-1">
                          <span class="text-green-400 text-sm">{formatModifiers(capturedModifiers)}</span>
                          <span class="bg-green-800 px-2 py-1 rounded text-xs font-bold text-white">
                            {formatKey(capturedKey)}
                          </span>
                        </div>
                      {/if}
                    {:else}
                      <span class="text-orange-400 text-sm">{formatModifiers(keybind.modifiers)}</span>
                      <span class="bg-neutral-800 px-2 py-1 rounded text-xs font-bold text-white">
                        {formatKey(keybind.key)}
                      </span>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-neutral-400 text-sm">{keybind.description}</span>
                  {#if editingKeybind?.id === keybind.id && captureMode}
                    <div class="flex gap-2">
                      <button
                        on:click|stopPropagation={saveKeybind}
                        disabled={!capturedKey}
                        class="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 
                               disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                      <button
                        on:click|stopPropagation={cancelEdit}
                        class="px-2 py-1 text-xs bg-neutral-600 text-white rounded hover:bg-neutral-700"
                      >
                        Cancel
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
  
  <!-- Footer -->
  <div class="p-4 border-t border-neutral-800 text-center">
    <p class="text-xs text-neutral-500">
      Press <span class="text-orange-400">ESC</span> or <span class="text-orange-400">⌘Q</span> to close
      {#if editMode}
        • Click any keybind to edit
      {/if}
    </p>
  </div>
</div>