import crypto from 'node:crypto';

// ----------------------------------------------------------------------
// AES-256-GCM encrypt/decrypt cho secret lưu trong DB (vd R2 secret access key).
// Key đến từ env GAMI_SECRET_ENCRYPTION_KEY (base64, 32 bytes). Thiếu env -> fallback plaintext.

export type EncryptedSecret = { value: string; iv: string; encrypted: true };

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer | null {
  const raw = process.env.GAMI_SECRET_ENCRYPTION_KEY;
  if (!raw) return null;

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    console.warn('[secret-crypto] GAMI_SECRET_ENCRYPTION_KEY phải là 32 bytes base64 — bỏ qua, dùng plaintext.');

    return null;
  }

  return key;
}

export function isEncryptionAvailable(): boolean {
  return getKey() !== null;
}

// Trả về object encrypted nếu có key, ngược lại trả plaintext string (forward-compat).
export function encryptSecret(plain: string): EncryptedSecret | string {
  const key = getKey();
  if (!key) {
    console.warn('[secret-crypto] Không có encryption key — secret được lưu plaintext.');

    return plain;
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    value: Buffer.concat([ciphertext, authTag]).toString('base64'),
    iv: iv.toString('base64'),
    encrypted: true,
  };
}

function isEncryptedBlob(blob: unknown): blob is EncryptedSecret {
  return Boolean(
    blob && typeof blob === 'object' && (blob as any).encrypted === true && (blob as any).value && (blob as any).iv
  );
}

// Đọc: nếu là blob encrypted -> decrypt; nếu là string/khác -> treat plaintext.
export function decryptSecret(blob: unknown): string {
  if (typeof blob === 'string') return blob;
  if (!isEncryptedBlob(blob)) return blob == null ? '' : String(blob);

  const key = getKey();
  if (!key) {
    console.warn('[secret-crypto] Secret đã mã hoá nhưng thiếu key — không giải mã được.');

    return '';
  }

  const raw = Buffer.from(blob.value, 'base64');
  const authTag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(0, raw.length - 16);
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Mã hoá -> chuỗi để lưu cột String (JSON-hoá blob nếu có mã hoá; plaintext nếu không có key).
export function encryptSecretToString(plain: string): string {
  const enc = encryptSecret(plain);

  return typeof enc === 'string' ? enc : JSON.stringify(enc);
}

// Đọc chuỗi từ cột String -> plaintext (tự nhận biết blog JSON đã mã hoá hay plaintext).
export function decryptSecretFromString(stored: string | null | undefined): string {
  if (!stored) return '';
  let blob: unknown = stored;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === 'object') blob = parsed;
  } catch {
    // không phải JSON -> plaintext
  }

  return decryptSecret(blob);
}
