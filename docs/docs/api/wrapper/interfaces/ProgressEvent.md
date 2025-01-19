[**@notemine/wrapper API v0.1.0**](../README.md)

***

# Interface: ProgressEvent

Defined in: [index.ts:20](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L20)

Data structure representing a progress event during mining

## Properties

### bestPowData?

> `optional` **bestPowData**: [`BestPowData`](BestPowData.md)

Defined in: [index.ts:26](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L26)

Current best proof-of-work data

***

### hashRate?

> `optional` **hashRate**: `number`

Defined in: [index.ts:24](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L24)

Current hash rate of the worker (in hashes per second)

***

### workerId

> **workerId**: `number`

Defined in: [index.ts:22](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L22)

ID of the worker making progress
