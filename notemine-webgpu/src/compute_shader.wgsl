const SHA256_BLOCK_SIZE: u32 = 32;

struct SHA256_CTX {
    data: array<u32, 64>,
    datalen: u32,
    bitlen: array<u32, 2>,
    state: array<u32, 8>,
    info: u32, 
};

struct Input {
    event: array<u32, 64>,
    start_nonce_low: u32,
    start_nonce_high: u32,
    nonce_step_low: u32,
    nonce_step_high: u32,
    difficulty: u32,
    send_event_with_best_pow: u32,
    best_pow_threshold: u32,
};

struct Output {
    best_pow: u32,
    best_nonce_low: u32,
    best_nonce_high: u32,
    best_hash: array<u32, 8>, // Since [u8;32] is 32 bytes, which is 8 u32s
    event_found: u32,
    event: array<u32, 64>,
};

// Bindings
@group(0) @binding(0)
var<storage, read> input_buffer: Input;

@group(0) @binding(1)
var<storage, read_write> output_buffer: Output;

const k = array<u32, 64>(
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
);

// Bitwise rotation functions
fn ROTLEFT(a: u32, b: u32) -> u32 {
    return (a << b) | (a >> (32u32 - b));
}

fn ROTRIGHT(a: u32, b: u32) -> u32 {
    return (a >> b) | (a << (32u32 - b));
}

// SHA-256 functions
fn CH(x: u32, y: u32, z: u32) -> u32 {
    return ((x & y) ^ (~x & z));
}

fn MAJ(x: u32, y: u32, z: u32) -> u32 {
    return ((x & y) ^ (x & z) ^ (y & z));
}

fn EP0(x: u32) -> u32 {
    return ROTRIGHT(x, 2u32) ^ ROTRIGHT(x, 13u32) ^ ROTRIGHT(x, 22u32);
}

fn EP1(x: u32) -> u32 {
    return ROTRIGHT(x, 6u32) ^ ROTRIGHT(x, 11u32) ^ ROTRIGHT(x, 25u32);
}

fn SIG0(x: u32) -> u32 {
    return ROTRIGHT(x, 7u32) ^ ROTRIGHT(x, 18u32) ^ (x >> 3u32);
}

fn SIG1(x: u32) -> u32 {
    return ROTRIGHT(x, 17u32) ^ ROTRIGHT(x, 19u32) ^ (x >> 10u32);
}

// SHA-256 transformation function
fn sha256_transform(ctx: ptr<storage, SHA256_CTX>) {
    var a: u32 = (*ctx).state[0];
    var b: u32 = (*ctx).state[1];
    var c: u32 = (*ctx).state[2];
    var d: u32 = (*ctx).state[3];
    var e: u32 = (*ctx).state[4];
    var f: u32 = (*ctx).state[5];
    var g: u32 = (*ctx).state[6];
    var h: u32 = (*ctx).state[7];
    
    var i: u32 = 0u32;
    var j: u32 = 0u32;
    var t1: u32;
    var t2: u32;
    var m: array<u32, 64>;
    
    // Prepare message schedule
    while (i < 16u32) {
        m[i] = ((*ctx).data[j] << 24u32) | ((*ctx).data[j + 1u32] << 16u32) | ((*ctx).data[j + 2u32] << 8u32) | ((*ctx).data[j + 3u32]);
        i = i + 1u32;
        j = j + 4u32;
    }
    
    while (i < 64u32) {
        m[i] = SIG1(m[i - 2u32]) + m[i - 7u32] + SIG0(m[i - 15u32]) + m[i - 16u32];
        i = i + 1u32;
    }
    
    // Compression function main loop
    for (i = 0u32; i < 64u32; i = i + 1u32) {
        t1 = h + EP1(e) + CH(e, f, g) + k[i] + m[i];
        t2 = EP0(a) + MAJ(a, b, c);
        h = g;
        g = f;
        f = e;
        e = d + t1;
        d = c;
        c = b;
        b = a;
        a = t1 + t2;
    }
    
    // Add the compressed chunk to the current hash value
    (*ctx).state[0] = (*ctx).state[0] + a;
    (*ctx).state[1] = (*ctx).state[1] + b;
    (*ctx).state[2] = (*ctx).state[2] + c;
    (*ctx).state[3] = (*ctx).state[3] + d;
    (*ctx).state[4] = (*ctx).state[4] + e;
    (*ctx).state[5] = (*ctx).state[5] + f;
    (*ctx).state[6] = (*ctx).state[6] + g;
    (*ctx).state[7] = (*ctx).state[7] + h;
}

// SHA-256 update function
fn sha256_update(ctx: ptr<storage, SHA256_CTX>, len: u32) {
    for (var i: u32 = 0u32; i < len; i = i + 1u32) {
        (*ctx).data[(*ctx).datalen] = input[i];
        (*ctx).datalen = (*ctx).datalen + 1u32;
        if ((*ctx).datalen == 64u32) {
            sha256_transform(ctx);
            if ((*ctx).bitlen[0] > 0xFFFFFFFFu32 - 512u32) {
                (*ctx).bitlen[1] = (*ctx).bitlen[1] + 1u32;
            }
            (*ctx).bitlen[0] = (*ctx).bitlen[0] + 512u32;
            (*ctx).datalen = 0u32;
        }
    }
}

