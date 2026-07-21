// keyProtect.js
//
// Helpers for keeping the SQLite database key off disk in plaintext. The key
// itself is not a user secret -- it is the game's own save-file cipher key,
// bundled with the app so sqlite3mc can open save files. These helpers exist
// only so the distributed package never contains a naked plaintext key
// string; they are NOT a security boundary against someone reading this
// module's own source (APP_RESOURCE_SECRET is public in the repo).
//
// Two independent things are stored per key:
//   - a reversible AES-256-GCM encryption of the key (needed because
//     sqlite3mc requires the real plaintext key at runtime -- a one-way hash
//     like real SCRAM-SHA-512 could never be turned back into a usable key)
//   - a salted, iterated SCRAM-SHA-512-style verifier (PBKDF2-HMAC-SHA512),
//     used only to confirm a candidate key matches without ever needing to
//     compare plaintext directly

'use strict';

const crypto = require('crypto');

const SCRAM_ALGORITHM = 'scram-sha-512';
const SCRAM_ITERATIONS = 210000;
const SCRAM_KEY_LENGTH = 64;

// Fixed passphrase used only to obscure the bundled default key at rest.
const APP_RESOURCE_SECRET = 'ForeverWinterSaveEditor::bundled-key-resource::v1';

function deriveEncryptionKey(secret, salt) {
  return crypto.scryptSync(secret, salt, 32);
}

function encryptWithSecret(plainKey, secret) {
  if (typeof plainKey !== 'string' || !plainKey) throw new Error('encryptWithSecret: plainKey must be a non-empty string');
  if (typeof secret !== 'string' || !secret) throw new Error('encryptWithSecret: secret must be a non-empty string');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const encKey = deriveEncryptionKey(secret, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex')
  };
}

function isEncryptedResourceShape(resource) {
  return !!resource
    && typeof resource === 'object'
    && resource.v === 1
    && typeof resource.salt === 'string' && /^[0-9a-f]+$/i.test(resource.salt)
    && typeof resource.iv === 'string' && /^[0-9a-f]+$/i.test(resource.iv)
    && typeof resource.tag === 'string' && /^[0-9a-f]+$/i.test(resource.tag)
    && typeof resource.ciphertext === 'string' && /^[0-9a-f]+$/i.test(resource.ciphertext);
}

function decryptWithSecret(resource, secret) {
  if (!isEncryptedResourceShape(resource)) throw new Error('decryptWithSecret: malformed encrypted key resource');
  if (typeof secret !== 'string' || !secret) throw new Error('decryptWithSecret: secret must be a non-empty string');
  const salt = Buffer.from(resource.salt, 'hex');
  const iv = Buffer.from(resource.iv, 'hex');
  const tag = Buffer.from(resource.tag, 'hex');
  const ciphertext = Buffer.from(resource.ciphertext, 'hex');
  const encKey = deriveEncryptionKey(secret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

function deriveVerifier(plainKey) {
  if (typeof plainKey !== 'string' || !plainKey) throw new Error('deriveVerifier: plainKey must be a non-empty string');
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(plainKey, salt, SCRAM_ITERATIONS, SCRAM_KEY_LENGTH, 'sha512');
  return `${SCRAM_ALGORITHM}$${salt.toString('hex')}$${SCRAM_ITERATIONS}$${hash.toString('hex')}`;
}

function verifyAgainstVerifier(plainKey, verifier) {
  if (typeof plainKey !== 'string' || !plainKey) return false;
  if (typeof verifier !== 'string') return false;
  const parts = verifier.split('$');
  if (parts.length !== 4 || parts[0] !== SCRAM_ALGORITHM) return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  let salt, expected;
  try {
    salt = Buffer.from(parts[1], 'hex');
    expected = Buffer.from(parts[3], 'hex');
  } catch {
    return false;
  }
  if (!salt.length || !expected.length) return false;
  const actual = crypto.pbkdf2Sync(plainKey, salt, iterations, expected.length, 'sha512');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  APP_RESOURCE_SECRET,
  encryptWithSecret,
  decryptWithSecret,
  isEncryptedResourceShape,
  deriveVerifier,
  verifyAgainstVerifier
};
