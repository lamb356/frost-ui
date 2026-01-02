#!/usr/bin/env npx tsx
/**
 * FROST Zcash (RedPallas) Live Signing Ceremony Test
 *
 * Tests a complete 2-of-3 threshold signing ceremony against a running frostd server
 * using the RedPallas curve for Zcash Orchard compatibility.
 *
 * This proves the complete stack works:
 * - frostd auth (XEdDSA) ✓
 * - E2E encryption (X25519 + AES-GCM) ✓
 * - Message relay ✓
 * - Zcash/Orchard FROST with rerandomization ✓
 *
 * Usage:
 *   npx tsx scripts/test-zcash-ceremony-live.ts [server-url]
 *
 * Default server: https://localhost:2745
 */

// Disable TLS certificate validation for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// =============================================================================
// Utility Functions
// =============================================================================

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: expected 32 hex chars, got ${hex.length}`);
  }
  return hexToBytes(hex);
}

function generateUUID(): string {
  return crypto.randomUUID();
}

function parseResult<T>(json: string): T {
  const result = JSON.parse(json);
  if (result.code && result.message) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result as T;
}

// =============================================================================
// E2E Encryption (X25519 + AES-GCM)
// =============================================================================

interface EncryptedMessage {
  ephemeralPubkey: string;
  nonce: string;
  ciphertext: string;
}

async function encryptMessage(
  _senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array
): Promise<EncryptedMessage> {
  const ephemeralPrivate = crypto.randomBytes(32);
  const ephemeralKeyPair = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b656e04220420', 'hex'),
      ephemeralPrivate,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  const ephemeralPublic = crypto.createPublicKey(ephemeralKeyPair);
  const ephemeralPubBytes = ephemeralPublic.export({ type: 'spki', format: 'der' }).slice(-32);

  const recipientKey = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b656e032100', 'hex'),
      Buffer.from(recipientPublicKey),
    ]),
    format: 'der',
    type: 'spki',
  });

  const sharedSecret = crypto.diffieHellman({
    privateKey: ephemeralKeyPair,
    publicKey: recipientKey,
  });

  const aesKey = crypto.hkdfSync('sha256', sharedSecret, '', 'frost-e2e', 32);

  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(aesKey), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  return {
    ephemeralPubkey: bytesToHex(ephemeralPubBytes),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
  };
}

async function decryptMessage(
  recipientPrivateKey: Uint8Array,
  encrypted: EncryptedMessage
): Promise<Uint8Array> {
  const ephemeralPubBytes = hexToBytes(encrypted.ephemeralPubkey);
  const nonce = hexToBytes(encrypted.nonce);
  const ciphertext = hexToBytes(encrypted.ciphertext);

  const recipientKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b656e04220420', 'hex'),
      Buffer.from(recipientPrivateKey),
    ]),
    format: 'der',
    type: 'pkcs8',
  });

  const ephemeralPub = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b656e032100', 'hex'),
      Buffer.from(ephemeralPubBytes),
    ]),
    format: 'der',
    type: 'spki',
  });

  const sharedSecret = crypto.diffieHellman({
    privateKey: recipientKey,
    publicKey: ephemeralPub,
  });

  const aesKey = crypto.hkdfSync('sha256', sharedSecret, '', 'frost-e2e', 32);

  const authTag = ciphertext.slice(-16);
  const encryptedData = ciphertext.slice(0, -16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(aesKey), nonce);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

  return new Uint8Array(plaintext);
}

// =============================================================================
// Protocol Message Types
// =============================================================================

interface MessageEnvelope {
  v: number;
  sid: string;
  id: string;
  t: string;
  from: string;
  ts: number;
  payload: unknown;
}

function createEnvelope(
  sessionId: string,
  type: string,
  fromPubkey: string,
  payload: unknown
): MessageEnvelope {
  return {
    v: 1,
    sid: sessionId,
    id: generateUUID(),
    t: type,
    from: fromPubkey,
    ts: Date.now(),
    payload,
  };
}

// =============================================================================
// Zcash FROST Types
// =============================================================================

interface KeyShareInfo {
  identifier: number;
  key_package: string;
}

interface KeyGenResult {
  group_public_key: string;
  shares: KeyShareInfo[];
  threshold: number;
  total: number;
  public_key_package: string;
}

interface CommitmentInfo {
  identifier: number;
  commitment: string;
}

interface NoncesInfo {
  identifier: number;
  nonces: string;
}

interface Round1Result {
  commitment: CommitmentInfo;
  nonces: NoncesInfo;
}

interface SigningPackageResult {
  signing_package: string;
  randomizer: string;
}

interface SignatureShareInfo {
  identifier: number;
  share: string;
}

interface AggregateResult {
  signature: string;
  randomizer: string;
}

interface VerifyResult {
  valid: boolean;
}

// =============================================================================
// Main Test
// =============================================================================

async function main() {
  const SERVER_URL = process.argv[2] || 'https://localhost:2745';

  console.log('');
  console.log('='.repeat(70));
  console.log('  FROST Zcash (RedPallas) Live Signing Ceremony Test');
  console.log('='.repeat(70));
  console.log(`  Server: ${SERVER_URL}`);
  console.log(`  Curve: RedPallas (Pallas with BLAKE2b-512)`);
  console.log(`  Backend: orchard-redpallas`);
  console.log(`  Threshold: 2-of-3`);
  console.log(`  Feature: Rerandomized signing (ZIP-312)`);
  console.log('='.repeat(70));
  console.log('');

  // Load WASM modules
  console.log('Loading WASM modules...');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // Load xeddsa-wasm for authentication
  const xeddsaModule = await import('../src/lib/xeddsa-wasm/pkg/xeddsa_wasm.js');
  const xeddsaWasmPath = path.join(__dirname, '../src/lib/xeddsa-wasm/pkg/xeddsa_wasm_bg.wasm');
  const xeddsaWasmBytes = fs.readFileSync(xeddsaWasmPath);
  await xeddsaModule.default(xeddsaWasmBytes);
  const xeddsa = xeddsaModule;

  // Load frost-zcash-wasm for Orchard/RedPallas
  const frostZcashModule = await import('../src/lib/frost-zcash-wasm/pkg/frost_zcash_wasm.js');
  const zcashWasmPath = path.join(__dirname, '../src/lib/frost-zcash-wasm/pkg/frost_zcash_wasm_bg.wasm');

  if (!fs.existsSync(zcashWasmPath)) {
    console.error('');
    console.error('[ERROR] frost-zcash-wasm not built!');
    console.error('');
    console.error('Please build the WASM module first:');
    console.error('  cd src/lib/frost-zcash-wasm');
    console.error('  wasm-pack build --target web');
    console.error('');
    process.exit(1);
  }

  const zcashWasmBytes = fs.readFileSync(zcashWasmPath);
  await frostZcashModule.default(zcashWasmBytes);
  frostZcashModule.init();
  const frost = frostZcashModule;
  console.log('WASM modules loaded!\n');

  // Test state
  let passed = 0;
  let failed = 0;

  function pass(step: string, details?: string) {
    passed++;
    console.log(`  [PASS] ${step}`);
    if (details) console.log(`         ${details}`);
  }

  function fail(step: string, error: string) {
    failed++;
    console.log(`  [FAIL] ${step}`);
    console.log(`         Error: ${error}`);
  }

  function log(msg: string) {
    console.log(`         ${msg}`);
  }

  // ==========================================================================
  // STEP 1: Generate Auth Keypairs for 3 Participants
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 1: Generate Auth Keypairs (XEdDSA)');
  console.log('─'.repeat(70));

  const participants: Array<{
    name: string;
    publicKey: string;
    privateKey: string;
    accessToken?: string;
  }> = [];

  for (let i = 0; i < 3; i++) {
    const name = i === 0 ? 'Coordinator' : `Participant ${i}`;
    const keypair = xeddsa.generate_keypair();
    participants.push({
      name,
      publicKey: bytesToHex(new Uint8Array(keypair.public_key)),
      privateKey: bytesToHex(new Uint8Array(keypair.private_key)),
    });
    pass(`Generated keypair for ${name}`, `pubkey: ${participants[i].publicKey.slice(0, 16)}...`);
  }

  // Helper to make requests
  async function request(
    method: string,
    endpoint: string,
    body?: object,
    accessToken?: string
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${SERVER_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: unknown;
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    return { ok: response.ok, status: response.status, data };
  }

  // ==========================================================================
  // STEP 2: Authenticate All Participants with frostd
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 2: Authenticate All Participants');
  console.log('─'.repeat(70));

  for (const p of participants) {
    const challengeRes = await request('POST', '/challenge');
    if (!challengeRes.ok) {
      fail(`${p.name}: Get challenge`, JSON.stringify(challengeRes.data));
      continue;
    }
    const challenge = (challengeRes.data as { challenge: string }).challenge;

    // Sign challenge with XEdDSA (binary UUID)
    const privateKey = hexToBytes(p.privateKey);
    const messageBytes = uuidToBytes(challenge);
    const signature = bytesToHex(new Uint8Array(xeddsa.sign(privateKey, messageBytes)));

    const loginRes = await request('POST', '/login', {
      challenge,
      pubkey: p.publicKey,
      signature,
    });

    if (!loginRes.ok) {
      fail(`${p.name}: Login`, JSON.stringify(loginRes.data));
      continue;
    }

    p.accessToken = (loginRes.data as { access_token: string }).access_token;
    pass(`${p.name}: Authenticated`, `token: ${p.accessToken!.slice(0, 20)}...`);
  }

  if (participants.some((p) => !p.accessToken)) {
    console.log('\n[FATAL] Not all participants authenticated. Aborting.');
    process.exit(1);
  }

  // ==========================================================================
  // STEP 3: Generate FROST Key Shares (2-of-3) using RedPallas
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 3: Generate FROST Key Shares (Trusted Dealer, RedPallas)');
  console.log('─'.repeat(70));

  let keygen: KeyGenResult;
  try {
    keygen = parseResult<KeyGenResult>(frost.generate_key_shares(2, 3));
    pass('Generated 2-of-3 RedPallas key shares');
    log(`Group public key: ${keygen.group_public_key.slice(0, 32)}...`);
    log(`Threshold: ${keygen.threshold}, Total: ${keygen.total}`);
    log(`Shares: ${keygen.shares.map((s) => s.identifier).join(', ')}`);
  } catch (e) {
    fail('Generate key shares', String(e));
    process.exit(1);
  }

  // Assign key packages to participants
  const participantKeyPackages: Record<string, string> = {};
  const participantIdentifiers: Record<string, number> = {};
  participants.forEach((p, i) => {
    const share = keygen.shares[i];
    participantKeyPackages[p.publicKey] = share.key_package;
    participantIdentifiers[p.publicKey] = share.identifier;
    log(`Assigned key package ${share.identifier} to ${p.name}`);
  });

  // ==========================================================================
  // STEP 4: Coordinator Creates Session
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 4: Coordinator Creates Session');
  console.log('─'.repeat(70));

  const coordinator = participants[0];
  const signers = [participants[1], participants[2]];

  const createRes = await request(
    'POST',
    '/create_new_session',
    {
      pubkeys: participants.map((p) => p.publicKey),
      message_count: 1,
    },
    coordinator.accessToken
  );

  if (!createRes.ok) {
    fail('Create session', JSON.stringify(createRes.data));
    process.exit(1);
  }

  const sessionId = (createRes.data as { session_id: string }).session_id;
  pass('Created session', `session_id: ${sessionId}`);

  // ==========================================================================
  // STEP 5: Coordinator Broadcasts SIGNING_PACKAGE (with backendId)
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 5: Coordinator Broadcasts SIGNING_PACKAGE');
  console.log('─'.repeat(70));

  // Message to sign (Zcash transaction sighash simulation)
  const messageToSign = bytesToHex(
    crypto.createHash('sha256').update('Zcash Orchard Test Transaction').digest()
  );
  const messageId = generateUUID();

  log(`Message hash: ${messageToSign.slice(0, 32)}...`);

  const signingPackageEnvelope = createEnvelope(sessionId, 'SIGNING_PACKAGE', coordinator.publicKey, {
    backendId: 'orchard-redpallas', // Important: specifies which FROST backend to use
    message_id: messageId,
    message_to_sign: messageToSign,
    selected_signers: signers.map((s) => s.publicKey),
    signer_ids: signers.map((s) => participantIdentifiers[s.publicKey]),
  });

  for (const signer of signers) {
    const plaintext = new TextEncoder().encode(JSON.stringify(signingPackageEnvelope));
    const encrypted = await encryptMessage(
      hexToBytes(coordinator.privateKey),
      hexToBytes(signer.publicKey),
      plaintext
    );

    const sendRes = await request(
      'POST',
      '/send',
      {
        session_id: sessionId,
        recipients: [signer.publicKey],
        msg: bytesToHex(new TextEncoder().encode(JSON.stringify(encrypted))),
      },
      coordinator.accessToken
    );

    if (!sendRes.ok) {
      fail(`Send SIGNING_PACKAGE to ${signer.name}`, JSON.stringify(sendRes.data));
    } else {
      pass(`Sent SIGNING_PACKAGE to ${signer.name}`, `backendId: orchard-redpallas`);
    }
  }

  await new Promise((r) => setTimeout(r, 100));

  // ==========================================================================
  // STEP 6: Participants Receive and Validate SIGNING_PACKAGE
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 6: Participants Receive and Validate SIGNING_PACKAGE');
  console.log('─'.repeat(70));

  const receivedPackages: Map<string, { message: string; backendId: string }> = new Map();

  for (const signer of signers) {
    const receiveRes = await request(
      'POST',
      '/receive',
      { session_id: sessionId, as_coordinator: false },
      signer.accessToken
    );

    if (!receiveRes.ok) {
      fail(`${signer.name}: Receive messages`, JSON.stringify(receiveRes.data));
      continue;
    }

    const msgs = (receiveRes.data as { msgs: Array<{ sender: string; msg: string }> }).msgs;
    if (msgs.length === 0) {
      fail(`${signer.name}: No messages received`);
      continue;
    }

    try {
      const encryptedStr = new TextDecoder().decode(hexToBytes(msgs[0].msg));
      const encrypted: EncryptedMessage = JSON.parse(encryptedStr);
      const decrypted = await decryptMessage(hexToBytes(signer.privateKey), encrypted);
      const envelope: MessageEnvelope = JSON.parse(new TextDecoder().decode(decrypted));

      if (envelope.t !== 'SIGNING_PACKAGE') {
        fail(`${signer.name}: Expected SIGNING_PACKAGE, got ${envelope.t}`);
        continue;
      }

      const payload = envelope.payload as { message_to_sign: string; backendId: string };

      // Validate backendId matches Orchard
      if (payload.backendId !== 'orchard-redpallas') {
        fail(`${signer.name}: Wrong backendId: ${payload.backendId}`);
        continue;
      }

      receivedPackages.set(signer.publicKey, {
        message: payload.message_to_sign,
        backendId: payload.backendId,
      });
      pass(`${signer.name}: Received SIGNING_PACKAGE`, `backendId validated: orchard-redpallas`);
    } catch (e) {
      fail(`${signer.name}: Decrypt failed`, String(e));
    }
  }

  // ==========================================================================
  // STEP 7: Participants Generate Round 1 Commitments
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 7: Participants Generate Round 1 Commitments');
  console.log('─'.repeat(70));

  const round1Results: Map<string, Round1Result> = new Map();

  for (const signer of signers) {
    const keyPackage = participantKeyPackages[signer.publicKey];
    try {
      const result = parseResult<Round1Result>(frost.generate_round1_commitment(keyPackage));
      round1Results.set(signer.publicKey, result);
      pass(`${signer.name}: Generated commitment`, `identifier: ${result.commitment.identifier}`);
    } catch (e) {
      fail(`${signer.name}: Generate Round 1`, String(e));
    }
  }

  // ==========================================================================
  // STEP 8: Participants Send ROUND1_COMMITMENT to Coordinator
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 8: Participants Send ROUND1_COMMITMENT to Coordinator');
  console.log('─'.repeat(70));

  for (const signer of signers) {
    const r1 = round1Results.get(signer.publicKey);
    if (!r1) continue;

    const commitmentEnvelope = createEnvelope(sessionId, 'ROUND1_COMMITMENT', signer.publicKey, {
      message_id: messageId,
      signer_id: signer.publicKey,
      commitment: r1.commitment,
    });

    const plaintext = new TextEncoder().encode(JSON.stringify(commitmentEnvelope));
    const encrypted = await encryptMessage(
      hexToBytes(signer.privateKey),
      hexToBytes(coordinator.publicKey),
      plaintext
    );

    const sendRes = await request(
      'POST',
      '/send',
      {
        session_id: sessionId,
        recipients: [],
        msg: bytesToHex(new TextEncoder().encode(JSON.stringify(encrypted))),
      },
      signer.accessToken
    );

    if (!sendRes.ok) {
      fail(`${signer.name}: Send commitment`, JSON.stringify(sendRes.data));
    } else {
      pass(`${signer.name}: Sent ROUND1_COMMITMENT`);
    }
  }

  await new Promise((r) => setTimeout(r, 100));

  // ==========================================================================
  // STEP 9: Coordinator Collects Commitments
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 9: Coordinator Collects Commitments');
  console.log('─'.repeat(70));

  const collectedCommitments: CommitmentInfo[] = [];

  const coordReceiveRes = await request(
    'POST',
    '/receive',
    { session_id: sessionId, as_coordinator: true },
    coordinator.accessToken
  );

  if (!coordReceiveRes.ok) {
    fail('Coordinator: Receive commitments', JSON.stringify(coordReceiveRes.data));
  } else {
    const msgs = (coordReceiveRes.data as { msgs: Array<{ sender: string; msg: string }> }).msgs;
    log(`Received ${msgs.length} message(s)`);

    for (const msg of msgs) {
      try {
        const encryptedStr = new TextDecoder().decode(hexToBytes(msg.msg));
        const encrypted: EncryptedMessage = JSON.parse(encryptedStr);
        const decrypted = await decryptMessage(hexToBytes(coordinator.privateKey), encrypted);
        const envelope: MessageEnvelope = JSON.parse(new TextDecoder().decode(decrypted));

        if (envelope.t === 'ROUND1_COMMITMENT') {
          const payload = envelope.payload as { commitment: CommitmentInfo };
          collectedCommitments.push(payload.commitment);
          pass(`Collected commitment (id: ${payload.commitment.identifier})`);
        }
      } catch (e) {
        log(`Failed to decrypt: ${e}`);
      }
    }
  }

  if (collectedCommitments.length < 2) {
    fail('Coordinator: Threshold not met', `Got ${collectedCommitments.length}/2 commitments`);
    process.exit(1);
  }

  // ==========================================================================
  // STEP 10: Coordinator Creates Signing Package with Randomizer
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 10: Create Signing Package with Randomizer (ZIP-312)');
  console.log('─'.repeat(70));

  let signingPackageResult: SigningPackageResult;
  try {
    signingPackageResult = parseResult<SigningPackageResult>(
      frost.create_signing_package(
        JSON.stringify(collectedCommitments),
        messageToSign,
        keygen.public_key_package
      )
    );
    pass('Created signing package with randomizer');
    log(`Randomizer: ${signingPackageResult.randomizer.slice(0, 50)}...`);
  } catch (e) {
    fail('Create signing package', String(e));
    process.exit(1);
  }

  // ==========================================================================
  // STEP 11: Coordinator Broadcasts COMMITMENTS_SET (with randomizer)
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 11: Coordinator Broadcasts COMMITMENTS_SET');
  console.log('─'.repeat(70));

  const commitmentsSetEnvelope = createEnvelope(sessionId, 'COMMITMENTS_SET', coordinator.publicKey, {
    message_id: messageId,
    commitments: collectedCommitments,
    signing_package: signingPackageResult.signing_package,
    randomizer: signingPackageResult.randomizer, // Participants need this for round 2
  });

  for (const signer of signers) {
    const plaintext = new TextEncoder().encode(JSON.stringify(commitmentsSetEnvelope));
    const encrypted = await encryptMessage(
      hexToBytes(coordinator.privateKey),
      hexToBytes(signer.publicKey),
      plaintext
    );

    const sendRes = await request(
      'POST',
      '/send',
      {
        session_id: sessionId,
        recipients: [signer.publicKey],
        msg: bytesToHex(new TextEncoder().encode(JSON.stringify(encrypted))),
      },
      coordinator.accessToken
    );

    if (!sendRes.ok) {
      fail(`Send COMMITMENTS_SET to ${signer.name}`, JSON.stringify(sendRes.data));
    } else {
      pass(`Sent COMMITMENTS_SET to ${signer.name}`, `includes randomizer`);
    }
  }

  await new Promise((r) => setTimeout(r, 100));

  // ==========================================================================
  // STEP 12: Participants Receive COMMITMENTS_SET
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 12: Participants Receive COMMITMENTS_SET');
  console.log('─'.repeat(70));

  const receivedCommitmentsSets: Map<string, { signingPackage: string; randomizer: string }> = new Map();

  for (const signer of signers) {
    const receiveRes = await request(
      'POST',
      '/receive',
      { session_id: sessionId, as_coordinator: false },
      signer.accessToken
    );

    if (!receiveRes.ok) {
      fail(`${signer.name}: Receive COMMITMENTS_SET`, JSON.stringify(receiveRes.data));
      continue;
    }

    const msgs = (receiveRes.data as { msgs: Array<{ sender: string; msg: string }> }).msgs;
    for (const msg of msgs) {
      try {
        const encryptedStr = new TextDecoder().decode(hexToBytes(msg.msg));
        const encrypted: EncryptedMessage = JSON.parse(encryptedStr);
        const decrypted = await decryptMessage(hexToBytes(signer.privateKey), encrypted);
        const envelope: MessageEnvelope = JSON.parse(new TextDecoder().decode(decrypted));

        if (envelope.t === 'COMMITMENTS_SET') {
          const payload = envelope.payload as {
            signing_package: string;
            randomizer: string;
          };
          receivedCommitmentsSets.set(signer.publicKey, {
            signingPackage: payload.signing_package,
            randomizer: payload.randomizer,
          });
          pass(`${signer.name}: Received COMMITMENTS_SET`, `with randomizer`);
        }
      } catch (e) {
        log(`${signer.name}: Decrypt failed: ${e}`);
      }
    }
  }

  // ==========================================================================
  // STEP 13: Participants Generate Round 2 Signature Shares
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 13: Participants Generate Round 2 Signature Shares');
  console.log('─'.repeat(70));

  const signatureShares: Map<string, SignatureShareInfo> = new Map();

  for (const signer of signers) {
    const r1 = round1Results.get(signer.publicKey);
    const commitmentSet = receivedCommitmentsSets.get(signer.publicKey);

    if (!r1 || !commitmentSet) {
      fail(`${signer.name}: Missing data for Round 2`);
      continue;
    }

    const keyPackage = participantKeyPackages[signer.publicKey];

    try {
      const share = parseResult<SignatureShareInfo>(
        frost.generate_round2_signature(
          keyPackage,
          JSON.stringify(r1.nonces),
          commitmentSet.signingPackage,
          commitmentSet.randomizer // Required for RedPallas
        )
      );
      signatureShares.set(signer.publicKey, share);
      pass(`${signer.name}: Generated signature share`, `identifier: ${share.identifier}`);
    } catch (e) {
      fail(`${signer.name}: Generate Round 2`, String(e));
    }
  }

  // ==========================================================================
  // STEP 14: Participants Send ROUND2_SIGNATURE_SHARE
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 14: Participants Send ROUND2_SIGNATURE_SHARE');
  console.log('─'.repeat(70));

  for (const signer of signers) {
    const share = signatureShares.get(signer.publicKey);
    if (!share) continue;

    const shareEnvelope = createEnvelope(sessionId, 'ROUND2_SIGNATURE_SHARE', signer.publicKey, {
      message_id: messageId,
      signer_id: signer.publicKey,
      share,
    });

    const plaintext = new TextEncoder().encode(JSON.stringify(shareEnvelope));
    const encrypted = await encryptMessage(
      hexToBytes(signer.privateKey),
      hexToBytes(coordinator.publicKey),
      plaintext
    );

    const sendRes = await request(
      'POST',
      '/send',
      {
        session_id: sessionId,
        recipients: [],
        msg: bytesToHex(new TextEncoder().encode(JSON.stringify(encrypted))),
      },
      signer.accessToken
    );

    if (!sendRes.ok) {
      fail(`${signer.name}: Send share`, JSON.stringify(sendRes.data));
    } else {
      pass(`${signer.name}: Sent ROUND2_SIGNATURE_SHARE`);
    }
  }

  await new Promise((r) => setTimeout(r, 100));

  // ==========================================================================
  // STEP 15: Coordinator Collects Signature Shares
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 15: Coordinator Collects Signature Shares');
  console.log('─'.repeat(70));

  const collectedShares: SignatureShareInfo[] = [];

  const sharesReceiveRes = await request(
    'POST',
    '/receive',
    { session_id: sessionId, as_coordinator: true },
    coordinator.accessToken
  );

  if (!sharesReceiveRes.ok) {
    fail('Coordinator: Receive shares', JSON.stringify(sharesReceiveRes.data));
  } else {
    const msgs = (sharesReceiveRes.data as { msgs: Array<{ sender: string; msg: string }> }).msgs;
    log(`Received ${msgs.length} message(s)`);

    for (const msg of msgs) {
      try {
        const encryptedStr = new TextDecoder().decode(hexToBytes(msg.msg));
        const encrypted: EncryptedMessage = JSON.parse(encryptedStr);
        const decrypted = await decryptMessage(hexToBytes(coordinator.privateKey), encrypted);
        const envelope: MessageEnvelope = JSON.parse(new TextDecoder().decode(decrypted));

        if (envelope.t === 'ROUND2_SIGNATURE_SHARE') {
          const payload = envelope.payload as { share: SignatureShareInfo };
          collectedShares.push(payload.share);
          pass(`Collected share (id: ${payload.share.identifier})`);
        }
      } catch (e) {
        log(`Failed to decrypt: ${e}`);
      }
    }
  }

  if (collectedShares.length < 2) {
    fail('Coordinator: Threshold not met', `Got ${collectedShares.length}/2 shares`);
    process.exit(1);
  }

  // ==========================================================================
  // STEP 16: Coordinator Aggregates Signature (with randomizer)
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 16: Coordinator Aggregates Signature (RedPallas)');
  console.log('─'.repeat(70));

  let aggregateResult: AggregateResult;
  try {
    aggregateResult = parseResult<AggregateResult>(
      frost.aggregate_signature(
        JSON.stringify(collectedShares),
        signingPackageResult.signing_package,
        keygen.public_key_package,
        signingPackageResult.randomizer // Required for RedPallas
      )
    );
    pass('Aggregated signature', `signature: ${aggregateResult.signature.slice(0, 32)}...`);
  } catch (e) {
    fail('Aggregate signature', String(e));
    process.exit(1);
  }

  // ==========================================================================
  // STEP 17: Verify Final Signature (with randomizer)
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 17: Verify Final Signature (RedPallas)');
  console.log('─'.repeat(70));

  let verifyResult: VerifyResult;
  try {
    verifyResult = parseResult<VerifyResult>(
      frost.verify_signature(
        aggregateResult.signature,
        messageToSign,
        keygen.group_public_key,
        signingPackageResult.randomizer // Required for RedPallas verification
      )
    );

    if (verifyResult.valid) {
      pass('Signature verification', 'VALID');
    } else {
      fail('Signature verification', 'INVALID');
    }
  } catch (e) {
    fail('Verify signature', String(e));
    verifyResult = { valid: false };
  }

  // ==========================================================================
  // STEP 18: Coordinator Broadcasts SIGNATURE_RESULT
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 18: Coordinator Broadcasts SIGNATURE_RESULT');
  console.log('─'.repeat(70));

  const resultEnvelope = createEnvelope(sessionId, 'SIGNATURE_RESULT', coordinator.publicKey, {
    message_id: messageId,
    backendId: 'orchard-redpallas',
    signature: aggregateResult.signature,
    group_public_key: keygen.group_public_key,
    randomizer: signingPackageResult.randomizer,
    verified: verifyResult.valid,
  });

  for (const signer of signers) {
    const plaintext = new TextEncoder().encode(JSON.stringify(resultEnvelope));
    const encrypted = await encryptMessage(
      hexToBytes(coordinator.privateKey),
      hexToBytes(signer.publicKey),
      plaintext
    );

    const sendRes = await request(
      'POST',
      '/send',
      {
        session_id: sessionId,
        recipients: [signer.publicKey],
        msg: bytesToHex(new TextEncoder().encode(JSON.stringify(encrypted))),
      },
      coordinator.accessToken
    );

    if (!sendRes.ok) {
      fail(`Send SIGNATURE_RESULT to ${signer.name}`, JSON.stringify(sendRes.data));
    } else {
      pass(`Sent SIGNATURE_RESULT to ${signer.name}`);
    }
  }

  // ==========================================================================
  // STEP 19: Close Session
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 19: Close Session');
  console.log('─'.repeat(70));

  const closeRes = await request(
    'POST',
    '/close_session',
    { session_id: sessionId },
    coordinator.accessToken
  );

  if (!closeRes.ok) {
    fail('Close session', JSON.stringify(closeRes.data));
  } else {
    pass('Session closed successfully');
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('');
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Backend: orchard-redpallas`);
  console.log(`  Curve: RedPallas (Zcash Orchard compatible)`);
  console.log(`  Message signed: ${messageToSign.slice(0, 32)}...`);
  console.log(`  Group public key: ${keygen.group_public_key}`);
  console.log(`  Final signature: ${aggregateResult.signature}`);
  console.log(`  Signature valid: ${verifyResult.valid}`);
  console.log('');
  console.log('  Stack verified:');
  console.log('    - frostd auth (XEdDSA): ✓');
  console.log('    - E2E encryption (X25519 + AES-GCM): ✓');
  console.log('    - Message relay: ✓');
  console.log('    - Zcash/Orchard FROST (rerandomized): ✓');
  console.log('');
  console.log(`  Tests passed: ${passed}`);
  console.log(`  Tests failed: ${failed}`);
  console.log('='.repeat(70));
  console.log('');

  if (failed > 0) {
    console.log('[RESULT] Some tests failed.');
    process.exit(1);
  } else {
    console.log('[RESULT] All tests passed! Live Zcash FROST ceremony completed successfully.');
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
