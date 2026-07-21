const test = require('node:test');
const assert = require('node:assert/strict');
const keyProtect = require('../utils/keyProtect');

const KEY = '12345678901234567890123456789012';
const SECRET = 'test-secret-not-the-app-secret';

test('encryptWithSecret/decryptWithSecret round-trips the plaintext key', () => {
  const resource = keyProtect.encryptWithSecret(KEY, SECRET);
  assert.equal(keyProtect.decryptWithSecret(resource, SECRET), KEY);
});

test('encrypted resource never contains the plaintext key as a substring', () => {
  const resource = keyProtect.encryptWithSecret(KEY, SECRET);
  const serialized = JSON.stringify(resource);
  assert.equal(serialized.includes(KEY), false);
});

test('decrypting with the wrong secret throws rather than returning garbage', () => {
  const resource = keyProtect.encryptWithSecret(KEY, SECRET);
  assert.throws(() => keyProtect.decryptWithSecret(resource, 'wrong-secret'));
});

test('a tampered ciphertext or auth tag fails decryption', () => {
  const resource = keyProtect.encryptWithSecret(KEY, SECRET);
  const tamperedCiphertext = { ...resource, ciphertext: resource.ciphertext.replace(/^./, resource.ciphertext[0] === 'a' ? 'b' : 'a') };
  assert.throws(() => keyProtect.decryptWithSecret(tamperedCiphertext, SECRET));
  const tamperedTag = { ...resource, tag: resource.tag.replace(/^./, resource.tag[0] === 'a' ? 'b' : 'a') };
  assert.throws(() => keyProtect.decryptWithSecret(tamperedTag, SECRET));
});

test('isEncryptedResourceShape validates the full field set', () => {
  const resource = keyProtect.encryptWithSecret(KEY, SECRET);
  assert.equal(keyProtect.isEncryptedResourceShape(resource), true);
  assert.equal(keyProtect.isEncryptedResourceShape({ ...resource, salt: undefined }), false);
  assert.equal(keyProtect.isEncryptedResourceShape('not-an-object'), false);
  assert.equal(keyProtect.isEncryptedResourceShape(null), false);
  assert.equal(keyProtect.isEncryptedResourceShape({ v: 1 }), false);
});

test('deriveVerifier/verifyAgainstVerifier accept the right key and reject a wrong one', () => {
  const verifier = keyProtect.deriveVerifier(KEY);
  assert.match(verifier, /^scram-sha-512\$[0-9a-f]+\$\d+\$[0-9a-f]+$/);
  assert.equal(keyProtect.verifyAgainstVerifier(KEY, verifier), true);
  assert.equal(keyProtect.verifyAgainstVerifier('00000000000000000000000000000000', verifier), false);
});

test('verifyAgainstVerifier parses garbage defensively instead of throwing', () => {
  assert.equal(keyProtect.verifyAgainstVerifier(KEY, 'not-a-verifier'), false);
  assert.equal(keyProtect.verifyAgainstVerifier(KEY, 'scram-sha-512$zz$abc$zz'), false);
  assert.equal(keyProtect.verifyAgainstVerifier(KEY, ''), false);
  assert.equal(keyProtect.verifyAgainstVerifier(KEY, null), false);
  assert.equal(keyProtect.verifyAgainstVerifier('', 'scram-sha-512$aa$1$bb'), false);
});
