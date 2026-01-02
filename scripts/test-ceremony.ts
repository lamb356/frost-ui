#!/usr/bin/env npx tsx
/**
 * FROST Signing Ceremony Integration Test
 *
 * Tests a complete 2-of-3 threshold signing ceremony against a running frostd server.
 * Uses real frost-wasm for FROST operations and E2E encryption for messages.
 *
 * Usage:
 *   npx tsx scripts/test-ceremony.ts [server-url]
 *
 * Default server: https://localhost:2745
 */

// Disable TLS certificate validation for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import * as crypto from 'crypto';

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

// =============================================================================
// E2E Encryption (X25519 + AES-GCM)
// =============================================================================

interface EncryptedMessage {
  ephemeralPubkey: string; // Sender's ephemeral X25519 public key (hex)
  nonce: string; // 12-byte AES-GCM nonce (hex)
  ciphertext: string; // Encrypted data (hex)
}

async function encryptMessage(
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array
): Promise<EncryptedMessage> {
  // Generate ephemeral keypair for this message
  const ephemeralPrivate = crypto.randomBytes(32);
  const ephemeralKeyPair = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b656e04220420', 'hex'), // X25519 private key header
      ephemeralPrivate,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  const ephemeralPublic = crypto.createPublicKey(ephemeralKeyPair);
  const ephemeralPubBytes = ephemeralPublic.export({ type: 'spki', format: 'der' }).slice(-32);

  // Derive shared secret using ECDH
  const recipientKey = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b656e032100', 'hex'), // X25519 public key header
      Buffer.from(recipientPublicKey),
    ]),
    format: 'der',
    type: 'spki',
  });

  const sharedSecret = crypto.diffieHellman({
    privateKey: ephemeralKeyPair,
    publicKey: recipientKey,
  });

  // Derive AES key from shared secret using HKDF
  const aesKey = crypto.hkdfSync('sha256', sharedSecret, '', 'frost-e2e', 32);

  // Encrypt with AES-GCM
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

  // Create recipient private key
  const recipientKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b656e04220420', 'hex'),
      Buffer.from(recipientPrivateKey),
    ]),
    format: 'der',
    type: 'pkcs8',
  });

  // Create sender ephemeral public key
  const ephemeralPub = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b656e032100', 'hex'),
      Buffer.from(ephemeralPubBytes),
    ]),
    format: 'der',
    type: 'spki',
  });

  // Derive shared secret
  const sharedSecret = crypto.diffieHellman({
    privateKey: recipientKey,
    publicKey: ephemeralPub,
  });

  // Derive AES key
  const aesKey = crypto.hkdfSync('sha256', sharedSecret, '', 'frost-e2e', 32);

  // Decrypt (ciphertext includes auth tag at end)
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
// Main Test
// =============================================================================

