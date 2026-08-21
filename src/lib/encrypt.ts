import crypto from "crypto";

/**
 * Examint — AES-256-GCM Encryption Utility
 *
 * Used exclusively to encrypt and decrypt the Gemini API key stored in the
 * `User.geminiApiKey` database field.
 *
 * Algorithm: AES-256-GCM
 * - GCM mode provides both encryption (confidentiality) AND authentication
 *   (integrity check via auth tag). A tampered ciphertext will fail decryption.
 * - Key length: 256 bits (32 bytes), derived from NEXTAUTH_SECRET via SHA-256.
 * - IV length: 12 bytes (96 bits), randomly generated per encryption call.
 *   The IV is prepended to the ciphertext so decryption can recover it.
 * - Auth tag length: 16 bytes, appended after the ciphertext.
 *
 * Storage format (hex-encoded string):
 *   <12-byte IV> + <N-byte ciphertext> + <16-byte auth tag>
 *   All concatenated and hex-encoded into a single string stored in the DB.
 *
 * Security note: NEXTAUTH_SECRET must be at least 32 characters long and
 * kept confidential. Rotating NEXTAUTH_SECRET will invalidate all stored keys.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV — recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag — maximum strength

/**
 * Derives a 32-byte (256-bit) AES key from the NEXTAUTH_SECRET environment
 * variable using SHA-256. This ensures the key is always exactly 32 bytes
 * regardless of how long NEXTAUTH_SECRET is.
 *
 * @throws Error if NEXTAUTH_SECRET is not set in the environment.
 * @returns A 32-byte Buffer suitable for use as an AES-256 key.
 */
function getDerivedKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "NEXTAUTH_SECRET environment variable is not set. " +
        "Set it in .env.local before starting the application."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The Gemini API key string to encrypt.
 * @returns A hex-encoded string containing the IV, ciphertext, and auth tag.
 *          Returns an empty string if plaintext is empty or null/undefined.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return "";

  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Concatenate IV + ciphertext + authTag and return as a hex string.
  return Buffer.concat([iv, encrypted, authTag]).toString("hex");
}

/**
 * Decrypts a hex-encoded ciphertext string produced by `encrypt()`.
 *
 * @param ciphertext - The hex-encoded string from the database.
 * @returns The original plaintext (Gemini API key), or an empty string if
 *          the ciphertext is empty or decryption fails (e.g. wrong key or
 *          tampered data).
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return "";

  try {
    const key = getDerivedKey();
    const data = Buffer.from(ciphertext, "hex");

    // Split the buffer back into IV, ciphertext, and auth tag.
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    // If decryption fails (wrong key, tampered data, or corrupt storage),
    // return an empty string so the caller can prompt the user to re-enter
    // their API key rather than crashing the application.
    return "";
  }
}
