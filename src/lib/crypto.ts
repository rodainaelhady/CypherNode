/**
 * CypherNode Cryptography Utilities
 * Uses the Web Crypto API for secure, client-side encryption.
 * Implements RSA-OAEP 2048-bit key exchange + AES-GCM 256-bit file encryption.
 */

// --- Custom Error ---
export class CryptoError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "KEY_GEN_FAILED"
      | "KEY_EXPORT_FAILED"
      | "KEY_IMPORT_FAILED"
      | "ENCRYPT_FAILED"
      | "DECRYPT_FAILED"
      | "INVALID_KEY"
      | "INVALID_DATA",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "CryptoError";
  }
}

// --- Constants ---
const RSA_ALGO = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_ALGO = {
  name: "AES-GCM",
  length: 256,
};

const AES_GCM_IV_LENGTH = 12; // Standard GCM IV size

// --- Memory Cleanup ---

/**
 * Overwrites an ArrayBuffer with zeros to clear sensitive data from memory.
 */
export function zeroArrayBuffer(buffer: ArrayBuffer): void {
  const view = new Uint8Array(buffer);
  crypto.getRandomValues(view); // overwrite with random, then zero
  view.fill(0);
}

/**
 * Attempts to clear a CryptoKey by zeroing its extracted raw bytes.
 * Note: Web Crypto API does not expose a direct key destruction method.
 * The best we can do is zero any extracted raw material.
 */
export async function clearKey(key: CryptoKey): Promise<void> {
  try {
    if (key.extractable && key.type === "secret") {
      const raw = await window.crypto.subtle.exportKey("raw", key);
      zeroArrayBuffer(raw);
    }
  } catch {
    // Key may not be extractable — nothing to clear
  }
}

// --- RSA Helpers ---

/**
 * Generates an RSA-OAEP 2048-bit key pair for secure key exchange.
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  try {
    return await window.crypto.subtle.generateKey(
      RSA_ALGO,
      true, // extractable
      ["encrypt", "decrypt"]
    );
  } catch (err) {
    throw new CryptoError(
      "RSA key pair generation failed.",
      "KEY_GEN_FAILED",
      err
    );
  }
}

/**
 * Exports a public key in JWK format for JSON transmission.
 */
export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  try {
    return await window.crypto.subtle.exportKey("jwk", key);
  } catch (err) {
    throw new CryptoError(
      "Public key export failed.",
      "KEY_EXPORT_FAILED",
      err
    );
  }
}

/**
 * Imports a public key from JWK format.
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  try {
    return await window.crypto.subtle.importKey("jwk", jwk, RSA_ALGO, true, [
      "encrypt",
    ]);
  } catch (err) {
    throw new CryptoError(
      "Public key import failed. Invalid JWK.",
      "KEY_IMPORT_FAILED",
      err
    );
  }
}

// --- AES Helpers ---

/**
 * Generates a random AES-GCM 256-bit session key.
 */
export async function generateSessionKey(): Promise<CryptoKey> {
  try {
    return await window.crypto.subtle.generateKey(AES_ALGO, true, [
      "encrypt",
      "decrypt",
    ]);
  } catch (err) {
    throw new CryptoError(
      "AES session key generation failed.",
      "KEY_GEN_FAILED",
      err
    );
  }
}

/**
 * Encrypts the AES session key using the receiver's RSA public key.
 * Returns base64-encoded ciphertext.
 */
export async function encryptSessionKey(
  sessionKey: CryptoKey,
  publicKey: CryptoKey
): Promise<string> {
  try {
    const exportedRaw = await window.crypto.subtle.exportKey("raw", sessionKey);
    const encrypted = await window.crypto.subtle.encrypt(
      RSA_ALGO,
      publicKey,
      exportedRaw
    );

    // Zero the exported raw key material immediately
    zeroArrayBuffer(exportedRaw);

    return arrayBufferToBase64(encrypted);
  } catch (err) {
    throw new CryptoError(
      "Session key encryption failed.",
      "ENCRYPT_FAILED",
      err
    );
  }
}

/**
 * Decrypts the AES session key using the receiver's RSA private key.
 * Returns the imported AES-GCM CryptoKey.
 */
export async function decryptSessionKey(
  encryptedKeyBase64: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  try {
    const encrypted = base64ToArrayBuffer(encryptedKeyBase64);
    const decryptedRaw = await window.crypto.subtle.decrypt(
      RSA_ALGO,
      privateKey,
      encrypted
    );

    const importedKey = await window.crypto.subtle.importKey(
      "raw",
      decryptedRaw,
      AES_ALGO,
      true,
      ["encrypt", "decrypt"]
    );

    // Zero the decrypted raw key material immediately
    zeroArrayBuffer(decryptedRaw);

    return importedKey;
  } catch (err) {
    throw new CryptoError(
      "Session key decryption failed. Key mismatch?",
      "DECRYPT_FAILED",
      err
    );
  }
}

// --- File Encryption ---

/**
 * Encrypts file data using AES-GCM.
 * Generates a random 12-byte IV, prepends it to the ciphertext,
 * and returns the combined result as base64.
 */
export async function encryptFile(
  data: ArrayBuffer,
  sessionKey: CryptoKey
): Promise<string> {
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sessionKey,
      data
    );

    // Combine: [IV (12 bytes)][Ciphertext]
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Zero the plaintext data from memory
    zeroArrayBuffer(data);

    return arrayBufferToBase64(combined.buffer);
  } catch (err) {
    throw new CryptoError("File encryption failed.", "ENCRYPT_FAILED", err);
  }
}

/**
 * Decrypts file data using AES-GCM.
 * Expects the combined format: [IV (12 bytes)][Ciphertext] as base64.
 */
export async function decryptFile(
  combinedBase64: string,
  sessionKey: CryptoKey
): Promise<ArrayBuffer> {
  try {
    const combined = new Uint8Array(base64ToArrayBuffer(combinedBase64));
    const iv = combined.slice(0, AES_GCM_IV_LENGTH);
    const data = combined.slice(AES_GCM_IV_LENGTH);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      sessionKey,
      data
    );

    return decrypted;
  } catch (err) {
    throw new CryptoError(
      "File decryption failed. Data may be corrupted.",
      "DECRYPT_FAILED",
      err
    );
  }
}

// --- Utility Helpers ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
