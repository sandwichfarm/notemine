import { getEventHash } from "nostr-tools";

export const getPow = (hex) => {
  let count = 0;

  for (let i = 0; i < hex.length; i++) {
      const nibble = parseInt(hex[i], 16);
      if (nibble === 0) {
          count += 4;
      } else {
          count += Math.clz32(nibble) - 28;
          break;
      }
  }

  return count;
}

export const verifyPow = (event) => {
  //console.log(event)
  const hash = getEventHash(event);
  const count = getPow(hash);
  const nonceTag = event.tags.find(tag => tag[0] === 'nonce');
  if (!nonceTag || nonceTag.length < 3) {
      return 0;
  }
  const targetDifficulty = parseInt(nonceTag[2], 10);
  return Math.min(count, targetDifficulty);
}