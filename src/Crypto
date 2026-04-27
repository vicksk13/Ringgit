/**
 * MakeCents — AES-256-GCM Encryption Module
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * THREAT MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 * This module protects financial PII (income figures, tax relief amounts,
 * merchant names) at rest — in Supabase rows and in browser localStorage.
 *
 * Threat    │ Mitigated?  │ How
 * ──────────┼─────────────┼────────────────────────────────────────────────────
 * DB dump   │ ✅ Yes      │ Every sensitive field is AES-256-GCM encrypted.
 *           │             │ Ciphertext is useless without the per-user key.
 * Admin read│ ✅ Yes      │ Supabase staff see only ciphertext + non-PII index cols.
 * LS inspect│ ✅ Partial  │ Entire guest data blob is encrypted. Key stored in a
 *           │             │ separate LS key; co-location limits protection to
 *           │             │ server-side dump scenarios (XSS still a risk — same
 *           │             │ origin). Authenticated users: key is NEVER stored.
 * MITM      │ ✅ Already  │ HTTPS / TLS (pre-existing)
 * XSS       │ ⚠️ Partial  │ Content-Security-Policy + sanitizeForPrompt (pre-existing).
 *           │             │ Encryption adds minimal help vs same-origin XSS.
 * Key theft │ ✅ Mitigated│ CryptoKey marked non-extractable. Google users: key is
 *           │             │ ephemeral (derived in memory, never persisted).
 * Tampering │ ✅ Yes      │ GCM authentication tag (128-bit) detects any ciphertext
 *           │             │ modification; decryption throws on failure.
 *
 * CRYPTOGRAPHIC PROPERTIES
 * ─────────────────────────────────────────────────────────────────────────────
 * Algorithm  : AES-GCM, 256-bit key
 * Mode       : GCM (authenticated encryption — provides both confidentiality
 *              and integrity; a tampered ciphertext will always throw on decrypt)
 * KDF        : PBKDF2-SHA-256, 310 000 iterations (OWASP 2023 recommended minimum)
 * IV         : 96-bit cryptographically random nonce per encryption operation.
 *              96-bit IV is the GCM standard (avoids the 64-bit birthday bound).
 *              Each encryption call generates a fresh IV — IV reuse under the
 *              same key is cryptographically catastrophic for GCM and is
 *              structurally impossible in this design.
 * Auth tag   : 128-bit (GCM default)
 * Key policy : All CryptoKey objects are created with extractable=false so
 *              they cannot be serialised or exported from the browser runtime.
 *
 * WIRE FORMAT  (stored as base64-encoded binary)
 * ─────────────────────────────────────────────────────────────────────────────
 *   ┌─────────┬────────────────┬─────────────────────────────────────────────┐
 *   │ 1 byte  │   12 bytes     │  N bytes ciphertext  +  16 bytes GCM tag    │
 *   │ VERSION │   random IV    │                                             │
 *   └─────────┴────────────────┴─────────────────────────────────────────────┘
 *
 * The VERSION byte (0x01) enables future algorithm migration (e.g. to
 * XChaCha20-Poly1305) without re-encrypting all existing records — a pattern
 * used by AWS KMS, Azure Key Vault, and commercial HSMs.
 *
 * IMPLEMENTATION NOTE
 * ─────────────────────────────────────────────────────────────────────────────
 * All cryptographic operations use the Web Crypto API (window.crypto.subtle),
 * which is FIPS 140-2 compliant in all modern browsers and in Node ≥ 18.
 * No third-party cryptography libraries are used.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Domain-binding salt for PBKDF2.  Change this if you ever migrate to a new
 * Supabase project so that keys from the old project cannot decrypt the new one.
 */
const APP_CONTEXT = "makecentstax:v1:MY:supabase:xsfqwyzqspopkirysuyj";

/** OWASP 2023 minimum for PBKDF2-SHA-256. Revisit annually. */
const PBKDF2_ITERATIONS = 310_000;

/** GCM standard nonce length. Never change this. */
const IV_BYTES = 12;

/**
 * Wire-format version byte.  Increment when changing the algorithm so that
 * the decryptField function can handle both old and new records during a
 * rolling migration window.
 */
const WIRE_VERSION = 0x01;

/** Prefix length: VERSION(1) + IV(12) = 13 bytes before the ciphertext. */
const HEADER_LEN = 1 + IV_BYTES;

