import crypto from 'crypto';

/**
 * Calcule le SHA256 d'un Buffer et retourne une hex string.
 */
export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}