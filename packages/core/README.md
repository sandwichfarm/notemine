> Note: You most likely want to use [`@notemine/wrapper`](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper)

# @notemine/core
WASM js bindings for Notemine.

# related
- [`@notemine/wrapper`](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper) - A user-friendly wrapper for `@notemine/core` that greatly simplifies usage in modern stacks and deployments with modern bundlers. Provides observables, manages workers, tracks internal state and bundles wasm as _inline base64_ within _inline_ web-workers for hassle-free use in modern apps targeted for the browser.
- [`@notemine/vanilla-js-demo`](https://github.com/sandwichfarm/notemine/tree/master/demos/vanilla-js-demo) is a demo written with HTML, Vanilla JS and CSS, with no bundlers, that implements `@notemine/core`
- [`@notemine/svelte-demo`](https://github.com/sandwichfarm/notemine/tree/master/demos/svelte-demo) is a demo built with `svelte` and `vite` that implements `@notemine/wrapper`

# install 
```js
pnpm install @notemine/core
```

# usage
```js
import init, { mine_event } from './pkg/notemine.js';

//You shouldn't need to pass id or sig, and created_at is optional.
const event = {
  "pubkey": "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f",
  "kind": 1,
  "tags": [],
  "content": "hello world",
}

const difficulty = 21
let cancel = false 

function reportProgress(hashRate = undefined, bestPow = undefined) {
  if(hashRate){
    console.log(`hash rate: ${hashRate}`);
  }
  if(bestPow){
    console.log('best pow: ', bestPow);
  }
}

function shouldCancel() {
  //Add some logic here
  //if it returns true, wasm should stop mining.
  return cancel 
}

const run = async () => {
  //this is synchronous.
  const minedResult = mine_event(
    event,
    difficulty,
    startNonce.toString(),
    nonceStep.toString(),
    reportProgress,
    shouldCancel
  );
}
await init({});
```

# build
Refer to the [Readme on Github](https://github.com/sandwichfarm/notemine/tree/master/packages/core) for WASM build instructions

# license
GNU General Public License v3.0