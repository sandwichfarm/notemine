[**@notemine/wrapper API v0.0.6**](../README.md) • **Docs**

***

# Interface: WorkerPow

Proof-of-work data including worker information

## Extends

- [`BestPowData`](BestPowData.md)

## Properties

### bestPow

> **bestPow**: `number`

Best proof-of-work value

#### Inherited from

[`BestPowData`](BestPowData.md).[`bestPow`](BestPowData.md#bestpow)

#### Defined in

[index.ts:52](https://github.com/sandwichfarm/minnote-wasm/blob/cc13d787d1ac8e5a3bda1b41bbeb5a31feed0328/packages/wrapper/src/index.ts#L52)

***

### hash

> **hash**: `string`

Hash that met the proof-of-work requirements

#### Inherited from

[`BestPowData`](BestPowData.md).[`hash`](BestPowData.md#hash)

#### Defined in

[index.ts:56](https://github.com/sandwichfarm/minnote-wasm/blob/cc13d787d1ac8e5a3bda1b41bbeb5a31feed0328/packages/wrapper/src/index.ts#L56)

***

### nonce

> **nonce**: `string`

Nonce used to achieve the proof-of-work

#### Inherited from

[`BestPowData`](BestPowData.md).[`nonce`](BestPowData.md#nonce)

#### Defined in

[index.ts:54](https://github.com/sandwichfarm/minnote-wasm/blob/cc13d787d1ac8e5a3bda1b41bbeb5a31feed0328/packages/wrapper/src/index.ts#L54)

***

### workerId?

> `optional` **workerId**: `number`

ID of the worker who found this proof-of-work

#### Defined in

[index.ts:62](https://github.com/sandwichfarm/minnote-wasm/blob/cc13d787d1ac8e5a3bda1b41bbeb5a31feed0328/packages/wrapper/src/index.ts#L62)
