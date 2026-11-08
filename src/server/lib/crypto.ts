import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export interface SealedEnvelope {
  keyVersion: number;
  nonce: string;
  ciphertext: string;
  authTag: string;
}
function masterKey(key?: Buffer): Buffer {
  const value =
    key ?? Buffer.from(process.env['STAPLR_MASTER_KEY'] ?? '', 'base64');
  if (value.length !== 32)
    throw new Error('STAPLR_MASTER_KEY must decode to 32 bytes');
  return value;
}
export function seal(plaintext: Buffer, key?: Buffer): SealedEnvelope {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(key), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    keyVersion: 1,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}
/** Seals and serialises for a BLOB column. Never store the plaintext. */
export function sealToBlob(plaintext: Buffer, key?: Buffer): Buffer {
  return Buffer.from(JSON.stringify(seal(plaintext, key)), 'utf8');
}
export function openBlob(blob: Buffer, key?: Buffer): Buffer {
  const parsed: unknown = JSON.parse(blob.toString('utf8'));
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('keyVersion' in parsed) ||
    !('nonce' in parsed) ||
    !('ciphertext' in parsed) ||
    !('authTag' in parsed)
  )
    throw new Error('Invalid sealed blob');
  return open(parsed as SealedEnvelope, key);
}
export function open(envelope: SealedEnvelope, key?: Buffer): Buffer {
  if (envelope.keyVersion !== 1)
    throw new Error('Unsupported secret key version');
  const nonce = Buffer.from(envelope.nonce, 'base64');
  const tag = Buffer.from(envelope.authTag, 'base64');
  if (nonce.length !== 12 || tag.length !== 16)
    throw new Error('Invalid sealed envelope');
  const decipher = createDecipheriv('aes-256-gcm', masterKey(key), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
}