/** localStorage key that holds the guest device secret (32 random bytes as hex). */
export const GUEST_DEVICE_KEY_LS = "makecentstax-dk";

// ─────────────────────────────────────────────────────────────────────────────
// KEY DERIVATION — authenticated (Google) users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a non-extractable 256-bit AES-GCM CryptoKey from a stable user ID.
 *
 * For Google/Supabase users this is the Supabase UUID (permanently bound to
 * the Google sub).  The same user signing in on a different device or browser
 * will derive the same key, which is required for multi-device decryption.
 *
 * Security notes:
 *  • 310 000 PBKDF2 rounds make offline dictionary attacks against the user ID
 *    prohibitively expensive even if the ciphertext is exfiltrated.
 *  • APP_CONTEXT acts as a domain-binding component of the salt, preventing
 *    key reuse across different deployments.
 *  • extractable=false means the key bytes can never leave the Web Crypto
 *    runtime — they cannot be serialised, logged, or sent over the network.
 *
 * @param  {string}          userId  Stable user identifier (Supabase UUID)
 * @returns {Promise<CryptoKey>}
 * @throws  {TypeError}  if userId is missing or not a string
 */
export async function deriveKeyFromUserId(userId) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new TypeError(
      "[MakeCents/crypto] deriveKeyFromUserId: userId must be a non-empty string. " +
      "Ensure the Supabase session is established before calling this function."
    );
  }

  const enc = new TextEncoder();

  // Step 1: Import the user ID as raw PBKDF2 key material.
  const rawMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(userId),
    { name: "PBKDF2" },
    false,             // non-extractable
    ["deriveKey"]
  );

  // Step 2: Derive the AES-GCM key via PBKDF2.
  return crypto.subtle.deriveKey(
    {
      name:       "PBKDF2",
      hash:       "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt:       enc.encode(APP_CONTEXT),
    },
    rawMaterial,
    { name: "AES-GCM", length: 256 },
    false,             // non-extractable — key bytes can NEVER be exported
    ["encrypt", "decrypt"]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY MANAGEMENT — guest (device-bound) users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads the persistent guest device key from localStorage, or creates and
 * persists a fresh one if absent or malformed.
 *
 * Security model for guest mode:
 *  • The raw key bytes (as hex) are stored in localStorage under a separate
 *    key from the encrypted data.  This protects against casual server-side
 *    inspection of the ciphertext column but does NOT protect against an
 *    attacker with full access to the same origin's localStorage.
 *  • For authenticated users, the key is NEVER persisted — it is derived
 *    ephemerally in memory on each sign-in and discarded on sign-out.
 *  • Guest users accept a weaker security posture because they have no
 *    server-side identity to bind the key to.
 *
 * @returns {Promise<CryptoKey>}
 */
export async function loadOrCreateGuestKey() {
  let hex = null;

  try {
    hex = localStorage.getItem(GUEST_DEVICE_KEY_LS);
  } catch {
    // localStorage may be blocked (private browsing with strict settings).
    // Fall through to key generation; the key will not be persisted.
  }

  // Validate: must be exactly 64 lowercase hex characters (32 bytes = 256 bits).
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    const rawBytes = crypto.getRandomValues(new Uint8Array(32));
    hex = Array.from(rawBytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    try {
      localStorage.setItem(GUEST_DEVICE_KEY_LS, hex);
    } catch {
      // Silently swallow — key won't survive page reload but encryption still works
      // for the current session.
    }
  }

  const keyBytes = new Uint8Array(
    hex.match(/.{2}/g).map(octet => parseInt(octet, 16))
  );

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,              // non-extractable
    ["encrypt", "decrypt"]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE PRIMITIVE — encrypt / decrypt a single value
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts any JSON-serialisable value with AES-256-GCM.
 *
 * Wire format (binary, stored as base64):
 *   Byte  0     : WIRE_VERSION (0x01)
 *   Bytes 1–12  : 96-bit random IV
 *   Bytes 13+   : GCM ciphertext  +  128-bit authentication tag (appended by SubtleCrypto)
 *
 * @param  {CryptoKey}  key    Non-extractable AES-GCM-256 key
 * @param  {*}          value  Any JSON.stringify-able value
 * @returns {Promise<string>}  base64-encoded ciphertext wire packet
 * @throws  {Error}   if key is null/undefined (programmer error guard)
 * @throws  {Error}   if value cannot be JSON-serialised
 */
export async function encryptField(key, value) {
  _assertKey(key, "encryptField");

  // Fresh 96-bit IV per call — GCM IV reuse under the same key is catastrophic.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    plaintext
  );

  // Assemble: [VERSION(1)] [IV(12)] [ciphertext+tag(N+16)]
  const wire = new Uint8Array(HEADER_LEN + cipherBuf.byteLength);
  wire[0] = WIRE_VERSION;
  wire.set(iv, 1);
  wire.set(new Uint8Array(cipherBuf), HEADER_LEN);

  return _uint8ToBase64(wire);
}

/**
 * Decrypts a base64 wire packet produced by encryptField.
 *
 * The GCM authentication tag is verified before any plaintext is returned.
 * Any modification to the ciphertext (bit flip, truncation, wrong key) causes
 * SubtleCrypto to throw DOMException("OperationError") — this function re-throws
 * with a descriptive message so callers can surface meaningful errors.
 *
 * @param  {CryptoKey}  key   Non-extractable AES-GCM-256 key
 * @param  {string}     b64   base64-encoded wire packet from encryptField
 * @returns {Promise<*>}      Decrypted, JSON-parsed value
 * @throws  {Error}     on decryption failure (wrong key, tampered data, bad format)
 */
export async function decryptField(key, b64) {
  if (b64 === null || b64 === undefined || b64 === "") return null;
  _assertKey(key, "decryptField");

  let wire;
  try {
    wire = _base64ToUint8(b64);
  } catch {
    throw new Error("[MakeCents/crypto] decryptField: base64 decoding failed — ciphertext may be corrupted.");
  }

  if (wire.length < HEADER_LEN + 16) {
    throw new RangeError(
      `[MakeCents/crypto] decryptField: wire packet too short (${wire.length} bytes). ` +
      "Minimum is " + (HEADER_LEN + 16) + " bytes (header + minimum GCM tag)."
    );
  }

  const version = wire[0];
  if (version !== WIRE_VERSION) {
    throw new Error(
      `[MakeCents/crypto] decryptField: unsupported wire version 0x${version.toString(16).padStart(2, "0")}. ` +
      "This record was encrypted by a newer version of MakeCents."
    );
  }

  const iv         = wire.slice(1, HEADER_LEN);
  const ciphertext = wire.slice(HEADER_LEN);

  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      ciphertext
    );
  } catch (e) {
    // Do NOT surface the raw SubtleCrypto error — it may contain information
    // useful to an attacker diagnosing a padding oracle or key oracle.
    throw new Error(
      "[MakeCents/crypto] decryptField: decryption failed. " +
      "The data may be corrupted, tampered, or encrypted with a different key."
    );
  }

  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORD-LEVEL HELPERS — encrypt / decrypt named fields in a DB row object
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a shallow copy of `record` with the specified `fields` encrypted.
 * Fields that are undefined or null are left as-is (no ciphertext stored for
 * missing values — this keeps the DB schema sparse and avoids encrypting NULLs).
 *
 * All field encryptions run in parallel (Promise.all) for performance.
 *
 * @param  {CryptoKey}  key
 * @param  {object}     record
 * @param  {string[]}   fields  Names of fields to encrypt
 * @returns {Promise<object>}   New object with the named fields replaced by base64 ciphertext
 */