async function main() {
  const SERVER_URL = process.argv[2] || 'https://localhost:2745';

  console.log('');
  console.log('='.repeat(70));
  console.log('  FROST Signing Ceremony Integration Test');
  console.log('='.repeat(70));
  console.log(`  Server: ${SERVER_URL}`);
  console.log(`  Threshold: 2-of-3`);
  console.log('='.repeat(70));
  console.log('');

  // Load WASM modules
  console.log('Loading WASM modules...');
  const xeddsa = await import('../src/lib/xeddsa-wasm/pkg/xeddsa_wasm.js');

  // For frost-wasm, we need to handle the web target in Node.js
  // by loading the WASM file directly
  const frostModule = await import('../src/lib/frost-wasm/pkg/frost_wasm.js');
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const wasmPath = path.join(__dirname, '../src/lib/frost-wasm/pkg/frost_wasm_bg.wasm');
  const wasmBytes = fs.readFileSync(wasmPath);

  // Initialize with the wasm bytes
  await frostModule.default(wasmBytes);
  frostModule.init();
  const frost = frostModule;
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
  console.log('STEP 1: Generate Auth Keypairs');
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
    // Get challenge
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

    // Login
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

  // Verify all participants authenticated
  if (participants.some((p) => !p.accessToken)) {
    console.log('\n[FATAL] Not all participants authenticated. Aborting.');
    process.exit(1);
  }

  // ==========================================================================
  // STEP 3: Generate FROST Key Shares (2-of-3)
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 3: Generate FROST Key Shares (Trusted Dealer)');
  console.log('─'.repeat(70));

  const keyGenResultStr = frost.generate_key_shares(2, 3);
  log(`Key gen result: ${keyGenResultStr.slice(0, 300)}...`);
  const keyGenResult = JSON.parse(keyGenResultStr);
  if (keyGenResult.error) {
    fail('Generate key shares', keyGenResult.error);
    process.exit(1);
  }

  // Actual frost-wasm output format:
  // - group_public_key: hex string
  // - shares: Array<{identifier: number, key_package: string}>
  // - public_key_package: JSON string (for aggregation)
  const shares = keyGenResult.shares as Array<{ identifier: number; key_package: string }>;
  const groupPublicKey = keyGenResult.group_public_key as string;
  const publicKeyPackage = keyGenResult.public_key_package as string;

  pass('Generated FROST key shares', `threshold: 2, total: 3`);
  log(`Group public key: ${groupPublicKey.slice(0, 32)}...`);

  // Sort shares by identifier and assign to participants
  shares.sort((a, b) => a.identifier - b.identifier);
  log(`Participant identifiers: ${shares.map((s) => s.identifier).join(', ')}`);

  // Assign key packages to our participants
  const participantKeyPackages: Record<string, string> = {};
  const participantIdentifiers: Record<string, number> = {};
  participants.forEach((p, i) => {
    const share = shares[i];
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
  const signers = [participants[1], participants[2]]; // Participants 1 and 2 will sign

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
  // STEP 5: Coordinator Broadcasts SIGNING_PACKAGE
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 5: Coordinator Broadcasts SIGNING_PACKAGE');
  console.log('─'.repeat(70));

  const messageToSign = 'deadbeefcafebabe'; // Test message (hex)
  const messageId = generateUUID();

  const signingPackage = createEnvelope(sessionId, 'SIGNING_PACKAGE', coordinator.publicKey, {
    message_id: messageId,
    message_to_sign: messageToSign,
    selected_signers: signers.map((s) => s.publicKey),
  });

  // Send to each signer with E2E encryption
  for (const signer of signers) {
    const plaintext = new TextEncoder().encode(JSON.stringify(signingPackage));
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
      pass(`Sent SIGNING_PACKAGE to ${signer.name}`);
    }
  }

  // Small delay to let messages propagate
  await new Promise((r) => setTimeout(r, 100));

  // ==========================================================================
  // STEP 6: Participants Receive SIGNING_PACKAGE
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 6: Participants Receive and Decrypt SIGNING_PACKAGE');
  console.log('─'.repeat(70));

  const receivedPackages: Map<string, MessageEnvelope> = new Map();

  for (const signer of signers) {
    const receiveRes = await request(
      'POST',
      '/receive',
      {
        session_id: sessionId,
        as_coordinator: false,
      },
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

    // Decrypt the message
    try {
      const encryptedStr = new TextDecoder().decode(hexToBytes(msgs[0].msg));
      const encrypted: EncryptedMessage = JSON.parse(encryptedStr);
      const decrypted = await decryptMessage(hexToBytes(signer.privateKey), encrypted);
      const envelope: MessageEnvelope = JSON.parse(new TextDecoder().decode(decrypted));

      if (envelope.t !== 'SIGNING_PACKAGE') {
        fail(`${signer.name}: Expected SIGNING_PACKAGE, got ${envelope.t}`);
        continue;
      }

      receivedPackages.set(signer.publicKey, envelope);
      pass(`${signer.name}: Received and decrypted SIGNING_PACKAGE`);
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

  // frost-wasm types:
  // commitment: {identifier: number, commitment: string} (commitment is JSON with hiding/binding)
  // nonces: {identifier: number, nonces: string} (nonces is JSON - keep secret)
  const round1Results: Map<
    string,
    { nonces: { identifier: number; nonces: string }; commitment: { identifier: number; commitment: string } }
  > = new Map();

  for (const signer of signers) {
    const keyPackage = participantKeyPackages[signer.publicKey];
    const result = JSON.parse(frost.generate_round1_commitment(keyPackage));

    if (result.error) {
      fail(`${signer.name}: Generate Round 1`, result.error);
      continue;
    }

    round1Results.set(signer.publicKey, {
      nonces: result.nonces,
      commitment: result.commitment,
    });

    pass(`${signer.name}: Generated commitment`, `identifier: ${result.commitment.identifier}`);
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

    const commitmentEnvelope = createEnvelope(
      sessionId,
      'ROUND1_COMMITMENT',
      signer.publicKey,
      {
        message_id: messageId,
        signer_id: signer.publicKey,
        commitment: r1.commitment,
      }
    );

    // Encrypt to coordinator
    const plaintext = new TextEncoder().encode(JSON.stringify(commitmentEnvelope));
    const encrypted = await encryptMessage(
      hexToBytes(signer.privateKey),
      hexToBytes(coordinator.publicKey),
      plaintext
    );

    // Send with empty recipients (= to coordinator)
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

  // Commitments in frost-wasm format: {identifier: number, commitment: string}
  const collectedCommitments: Array<{ identifier: number; commitment: string }> = [];

  const coordReceiveRes = await request(
    'POST',
    '/receive',
    {
      session_id: sessionId,
      as_coordinator: true,
    },
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
          const payload = envelope.payload as { commitment: { identifier: number; commitment: string } };
          collectedCommitments.push(payload.commitment);
          pass(`Collected commitment from ${envelope.from.slice(0, 16)}... (id: ${payload.commitment.identifier})`);
        }
      } catch (e) {
        log(`Failed to decrypt message from ${msg.sender}: ${e}`);
      }
    }
  }

  if (collectedCommitments.length < 2) {
    fail('Coordinator: Threshold not met', `Got ${collectedCommitments.length}/2 commitments`);
    process.exit(1);
  }

  // ==========================================================================
  // STEP 10: Coordinator Broadcasts COMMITMENTS_SET
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 10: Coordinator Broadcasts COMMITMENTS_SET');
  console.log('─'.repeat(70));

  const commitmentsSetEnvelope = createEnvelope(
    sessionId,
    'COMMITMENTS_SET',
    coordinator.publicKey,
    {
      message_id: messageId,
      commitments: collectedCommitments,
    }
  );

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
      pass(`Sent COMMITMENTS_SET to ${signer.name}`);
    }
  }

  await new Promise((r) => setTimeout(r, 100));

  // ==========================================================================
  // STEP 11: Participants Receive COMMITMENTS_SET
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 11: Participants Receive COMMITMENTS_SET');
  console.log('─'.repeat(70));

  const receivedCommitmentsSets: Map<string, unknown[]> = new Map();

  for (const signer of signers) {
    const receiveRes = await request(
      'POST',
      '/receive',
      {
        session_id: sessionId,
        as_coordinator: false,
      },
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
          const payload = envelope.payload as { commitments: unknown[] };
          receivedCommitmentsSets.set(signer.publicKey, payload.commitments);
          pass(`${signer.name}: Received COMMITMENTS_SET with ${payload.commitments.length} commitments`);
        }
      } catch (e) {
        log(`${signer.name}: Decrypt failed: ${e}`);
      }
    }
  }

  // ==========================================================================
  // STEP 12: Participants Generate Round 2 Signature Shares
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 12: Participants Generate Round 2 Signature Shares');
  console.log('─'.repeat(70));

  // SignatureShare from frost-wasm: {identifier: number, share: string}
  const signatureShares: Array<{ identifier: number; share: string }> = [];

  for (const signer of signers) {
    const r1 = round1Results.get(signer.publicKey);
    const commitments = receivedCommitmentsSets.get(signer.publicKey);

    if (!r1 || !commitments) {
      fail(`${signer.name}: Missing data for Round 2`);
      continue;
    }

    const keyPackage = participantKeyPackages[signer.publicKey];
    // WASM expects JSON strings for all parameters
    const result = JSON.parse(
      frost.generate_round2_signature(
        keyPackage,
        JSON.stringify(r1.nonces),  // nonces must be JSON string
        JSON.stringify(commitments), // commitments must be JSON string
        messageToSign
      )
    );

    if (result.error) {
      fail(`${signer.name}: Generate Round 2`, result.error);
      continue;
    }

    signatureShares.push(result);
    pass(`${signer.name}: Generated signature share`, `identifier: ${result.identifier}`);
  }

  // ==========================================================================
  // STEP 13: Participants Send ROUND2_SIGNATURE_SHARE
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 13: Participants Send ROUND2_SIGNATURE_SHARE');
  console.log('─'.repeat(70));

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i];
    const share = signatureShares[i];
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
  // STEP 14: Coordinator Collects Signature Shares
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 14: Coordinator Collects Signature Shares');
  console.log('─'.repeat(70));

  // SignatureShare from frost-wasm: {identifier: number, share: string}
  const collectedShares: Array<{ identifier: number; share: string }> = [];

  const sharesReceiveRes = await request(
    'POST',
    '/receive',
    {
      session_id: sessionId,
      as_coordinator: true,
    },
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
          const payload = envelope.payload as { share: { identifier: number; share: string } };
          collectedShares.push(payload.share);
          pass(`Collected share from ${envelope.from.slice(0, 16)}... (id: ${payload.share.identifier})`);
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
  // STEP 15: Coordinator Aggregates Signature
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 15: Coordinator Aggregates Signature');
  console.log('─'.repeat(70));

  const aggregateResult = JSON.parse(
    frost.aggregate_signature(
      JSON.stringify(collectedShares),
      JSON.stringify(collectedCommitments),
      messageToSign,
      publicKeyPackage
    )
  );

  if (aggregateResult.error) {
    fail('Aggregate signature', aggregateResult.error);
    process.exit(1);
  }

  const finalSignature = aggregateResult.signature;
  pass('Aggregated signature', `signature: ${finalSignature.slice(0, 32)}...`);

  // ==========================================================================
  // STEP 16: Verify Final Signature
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 16: Verify Final Signature');
  console.log('─'.repeat(70));

  const verifyResult = JSON.parse(frost.verify_signature(finalSignature, messageToSign, groupPublicKey));

  if (verifyResult.error) {
    fail('Verify signature', verifyResult.error);
  } else if (verifyResult.valid) {
    pass('Signature verification', 'VALID');
  } else {
    fail('Signature verification', 'INVALID');
  }

  // ==========================================================================
  // STEP 17: Coordinator Broadcasts SIGNATURE_RESULT
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 17: Coordinator Broadcasts SIGNATURE_RESULT');
  console.log('─'.repeat(70));

  const resultEnvelope = createEnvelope(sessionId, 'SIGNATURE_RESULT', coordinator.publicKey, {
    message_id: messageId,
    signature: finalSignature,
    group_public_key: groupPublicKey,
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
  // STEP 18: Close Session
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 18: Close Session');
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
  console.log(`  Message signed: ${messageToSign}`);
  console.log(`  Group public key: ${groupPublicKey}`);
  console.log(`  Final signature: ${finalSignature}`);
  console.log(`  Signature valid: ${verifyResult.valid}`);
  console.log('');
  console.log(`  Tests passed: ${passed}`);
  console.log(`  Tests failed: ${failed}`);
  console.log('='.repeat(70));
  console.log('');

  if (failed > 0) {
    console.log('[RESULT] Some tests failed.');
    process.exit(1);
  } else {
    console.log('[RESULT] All tests passed! Signing ceremony completed successfully.');
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
