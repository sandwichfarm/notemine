<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeedFilter, FilterGroup, FilterCondition } from '$lib/types/filters';
  import { createEmptyFilter, createEmptyCondition } from '$lib/types/filters';
  import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-svelte';

  export let filter: FeedFilter = createEmptyFilter();
  
  const dispatch = createEventDispatcher();
  let expandedGroups = new Set<string>([filter.groups[0]?.id]);

  function addGroup() {
    const newGroup: FilterGroup = {
      id: crypto.randomUUID(),
      name: `Group ${filter.groups.length + 1}`,
      conditions: [],
      logic: 'AND'
    };
    filter.groups = [...filter.groups, newGroup];
    expandedGroups.add(newGroup.id);
  }

  function removeGroup(groupId: string) {
    filter.groups = filter.groups.filter(g => g.id !== groupId);
    expandedGroups.delete(groupId);
  }

  function addCondition(groupId: string) {
    filter.groups = filter.groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: [...group.conditions, createEmptyCondition()]
        };
      }
      return group;
    });
  }

  function removeCondition(groupId: string, conditionId: string) {
    filter.groups = filter.groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: group.conditions.filter(c => c.id !== conditionId)
        };
      }
      return group;
    });
  }

  function toggleGroup(groupId: string) {
    if (expandedGroups.has(groupId)) {
      expandedGroups.delete(groupId);
    } else {
      expandedGroups.add(groupId);
    }
    expandedGroups = expandedGroups;
  }

  function handleSave() {
    dispatch('save', filter);
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <input
      type="text"
      bind:value={filter.name}
      placeholder="Filter name"
      class="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
    />
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        bind:checked={filter.enabled}
        class="w-4 h-4 bg-surface-800 border-surface-600 rounded text-primary-500 focus:ring-primary-500"
      />
      <span class="text-surface-300">Enabled</span>
    </label>
  </div>

  <div class="space-y-3">
    {#each filter.groups as group (group.id)}
      <div class="bg-surface-800 rounded-lg border border-surface-700 overflow-hidden">
        <div class="p-3 flex items-center justify-between">
          <button
            type="button"
            onclick={() => toggleGroup(group.id)}
            class="flex items-center gap-2 text-left flex-1"
          >
            {#if expandedGroups.has(group.id)}
              <ChevronUp class="w-4 h-4 text-surface-400" />
            {:else}
              <ChevronDown class="w-4 h-4 text-surface-400" />
            {/if}
            <input
              type="text"
              bind:value={group.name}
              onclick={(e) => e.stopPropagation()}
              class="bg-transparent border-none focus:outline-none text-white"
            />
          </button>
          
          <div class="flex items-center gap-2">
            <select
              bind:value={group.logic}
              class="px-2 py-1 bg-surface-700 border border-surface-600 rounded text-sm text-white focus:outline-none focus:border-primary-500"
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
            
            {#if filter.groups.length > 1}
              <button
                type="button"
                onclick={() => removeGroup(group.id)}
                class="p-1 text-surface-400 hover:text-red-400 transition-colors"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            {/if}
          </div>
        </div>

        {#if expandedGroups.has(group.id)}
          <div class="border-t border-surface-700 p-3 space-y-2">
            {#each group.conditions as condition (condition.id)}
              <div class="flex items-center gap-2">
                <select
                  bind:value={condition.field}
                  class="px-2 py-1 bg-surface-700 border border-surface-600 rounded text-sm text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="content">Content</option>
                  <option value="author">Author</option>
                  <option value="kind">Kind</option>
                  <option value="pow">PoW</option>
                  <option value="tag">Tags</option>
                  <option value="created_at">Created At</option>
                </select>

                <select
                  bind:value={condition.operator}
                  class="px-2 py-1 bg-surface-700 border border-surface-600 rounded text-sm text-white focus:outline-none focus:border-primary-500"
                >
                  {#if condition.field === 'content'}
                    <option value="contains">contains</option>
                    <option value="equals">equals</option>
                    <option value="not_equals">not equals</option>
                  {:else if condition.field === 'pow' || condition.field === 'created_at' || condition.field === 'kind'}
                    <option value="equals">equals</option>
                    <option value="not_equals">not equals</option>
                    <option value="greater_than">greater than</option>
                    <option value="less_than">less than</option>
                  {:else if condition.field === 'tag'}
                    <option value="includes">includes</option>
                    <option value="excludes">excludes</option>
                  {:else}
                    <option value="equals">equals</option>
                    <option value="not_equals">not equals</option>
                    <option value="contains">contains</option>
                  {/if}
                </select>

                {#if condition.field === 'tag' && (condition.operator === 'includes' || condition.operator === 'excludes')}
                  <input
                    type="text"
                    bind:value={condition.value}
                    placeholder="e.g., e, p, t (comma separated)"
                    class="flex-1 px-2 py-1 bg-surface-700 border border-surface-600 rounded text-sm text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
                  />
                {:else if condition.field === 'created_at'}
                  <input
                    type="number"
                    bind:value={condition.value}
                    placeholder="Unix timestamp"
                    class="flex-1 px-2 py-1 bg-surface-700 border border-surface-600 rounded text-sm text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
                  />
                {:else if condition.field === 'pow' || condition.field === 'kind'}
                  <input
                    type="number"
                    bind:value={condition.value}
                    placeholder="Number"
                    class="flex-1 px-2 py-1 bg-surface-700 border border-surface-600 rounded text-sm text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
                  />
                {:else}
                  <input
                    type="text"
                    bind:value={condition.value}
                    placeholder="Value"
                    class="flex-1 px-2 py-1 bg-surface-700 border border-surface-600 rounded text-sm text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
                  />
                {/if}

                <label class="flex items-center">
                  <input
                    type="checkbox"
                    bind:checked={condition.enabled}
                    class="w-4 h-4 bg-surface-700 border-surface-600 rounded text-primary-500 focus:ring-primary-500"
                  />
                </label>

                <button
                  type="button"
                  onclick={() => removeCondition(group.id, condition.id)}
                  class="p-1 text-surface-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            {/each}

            <button
              type="button"
              onclick={() => addCondition(group.id)}
              class="flex items-center gap-1 px-2 py-1 text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              <Plus class="w-3 h-3" />
              Add Condition
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={addGroup}
        class="flex items-center gap-1 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 rounded text-sm text-white transition-colors"
      >
        <Plus class="w-4 h-4" />
        Add Group
      </button>
      
      {#if filter.groups.length > 1}
        <select
          bind:value={filter.groupLogic}
          class="px-2 py-1 bg-surface-700 border border-surface-600 rounded text-sm text-white focus:outline-none focus:border-primary-500"
        >
          <option value="AND">AND between groups</option>
          <option value="OR">OR between groups</option>
        </select>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={handleCancel}
        class="px-4 py-2 text-surface-300 hover:text-white transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onclick={handleSave}
        class="px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded text-white transition-colors"
      >
        Save Filter
      </button>
    </div>
  </div>
</div>