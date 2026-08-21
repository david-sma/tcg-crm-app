import crypto from 'crypto';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

// Restricted character pools that eliminate ambiguous characters: '0', 'O', '1', 'l', 'I'
const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz';
const NUMBER_CHARS = '23456789';
const SYMBOL_CHARS = '!@#$%&*';
const ALL_ALLOWED_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + NUMBER_CHARS + SYMBOL_CHARS;

/**
 * Generates a cryptographically secure 8-character temporary password
 * Guaranteed to contain: >=1 uppercase, >=1 lowercase, >=1 number, >=1 symbol
 */
export function generateStaffPassword(): string {
  const result: string[] = [];

  // Guarantee at least one from each required pool
  result.push(getRandomChar(UPPERCASE_CHARS));
  result.push(getRandomChar(LOWERCASE_CHARS));
  result.push(getRandomChar(NUMBER_CHARS));
  result.push(getRandomChar(SYMBOL_CHARS));

  // Fill remaining 4 positions from the full allowed pool
  for (let i = 0; i < 4; i++) {
    result.push(getRandomChar(ALL_ALLOWED_CHARS));
  }

  // Cryptographically shuffle the array (Fisher-Yates)
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  return result.join('');
}

function getRandomChar(pool: string): string {
  const index = crypto.randomInt(0, pool.length);
  return pool[index];
}

/**
 * Hash password securely with scrypt + salt
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify plaintext password against stored salt:hash using constant-time verification
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') {
    return false;
  }
  const trimmed = password.trim();

  return new Promise((resolve) => {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return resolve(false);

    crypto.scrypt(trimmed, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return resolve(false);
      const keyBuffer = Buffer.from(key, 'hex');
      if (keyBuffer.length !== derivedKey.length) return resolve(false);
      resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
    });
  });
}

/**
 * Normalizes phone numbers to international E.164 format, defaulting to NZ
 */
export function normalizePhone(rawPhone: string): { isValid: boolean; e164: string; formatted: string; error?: string } {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { isValid: false, e164: '', formatted: '', error: 'Phone number is required' };
  }

  const trimmed = rawPhone.trim();

  // Clean characters: keep digits and optional leading +
  let cleaned = trimmed.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  } else if (cleaned.startsWith('64') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+') && !cleaned.startsWith('0') && cleaned.startsWith('2')) {
    // e.g. "271234567" -> "0271234567"
    cleaned = '0' + cleaned;
  }

  try {
    const phoneNumber = parsePhoneNumber(cleaned, 'NZ');
    if (phoneNumber && phoneNumber.isValid()) {
      return {
        isValid: true,
        e164: phoneNumber.number, // E.164 format (+64...)
        formatted: phoneNumber.formatNational(), // e.g. "027 730 4466"
      };
    }
  } catch {
    // Fall through to fallback parser
  }

  // Fallback for NZ national number patterns (e.g. 027..., 021..., 022...)
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.startsWith('64') && digitsOnly.length >= 9) {
    return {
      isValid: true,
      e164: `+${digitsOnly}`,
      formatted: `+${digitsOnly}`,
    };
  }
  if (digitsOnly.startsWith('0') && digitsOnly.length >= 9) {
    const e164 = `+64${digitsOnly.slice(1)}`;
    return {
      isValid: true,
      e164,
      formatted: cleaned,
    };
  }

  return { isValid: false, e164: '', formatted: '', error: 'Invalid phone number format' };
}
