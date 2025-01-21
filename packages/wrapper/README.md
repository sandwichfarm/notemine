# @notemine/wrapper

[![npm](https://img.shields.io/npm/v/@notemine/wrapper)](https://www.npmjs.com/package/@notemine/wrapper)
[![build](https://github.com/sandwichfarm/notemine/actions/workflows/publish-packages.yml/badge.svg)]( https://github.com/sandwichfarm/notemine/actions/workflows/publish-packages.yml ) 
[![docs](https://github.com/sandwichfarm/notemine/actions/workflows/docs.yml/badge.svg)]( https://github.com/sandwichfarm/notemine/actions/workflows/docs.yml ) 
<!-- [![test](https://github.com/sandwichfarm/notemine-js/actions/workflows/test.yaml/badge.svg)]( https://github.com/sandwichfarm/notemine-js/actions/workflows/test.yaml ) -->

`@notemine/wrapper` is a typescript module that wraps [@notemine/core](../core/README.md) `wasm-bindgen` interfaces. More convenient and has added observables for more consistent use throughout modern web stacks. 

# related
- `@notemine/core` [`git`](https://github.com/sandwichfarm/notemine/tree/master/packages/core) [`npm`](https://www.npmjs.com/package/@notemine/core) is the low-level js bindings and interface for Notemine WASM.
- `@notemine/vanilla-js-demo` [`git`](https://github.com/sandwichfarm/notemine/tree/master/demos/vanilla-js-demo) is a demo written with HTML, Vanilla JS and CSS, with no bundlers, that implements `@notemine/core`
- `@notemine/svelte-demo` [`git`](https://github.com/sandwichfarm/notemine/tree/master/demos/svelte-demo) is a demo built with `svelte` and bundled with `rollup` that implements `@notemine/wrapper`

## install
package name: `@notemine/wrapper`

```bash
  pnpm install @notemine/wrapper @notemine/core rxjs
```

## usage 
_untested_

```typescript 
  import Notemine from "@notemine/wrapper"

  //prepare meta for event 
  const content = "hello world."
  const tags = [ "#t", "introduction"]
  const pubkey = "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f"

  //set options for notemine 
  const difficulty = 21
  const numberOfWorkers = 7
 
  const notemine = new Notemine({
    content,
    tags,
    difficulty,
    numberOfWorkers    
  })

  //you can also set content, tags and pubkey via assessors after initialization. 
  notemine.pubkey = pubkey

  //start notemine
  notemine.mine()
```

Mining updates can be accessed via observables. 

```
notemine.progress$
notemine.error$
notemine.cancelled$
notemine.success$
notemine.workersPow$
notemine.highestPow$
```

for example:

```
miner.progress$.subscribe( progress => {
  console.log(progress.workerId, progress)
});
```

<details>
<summary>svelte</summary>

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { type Writable, writable } from 'svelte/store';
  import { type ProgressEvent, Notemine } from '@notemine/wrapper';

  const numberOfMiners = 8
  let notemine: Notemine;
  let progress: Writable<ProgressEvent[]> = new writable(new Array(numberOfMiners))
  let success: Writeable<SuccessEvent> = new writable(null)

  onMount(() => {
    notemine = new Notemine({ content: 'Hello, Nostr!', numberOfMiners  });

    const progress$ = miner.progress$.subscribe(progress_ => {
      progress.update( _progress => {
        _progress[progress_.workerId] = progress_
        return _progress
      })
    });

    const success$ = miner.progress$.subscribe(success_ => {
      const {event, totalTime, hashRate}
      success.update( _success => {
        _success = success_
        return _success
      })
      miner.cancel();
    });

    notemine.mine();

    return () => {
      progress$.unsubscribe();
      success$.unsubscribe();
      miner.cancel();
    };
  });
  $: miners = $progress
</script>


<div>
{#each $miners as miner}
<span>Miner #{miner.workerId}: {miner.hashRate}kH/s [Best PoW: ${miner.bestPowData}]
{/each}

{#if($success !== null)}
  <pre>
  {$success.event}
  </pre>
{/if}

</div>
```
</details>



<details>
<summary>react</summary>

```reactjs
  import React, { useEffect } from 'react';
  import { Notemine } from '@notemine/wrapper';

  const MyComponent = () => {
    const notemine = new Notemine({ content: 'Hello, Nostr!' });

    useEffect(() => {
      const subscription = notemine.progress$.subscribe(progress => {
        // Update progress bar or display notemine's progress
      });

      notemine.mine();

      return () => {
        subscription.unsubscribe();
        notemine.cancel();
      };
    }, []);

    return (
      <div>
        {/* Your UI components */}
      </div>
    );
  };

```
</details>

<details>
<summary>vue</summary>

```vue
<template>
  <div>
    <!-- Your UI components -->
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onUnmounted } from 'vue';
import { Notemine } from '@notemine/wrapper';

export default defineComponent({
  name: 'MinerComponent',
  setup() {
    const notemine = new Notemine({ content: 'Hello, Nostr!' });

    onMounted(() => {
      const subscription = notemine.progress$.subscribe(progress => {
        // Update progress bar or display notemine's progress
      });

      notemine.mine();

      onUnmounted(() => {
        subscription.unsubscribe();
        notemine.cancel();
      });
    });

    return {};
  },
});
</script>

```
</details>

<details>
<summary>angular</summary>

```javascript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Notemine } from '@notemine/wrapper';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notemine',
  templateUrl: './notemine.component.html',
})
export class MinerComponent implements OnInit, OnDestroy {
  notemine: Notemine;
  progressSubscription: Subscription;

  ngOnInit() {
    this.notemine = new Notemine({ content: 'Hello, Nostr!' });
    this.progressSubscription = this.notemine.progress$.subscribe(progress => {
      // Update progress bar or display notemine's progress
    });

    this.notemine.mine();
  }

  ngOnDestroy() {
    this.progressSubscription.unsubscribe();
    this.notemine.cancel();
  }
}
```
</details>

### build

### deps

Install **wasm-pack** with `cargo install wasm-pack` 

### build wasm 
Build the wasm with `build:wasm` 

```bash
  pnpm build:wasm
```

### build package 

Build the package with `build` 

```bash
  pnpm run build
```