// SHA-256 finalization function
fn sha256_final(ctx: ptr<storage, SHA256_CTX>, hash: ptr<storage, array<u32, SHA256_BLOCK_SIZE>>) {
    var i: u32 = (*ctx).datalen;
    
    if ((*ctx).datalen < 56u32) {
        (*ctx).data[i] = 0x80u32;
        i = i + 1u32;
        while (i < 56u32) {
            (*ctx).data[i] = 0x00u32;
            i = i + 1u32;
        }
    } else {
        (*ctx).data[i] = 0x80u32;
        i = i + 1u32;
        while (i < 64u32) {
            (*ctx).data[i] = 0x00u32;
            i = i + 1u32;
        }
        sha256_transform(ctx);
        for (i = 0u32; i < 56u32; i = i + 1u32) {
            (*ctx).data[i] = 0u32;
        }
    }
    
    if ((*ctx).bitlen[0] > 0xFFFFFFFFu32 - ((*ctx).datalen * 8u32)) {
        (*ctx).bitlen[1] = (*ctx).bitlen[1] + 1u32;
    }
    (*ctx).bitlen[0] = (*ctx).bitlen[0] + ((*ctx).datalen * 8u32);
    
    (*ctx).data[63u32] = (*ctx).bitlen[0];
    (*ctx).data[62u32] = (*ctx).bitlen[0] >> 8u32;
    (*ctx).data[61u32] = (*ctx).bitlen[0] >> 16u32;
    (*ctx).data[60u32] = (*ctx).bitlen[0] >> 24u32;
    (*ctx).data[59u32] = (*ctx).bitlen[1];
    (*ctx).data[58u32] = (*ctx).bitlen[1] >> 8u32;
    (*ctx).data[57u32] = (*ctx).bitlen[1] >> 16u32;
    (*ctx).data[56u32] = (*ctx).bitlen[1] >> 24u32;
    
    sha256_transform(ctx);
    
    for (i = 0u32; i < 32u32; i = i + 1u32) {
        (*hash)[i] = ((*ctx).state[i / 4u32] >> (24u32 - (i % 4u32) * 8u32)) & 0xFFu32;
    }
}

// Compute Shader Main Function
@compute @workgroup_size(1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var ctx: SHA256_CTX;
    var buf: array<u32, SHA256_BLOCK_SIZE>;

    // Initialize SHA256_CTX
    ctx.datalen = 0u32;
    ctx.bitlen = array<u32, 2>(0u32, 0u32);
    ctx.state = array<u32, 8>(
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    );
    ctx.info = 0u32; // Placeholder

    // Update SHA256_CTX with input data
    sha256_update(&ctx, input_buffer.event[0]);

    // Finalize SHA-256 hash
    sha256_final(&ctx, &buf);

    // Extract hash from buffer
    var hash: array<u32, 32> = buf;

    // Convert hash from u32 array to u8 array
    var hash_bytes: array<u8, 32>;
    for (var i: u32 = 0u32; i < 32u32; i = i + 1u32) {
        hash_bytes[i] = (hash[i / 4u32] >> (24u32 - (i % 4u32) * 8u32)) & 0xFFu32;
    }

    // Calculate Proof of Work (number of leading zero bits)
    var pow: u32 = 0u32;
    for (var i: u32 = 0u32; i < 32u32; i = i + 1u32) {
        if (hash_bytes[i] == 0u8) {
            pow = pow + 8u32;
        } else {
            let leading = count_leading_zeros(hash_bytes[i]);
            pow = pow + leading;
            break;
        }
    }

    // Check if current PoW is better than the best PoW found so far
    if (pow > output_buffer.best_pow) {
        output_buffer.best_pow = pow;
        output_buffer.best_nonce = input_buffer.start_nonce + (u64(global_id.x) * input_buffer.nonce_step);

        // Update best_hash
        for (var i: u32 = 0u32; i < 32u32; i = i + 1u32) {
            output_buffer.best_hash[i] = hash_bytes[i];
        }

        // Determine if event data should be sent back
        var include_event: u32 = 0u32;
        if (input_buffer.send_event_with_best_pow == 1u32) {
            let threshold: u32 = if (input_buffer.best_pow_threshold > 0u32) {
                input_buffer.best_pow_threshold
            } else {
                u32(f32(input_buffer.difficulty) * 0.8)
            };

            if (pow > threshold) {
                include_event = 1u32;

                // Copy event data from input to output
                for (var i: u32 = 0u32; i < 64u32; i = i + 1u32) {
                    output_buffer.event[i] = input_buffer.event[i];
                }
            }
        }
        output_buffer.event_found = include_event;
    }
}

// Helper function to count leading zeros in a byte
fn count_leading_zeros(x: u8) -> u32 {
    var count: u32 = 0u32;
    for (var i: u32 = 7u32; i < 32u32; i = i + 1u32) { // Start from the MSB
        if ((x >> (7u32 - i)) & 1u8) == 0u8 {
            count = count + 1u32;
        } else {
            break;
        }
    }
    return count;
}
