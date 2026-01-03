/**
 * Keystore - Encrypted Key Storage
 *
 * Manages secure storage and retrieval of cryptographic keys using
 * password-based encryption with PBKDF2 + AES-GCM.
 */

import {
  encryptWithPassword,
  decryptWithPassword,
  type Ed25519KeyPair,
} from './index';

/** Key pair alias for compatibility */
type KeyPair = Ed25519KeyPair;

// =============================================================================
// Types
// =============================================================================

/** Stored key data structure */
export interface StoredKeyData {
  /** Version for future format changes */
  version: number;
  /** Encrypted private key data */
  encryptedPrivateKey: string;
  /** Salt used for key derivation */
  salt: string;
  /** Nonce used for encryption */
  nonce: string;
  /** Public key (not encrypted) */
  publicKey: string;
  /** Timestamp when keys were created */
  createdAt: number;
}

/** FROST key share storage */
export interface StoredFrostShare {
  /** Group identifier (group public key) */
  groupId: string;
  /** This participant's ID */
  participantId: number;
  /** Encrypted secret share */
  encryptedSecretShare: string;
  /** Salt for decryption */
  salt: string;
  /** Nonce for decryption */
  nonce: string;
  /** Public key share (not encrypted) */
  publicKeyShare: string;
  /** Group public key */
  groupPublicKey: string;
  /** Public key package (JSON) - needed for coordinator to aggregate */
  publicKeyPackage?: string;
  /** Threshold required */
  threshold: number;
  /** Total participants */
  totalParticipants: number;
  /** Human-readable name */
  name: string;
  /** Timestamp when stored */
  createdAt: number;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY_AUTH = 'frost_auth_keys';
const STORAGE_KEY_FROST_SHARES = 'frost_key_shares';
const CURRENT_VERSION = 1;

// =============================================================================
// Auth Key Storage
// =============================================================================

/**
 * Save authentication keys encrypted with a password.
 */
export async function saveAuthKeys(
  keys: KeyPair,
  password: string
): Promise<void> {
  // Encrypt the private key
  const encrypted = await encryptWithPassword(keys.privateKey, password);

  const storedData: StoredKeyData = {
    version: CURRENT_VERSION,
    encryptedPrivateKey: encrypted.ciphertext,
    salt: encrypted.salt,
    nonce: encrypted.nonce,
    publicKey: keys.publicKey,
    createdAt: Date.now(),
  };

  // Store in localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(storedData));
  }
}

/**
 * Load and decrypt authentication keys.
 */
export async function loadAuthKeys(password: string): Promise<KeyPair> {
  if (typeof window === 'undefined') {
    throw new Error('localStorage is not available');
  }

  const stored = localStorage.getItem(STORAGE_KEY_AUTH);
  if (!stored) {
    throw new Error('No stored keys found');
  }

  const storedData: StoredKeyData = JSON.parse(stored);

  // Decrypt the private key
  const privateKey = await decryptWithPassword(
    storedData.encryptedPrivateKey,
    storedData.salt,
    storedData.nonce,
    password
  );

  return {
    publicKey: storedData.publicKey,
    privateKey,
  };
}

/**
 * Check if auth keys exist in storage.
 */
export function hasStoredAuthKeys(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return localStorage.getItem(STORAGE_KEY_AUTH) !== null;
}

/**
 * Get the stored public key without decryption.
 */
export function getStoredPublicKey(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = localStorage.getItem(STORAGE_KEY_AUTH);
  if (!stored) {
    return null;
  }

  try {
    const storedData: StoredKeyData = JSON.parse(stored);
    return storedData.publicKey;
  } catch {
    return null;
  }
}

/**
 * Clear stored auth keys.
 */
export function clearStoredAuthKeys(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_AUTH);
  }
}

// =============================================================================
// FROST Key Share Storage
// =============================================================================

/**
 * Save a FROST key share encrypted with a password.
 */
export async function saveFrostShare(
  share: {
    groupId: string;
    participantId: number;
    secretShare: string;
    publicKeyShare: string;
    groupPublicKey: string;
    publicKeyPackage?: string;
    threshold: number;
    totalParticipants: number;
    name: string;
  },
  password: string
): Promise<void> {
  // Encrypt the secret share
  const encrypted = await encryptWithPassword(share.secretShare, password);

  const storedShare: StoredFrostShare = {
    groupId: share.groupId,
    participantId: share.participantId,
    encryptedSecretShare: encrypted.ciphertext,
    salt: encrypted.salt,
    nonce: encrypted.nonce,
    publicKeyShare: share.publicKeyShare,
    groupPublicKey: share.groupPublicKey,
    publicKeyPackage: share.publicKeyPackage,
    threshold: share.threshold,
    totalParticipants: share.totalParticipants,
    name: share.name,
    createdAt: Date.now(),
  };

  // Get existing shares
  const shares = getStoredFrostSharesList();

  // Add or update
  const existingIndex = shares.findIndex((s) => s.groupId === share.groupId);
  if (existingIndex >= 0) {
    shares[existingIndex] = storedShare;
  } else {
    shares.push(storedShare);
  }

  // Save back
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_FROST_SHARES, JSON.stringify(shares));
  }
}

/**
 * Load and decrypt a FROST key share.
 */
