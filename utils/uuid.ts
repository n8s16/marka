// UUID v4 generator. IDs in Marka are generated client-side; the database
// stores them as text and never auto-increments. See docs/DATA_MODEL.md.
//
// Strategy, in priority order:
//   1. `globalThis.crypto.randomUUID()` — modern Hermes (RN 0.74+) and Web both
//      expose this. Standards-compliant RFC 4122 v4.
//   2. `globalThis.crypto.getRandomValues()` + manual RFC 4122 v4 layout — used
//      when `randomUUID` is unavailable but a CSPRNG is.
//   3. `Math.random()` fallback — last resort. Acceptable for a personal,
//      local-only tracker because IDs are never used as security tokens; they
//      exist only to disambiguate rows on this device. Still RFC 4122 v4
//      compliant in shape, just with weaker entropy.
//
// No external deps; this keeps the bundle lean and avoids the `uuid` package.

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
};

function getCrypto(): CryptoLike | undefined {
  // `globalThis.crypto` exists on Hermes (RN 0.74+), the JSI runtime, browsers,
  // and Node 19+. Guarded for older runtimes.
  return (globalThis as { crypto?: CryptoLike }).crypto;
}

function fromRandomUUID(c: CryptoLike): string | undefined {
  return c.randomUUID ? c.randomUUID() : undefined;
}

function fromGetRandomValues(c: CryptoLike): string | undefined {
  if (!c.getRandomValues) return undefined;
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return formatV4(bytes);
}

function fromMathRandom(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return formatV4(bytes);
}

// Apply RFC 4122 v4 version + variant bits and format as canonical string.
function formatV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

export function uuid(): string {
  const c = getCrypto();
  if (c) {
    const fromNative = fromRandomUUID(c);
    if (fromNative) return fromNative;
    const fromCSPRNG = fromGetRandomValues(c);
    if (fromCSPRNG) return fromCSPRNG;
  }
  return fromMathRandom();
}