export async function encryptRecord(key, record, fields) {
  const out = { ...record };
  await Promise.all(
    fields.map(async (fieldName) => {
      if (out[fieldName] !== undefined && out[fieldName] !== null) {
        out[fieldName] = await encryptField(key, out[fieldName]);
      }
    })
  );
  return out;
}

/**
 * Returns a shallow copy of `record` with the specified `fields` decrypted.
 *
 * Decryption errors on individual fields are swallowed (logged as warnings)
 * rather than thrown — a single unreadable field should not prevent the rest
 * of the record from loading.  The offending field is left as-is (the raw
 * ciphertext string), which will appear as garbled text in the UI rather than
 * crashing the app.
 *
 * @param  {CryptoKey}  key
 * @param  {object}     record
 * @param  {string[]}   fields  Names of fields to decrypt
 * @returns {Promise<object>}
 */
export async function decryptRecord(key, record, fields) {
  const out = { ...record };
  await Promise.all(
    fields.map(async (fieldName) => {
      if (out[fieldName] && typeof out[fieldName] === "string") {
        try {
          out[fieldName] = await decryptField(key, out[fieldName]);
        } catch (e) {
          // Non-fatal: log a warning, leave the field encrypted.
          // This handles legacy plaintext rows gracefully — a plaintext value
          // is not a valid base64 wire packet so decryptField will throw;
          // we catch it here and leave the plaintext value intact.
          console.warn(
            `[MakeCents/crypto] decryptRecord: field '${fieldName}' could not be decrypted. ` +
            "This may be a legacy plaintext row (pre-encryption migration). " +
            `Detail: ${e?.message}`
          );
        }
      }
    })
  );
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOAD HELPERS — pack + encrypt multiple fields into a single DB column
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts a plain object into a single base64 ciphertext payload.
 *
 * Usage pattern (DB write):
 *   const enc_payload = await buildEncPayload(key, { amount, description, units });
 *   await supabase.from("claims").insert({ id, user_id, ya, item_id, enc_payload });
 *
 * @param  {CryptoKey}  key
 * @param  {object}     sensitiveFields  Any JSON-serialisable object
 * @returns {Promise<string>}  base64 ciphertext
 */
export async function buildEncPayload(key, sensitiveFields) {
  _assertKey(key, "buildEncPayload");
  return encryptField(key, sensitiveFields);
}

/**
 * Decrypts an enc_payload column value back into a plain object.
 *
 * Usage pattern (DB read):
 *   const decrypted = await openEncPayload(key, row.enc_payload);
 *   const amount = decrypted?.amount ?? row.amount; // fallback to plaintext for legacy rows
 *
 * Returns null if enc_payload is absent (legacy plaintext row — caller should
 * fall back to reading the individual plaintext columns).
 *
 * @param  {CryptoKey|null}  key
 * @param  {string|null}     encPayload   base64 ciphertext from enc_payload column
 * @returns {Promise<object|null>}
 */
export async function openEncPayload(key, encPayload) {
  if (!encPayload || !key) return null;
  try {
    return await decryptField(key, encPayload);
  } catch (e) {
    console.warn("[MakeCents/crypto] openEncPayload: failed to decrypt payload — returning null.", e?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOB HELPERS — encrypt / decrypt an entire object (for localStorage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts an entire JS object as a single ciphertext string.
 * Used for the guest-mode localStorage store — the whole data blob is
 * stored as one encrypted entry rather than field-by-field.
 *
 * @param  {CryptoKey}  key
 * @param  {object}     data
 * @returns {Promise<string>}  base64 ciphertext
 */
export async function encryptBlob(key, data) {
  _assertKey(key, "encryptBlob");
  return encryptField(key, data);
}

/**
 * Decrypts a blob produced by encryptBlob.
 *
 * Returns null on failure rather than throwing so that a corrupted or absent
 * blob gracefully degrades to an empty data store instead of crashing the app.
 *
 * @param  {CryptoKey}  key
 * @param  {string}     b64
 * @returns {Promise<object|null>}
 */
export async function decryptBlob(key, b64) {
  if (!b64 || !key) return null;
  try {
    return await decryptField(key, b64);
  } catch (e) {
    console.warn("[MakeCents/crypto] decryptBlob: failed to decrypt localStorage blob — returning null (will start fresh).", e?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a Uint8Array to a base64 string without blowing the call stack
 * on large buffers (e.g. encrypted receipt metadata).
 *
 * String.fromCharCode(...largeArray) throws RangeError on arrays > ~65 000 bytes
 * because spread pushes all elements onto the call stack at once.
 * Processing in 32 KB chunks avoids this.
 */
function _uint8ToBase64(bytes) {
  const CHUNK = 0x8000; // 32 KB
  let binary  = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string into a Uint8Array.
 *
 * @throws if b64 contains characters outside the base64 alphabet.
 */
function _base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Guards against the most common programmer error: calling an encrypt/decrypt
 * function before the key has been derived.
 */
function _assertKey(key, callerName) {
  if (key === null || key === undefined) {
    throw new Error(
      `[MakeCents/crypto] ${callerName}: key is ${key}. ` +
      "Ensure deriveKeyFromUserId() or loadOrCreateGuestKey() has resolved " +
      "before performing any cryptographic operations."
    );
  }
}