export async function loadFrostShare(
  groupId: string,
  password: string
): Promise<{
  participantId: number;
  secretShare: string;
  publicKeyShare: string;
  groupPublicKey: string;
  publicKeyPackage?: string;
  threshold: number;
  totalParticipants: number;
  name: string;
}> {
  const shares = getStoredFrostSharesList();
  const share = shares.find((s) => s.groupId === groupId);

  if (!share) {
    throw new Error('Key share not found');
  }

  // Decrypt the secret share
  const secretShare = await decryptWithPassword(
    share.encryptedSecretShare,
    share.salt,
    share.nonce,
    password
  );

  return {
    participantId: share.participantId,
    secretShare,
    publicKeyShare: share.publicKeyShare,
    groupPublicKey: share.groupPublicKey,
    publicKeyPackage: share.publicKeyPackage,
    threshold: share.threshold,
    totalParticipants: share.totalParticipants,
    name: share.name,
  };
}

/**
 * Get list of stored FROST shares (without decryption).
 */
export function getStoredFrostSharesList(): StoredFrostShare[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const stored = localStorage.getItem(STORAGE_KEY_FROST_SHARES);
  if (!stored) {
    return [];
  }

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get info about stored FROST shares (for display).
 */
export function getStoredFrostSharesInfo(): Array<{
  groupId: string;
  name: string;
  participantId: number;
  threshold: number;
  totalParticipants: number;
  groupPublicKey: string;
  publicKeyPackage?: string;
  createdAt: number;
}> {
  return getStoredFrostSharesList().map((share) => ({
    groupId: share.groupId,
    name: share.name,
    participantId: share.participantId,
    threshold: share.threshold,
    totalParticipants: share.totalParticipants,
    groupPublicKey: share.groupPublicKey,
    publicKeyPackage: share.publicKeyPackage,
    createdAt: share.createdAt,
  }));
}

/**
 * Delete a FROST key share.
 */
export function deleteFrostShare(groupId: string): void {
  const shares = getStoredFrostSharesList().filter((s) => s.groupId !== groupId);

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_FROST_SHARES, JSON.stringify(shares));
  }
}

/**
 * Clear all stored FROST shares.
 */
export function clearAllFrostShares(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_FROST_SHARES);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Clear all stored keys (auth and FROST shares).
 */
export function clearAllStoredKeys(): void {
  clearStoredAuthKeys();
  clearAllFrostShares();
}

/**
 * Verify a password by attempting to decrypt stored keys.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    await loadAuthKeys(password);
    return true;
  } catch {
    return false;
  }
}

/**
 * Change the password for stored keys.
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  // Load auth keys with old password
  const authKeys = await loadAuthKeys(oldPassword);

  // Save with new password
  await saveAuthKeys(authKeys, newPassword);

  // Re-encrypt all FROST shares
  const shares = getStoredFrostSharesList();
  for (const share of shares) {
    // Decrypt with old password
    const decrypted = await loadFrostShare(share.groupId, oldPassword);

    // Save with new password (preserve publicKeyPackage)
    await saveFrostShare(
      {
        groupId: share.groupId,
        participantId: decrypted.participantId,
        secretShare: decrypted.secretShare,
        publicKeyShare: decrypted.publicKeyShare,
        groupPublicKey: decrypted.groupPublicKey,
        publicKeyPackage: decrypted.publicKeyPackage,
        threshold: decrypted.threshold,
        totalParticipants: decrypted.totalParticipants,
        name: decrypted.name,
      },
      newPassword
    );
  }
}

/**
 * Export all data as encrypted backup.
 */
export async function exportBackup(password: string): Promise<string> {
  // Load and verify password
  const authKeys = await loadAuthKeys(password);

  const backup = {
    version: CURRENT_VERSION,
    timestamp: Date.now(),
    authKeys: {
      publicKey: authKeys.publicKey,
      privateKey: authKeys.privateKey,
    },
    frostShares: [] as Array<{
      groupId: string;
      participantId: number;
      secretShare: string;
      publicKeyShare: string;
      groupPublicKey: string;
      threshold: number;
      totalParticipants: number;
      name: string;
    }>,
  };

  // Load all FROST shares
  const shares = getStoredFrostSharesList();
  for (const share of shares) {
    const decrypted = await loadFrostShare(share.groupId, password);
    backup.frostShares.push({
      groupId: share.groupId,
      ...decrypted,
    });
  }

  // Encrypt the entire backup
  const encrypted = await encryptWithPassword(JSON.stringify(backup), password);

  return JSON.stringify({
    type: 'frost-backup',
    version: CURRENT_VERSION,
    ...encrypted,
  });
}

/**
 * Import data from encrypted backup.
 */
export async function importBackup(
  backupJson: string,
  password: string
): Promise<void> {
  const backupData = JSON.parse(backupJson);

  if (backupData.type !== 'frost-backup') {
    throw new Error('Invalid backup format');
  }

  // Decrypt the backup
  const decrypted = await decryptWithPassword(
    backupData.ciphertext,
    backupData.salt,
    backupData.nonce,
    password
  );

  const backup = JSON.parse(decrypted);

  // Save auth keys
  await saveAuthKeys(backup.authKeys, password);

  // Save FROST shares
  for (const share of backup.frostShares) {
    await saveFrostShare(share, password);
  }
}
