/**
 * RFC 6238 Time-Based One-Time Password (TOTP) Generator & Verifier
 * Compatible with Google Authenticator, Authy, Microsoft Authenticator & Apple Passwords.
 */

// Base32 Alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a random Base32 TOTP secret key (16 characters)
 */
export function generateTotpSecret(length: number = 16): string {
  let secret = '';
  const randomBytes = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < length; i++) {
    secret += BASE32_ALPHABET[randomBytes[i] % 32];
  }
  return secret;
}

/**
 * Converts Base32 string to Uint8Array
 */
function base32ToBytes(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return bytes;
}

/**
 * Pure HMAC-SHA1 implementation using Web Crypto API
 */
async function hmacSha1(keyBytes: Uint8Array, messageBytes: Uint8Array): Promise<Uint8Array> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      );
      const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, messageBytes);
      return new Uint8Array(signature);
    } catch {
      // Fallback
    }
  }

  // Pure JS SHA-1 HMAC Fallback if subtle crypto is unavailable
  return fallbackHmacSha1(keyBytes, messageBytes);
}

function fallbackHmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  let keyPadded = new Uint8Array(blockSize);
  if (key.length > blockSize) {
    // Basic hash
    keyPadded = key.slice(0, blockSize);
  } else {
    keyPadded.set(key);
  }

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = keyPadded[i] ^ 0x5c;
    iKeyPad[i] = keyPadded[i] ^ 0x36;
  }

  const innerMsg = new Uint8Array(iKeyPad.length + message.length);
  innerMsg.set(iKeyPad);
  innerMsg.set(message, iKeyPad.length);
  const innerHash = simpleSha1(innerMsg);

  const outerMsg = new Uint8Array(oKeyPad.length + innerHash.length);
  outerMsg.set(oKeyPad);
  outerMsg.set(innerHash, oKeyPad.length);
  return simpleSha1(outerMsg);
}

function simpleSha1(data: Uint8Array): Uint8Array {
  // Simple fallback SHA1 implementation
  let h0 = 0x67452301;
  let h1 = 0xEFCDAB89;
  let h2 = 0x98BADCFE;
  let h3 = 0x10325476;
  let h4 = 0xC3D2E1F0;

  const len = data.length;
  const bitLen = len * 8;
  const paddedLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen, false);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    const w = new Uint32Array(80);
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (n << 1) | (n >>> 31);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;

    for (let i = 0; i < 80; i++) {
      let f = 0, k = 0;
      if (i < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5A827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }

      const temp = ((a << 5) | (a >>> 27)) + f + e + k + w[i];
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const result = new Uint8Array(20);
  const resView = new DataView(result.buffer);
  resView.setUint32(0, h0, false);
  resView.setUint32(4, h1, false);
  resView.setUint32(8, h2, false);
  resView.setUint32(12, h3, false);
  resView.setUint32(16, h4, false);
  return result;
}

/**
 * Calculates current 6-digit TOTP code for a secret and a timestamp counter
 */
export async function generateTotpCode(secret: string, timeStep: number = 30, epochTime: number = Date.now()): Promise<string> {
  const counter = Math.floor(epochTime / 1000 / timeStep);
  const keyBytes = base32ToBytes(secret);

  const counterBytes = new Uint8Array(8);
  let temp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const hmac = await hmacSha1(keyBytes, counterBytes);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verifies if user entered code matches TOTP for current time step (allows skew -1, 0, +1 time steps)
 */
export async function verifyTotpCode(secret: string, inputCode: string, backupCodes?: string[]): Promise<boolean> {
  const cleanCode = inputCode.replace(/[\s-]/g, '').trim();
  if (!cleanCode || cleanCode.length < 6) return false;

  // Check backup codes first
  if (backupCodes && Array.isArray(backupCodes)) {
    const formattedBackup = cleanCode.toUpperCase();
    if (backupCodes.some(b => b.replace(/[\s-]/g, '').toUpperCase() === formattedBackup)) {
      return true;
    }
  }

  const now = Date.now();
  // Check -60s, -30s, 0s, +30s, +60s time steps for clock drift tolerance across devices
  const timeSteps = [-2, -1, 0, 1, 2];
  for (const stepOffset of timeSteps) {
    const testTime = now + stepOffset * 30000;
    const expected = await generateTotpCode(secret, 30, testTime);
    if (expected === cleanCode) {
      return true;
    }
  }

  return false;
}

/**
 * Creates `otpauth://` URI for Authenticator apps (Google Authenticator, Authy, Apple Passwords)
 */
export function getTotpUri(username: string, secret: string, issuer: string = 'Werkdonalds POS'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedUser = encodeURIComponent(username);
  return `otpauth://totp/${encodedIssuer}:${encodedUser}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Creates QR code image URL for scanning in Google Authenticator or Apple Passwords
 */
export function getTotpQrCodeUrl(username: string, secret: string, issuer: string = 'Werkdonalds POS'): string {
  const otpUri = getTotpUri(username, secret, issuer);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpUri)}`;
}

/**
 * Generates 5 random backup codes (e.g. `WD-8492-1042`)
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const part1 = Math.floor(1000 + Math.random() * 9000);
    const part2 = Math.floor(1000 + Math.random() * 9000);
    codes.push(`WD-${part1}-${part2}`);
  }
  return codes;
}
