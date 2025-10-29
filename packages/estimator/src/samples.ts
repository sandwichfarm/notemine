function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateContent(bytes: number, seed = 1): Uint8Array {
  const rng = mulberry32(seed);
  const buf = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) buf[i] = 32 + Math.floor(rng() * 95);
  return buf;
}

export function generateTags(count: number): string[] {
  const tags: string[] = [];
  for (let i = 0; i < count; i++) tags.push(`t${(i + 1).toString().padStart(4, '0')}`);
  return tags;
}

export function buildSample(bytes: number, tags: number, seed: number, buildPayload: (content: Uint8Array, tags: string[]) => any) {
  const content = generateContent(bytes, seed);
  const tagList = generateTags(tags);
  const payload = buildPayload(content, tagList);
  return { content, tags: tagList, payload };
}

