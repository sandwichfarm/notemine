[**@notemine/wrapper API v0.1.0**](../README.md)

***

# Interface: WorkerPow

Defined in: [index.ts:60](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L60)

Proof-of-work data including worker information

## Extends

- [`BestPowData`](BestPowData.md)

## Properties

### bestPow

> **bestPow**: `number`

Defined in: [index.ts:52](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L52)

Best proof-of-work value

#### Inherited from

[`BestPowData`](BestPowData.md).[`bestPow`](BestPowData.md#bestpow)

***

### hash

> **hash**: `string`

Defined in: [index.ts:56](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L56)

Hash that met the proof-of-work requirements

#### Inherited from

[`BestPowData`](BestPowData.md).[`hash`](BestPowData.md#hash)

***

### nonce

> **nonce**: `string`

Defined in: [index.ts:54](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L54)

Nonce used to achieve the proof-of-work

#### Inherited from

[`BestPowData`](BestPowData.md).[`nonce`](BestPowData.md#nonce)

***

### workerId?

> `optional` **workerId**: `number`

Defined in: [index.ts:62](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L62)

ID of the worker who found this proof-of-work
