#!/usr/bin/env npx tsx
/**
 * frostd Smoke Test
 *
 * Tests the complete authentication and session flow against a running frostd server.
 * Uses the Rust xeddsa WASM module for byte-for-byte compatibility with frostd.
 *
 * Usage:
 *   npx tsx scripts/test-frostd.ts [server-url]
 *
 * Default server: https://localhost:2743
 */

// Disable TLS certificate validation for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Hex encoding utilities
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

/**
 * Convert UUID string to 16-byte binary representation.
 * frostd uses Rust's Uuid::as_bytes() which returns the 16-byte binary form,
 * NOT the 36-character string form.
 *
 * Example: "b324f3f9-4a23-477d-9883-2b12d9d42b94" -> [0xb3, 0x24, 0xf3, 0xf9, ...]
 */
function uuidToBytes(uuid: string): Uint8Array {
  // Remove hyphens and parse as hex
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: expected 32 hex chars, got ${hex.length}`);
  }
  return hexToBytes(hex);
}

// Use dynamic import for ESM modules
async function main() {
  const SERVER_URL = process.argv[2] || 'https://localhost:2743';

  console.log('');
  console.log('='.repeat(60));
  console.log('  frostd Smoke Test (Rust XEdDSA WASM)');
  console.log('='.repeat(60));
  console.log(`  Server: ${SERVER_URL}`);
  console.log('='.repeat(60));
  console.log('');

  // Import the Rust xeddsa WASM module for frostd-compatible signing
  console.log('Loading XEdDSA WASM module...');
  const wasm = await import('../src/lib/xeddsa-wasm/pkg/xeddsa_wasm.js');
  console.log('XEdDSA WASM loaded successfully!\n');

  // WASM-based key generation and signing
  function generateAuthKeyPair(): { publicKey: string; privateKey: string } {
    const keypair = wasm.generate_keypair();
    return {
      publicKey: bytesToHex(new Uint8Array(keypair.public_key)),
      privateKey: bytesToHex(new Uint8Array(keypair.private_key)),
    };
  }

  function signChallenge(privateKeyHex: string, challenge: string): string {
    const privateKey = hexToBytes(privateKeyHex);
    // CRITICAL: Sign the 16-byte binary UUID, NOT the 36-byte string!
    // frostd uses Uuid::as_bytes() which returns binary representation
    const messageBytes = uuidToBytes(challenge);
    const signature = wasm.sign(privateKey, messageBytes);
    return bytesToHex(new Uint8Array(signature));
  }

  let accessToken: string | null = null;
  let sessionId: string | null = null;
  let pubkey: string | null = null;

  // Helper to make requests
  async function request(
    method: string,
    endpoint: string,
    body?: object,
    useAuth = false
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useAuth && accessToken) {
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

  // Test runner
  let passed = 0;
  let failed = 0;

  function pass(step: string, details?: string) {
    passed++;
    console.log(`✅ PASS: ${step}`);
    if (details) console.log(`         ${details}`);
  }

  function fail(step: string, error: string) {
    failed++;
    console.log(`❌ FAIL: ${step}`);
    console.log(`         Error: ${error}`);
  }

  // ==========================================================================
  // Test Steps
  // ==========================================================================

  // Step 1: Generate keypair
  console.log('\n--- Step 1: Generate X25519 Keypair ---');
  let privateKey: string;
  try {
    const keys = generateAuthKeyPair();
    pubkey = keys.publicKey;
    pass('Generate keypair', `pubkey (X25519): ${pubkey}`);
    console.log(`         pubkey length: ${pubkey.length} hex chars = ${pubkey.length / 2} bytes`);

    // Store private key for signing
    privateKey = keys.privateKey;
    console.log(`         privateKey length: ${privateKey.length} hex chars = ${privateKey.length / 2} bytes`);
  } catch (e) {
    fail('Generate keypair', String(e));
    process.exit(1);
  }

  // Step 2: Get challenge
  console.log('\n--- Step 2: POST /challenge ---');
  let challenge: string;
  try {
    const res = await request('POST', '/challenge');
    if (!res.ok) {
      fail('POST /challenge', `Status ${res.status}: ${JSON.stringify(res.data)}`);
      process.exit(1);
    }
    challenge = (res.data as { challenge: string }).challenge;
    pass('POST /challenge', `challenge (UUID): ${challenge}`);

    // Show the challenge bytes that will be signed (16-byte binary, NOT 36-byte string)
    const challengeBytes = uuidToBytes(challenge);
    const challengeHex = Array.from(challengeBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log(`         challenge as binary UUID: ${challengeHex}`);
    console.log(`         challenge byte length: ${challengeBytes.length} bytes (binary UUID, not string)`);
  } catch (e) {
    fail('POST /challenge', String(e));
    process.exit(1);
  }

  // Step 3: Sign challenge with XEdDSA (using Rust WASM)
  console.log('\n--- Step 3: Sign Challenge (Rust XEdDSA WASM) ---');
  let signature: string;
  try {
    signature = signChallenge(privateKey!, challenge);
    pass('Sign challenge', `signature: ${signature}`);
    console.log(`         signature length: ${signature.length} hex chars = ${signature.length / 2} bytes`);

    // Self-verification using Rust WASM (with binary UUID)
    const pubBytes = hexToBytes(pubkey!);
    const messageBytes = uuidToBytes(challenge);
    const sigBytes = hexToBytes(signature);
    const selfVerify = wasm.verify(pubBytes, messageBytes, sigBytes);
    console.log(`         Self-verify (Rust WASM): ${selfVerify ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    fail('Sign challenge', String(e));
    process.exit(1);
  }

  // Step 4: Login
  console.log('\n--- Step 4: POST /login ---');
  const loginPayload = {
    challenge,
    pubkey,
    signature,
  };
  console.log('         Login payload:');
  console.log(`           challenge: ${loginPayload.challenge}`);
  console.log(`           pubkey: ${loginPayload.pubkey}`);
  console.log(`           signature: ${loginPayload.signature}`);

  // Debug: show exact bytes
  console.log('');
  console.log('         DEBUG - Exact byte values:');
  console.log(`           pubkey bytes: [${Array.from(hexToBytes(pubkey!)).join(', ')}]`);
  const msgBytes = uuidToBytes(challenge);
  console.log(`           message bytes (binary UUID): [${Array.from(msgBytes).join(', ')}]`);
  console.log(`           signature bytes: [${Array.from(hexToBytes(signature)).join(', ')}]`);
  try {
    const res = await request('POST', '/login', loginPayload);
    if (!res.ok) {
      fail('POST /login', `Status ${res.status}: ${JSON.stringify(res.data)}`);
      console.log('');
      console.log('         DEBUG: Server response suggests signature verification failed.');
      console.log('         Possible causes:');
      console.log('         1. Wrong message format (UTF-8 vs binary UUID)');
      console.log('         2. Wrong public key format (X25519 vs Ed25519)');
      console.log('         3. XEdDSA algorithm mismatch with Rust xeddsa crate');
      process.exit(1);
    }
    accessToken = (res.data as { access_token: string }).access_token;
    pass('POST /login', `access_token: ${accessToken.slice(0, 20)}...`);
  } catch (e) {
    fail('POST /login', String(e));
    process.exit(1);
  }

  // Step 5: Create session
  console.log('\n--- Step 5: POST /create_new_session ---');
  try {
    const res = await request(
      'POST',
      '/create_new_session',
      {
        pubkeys: [pubkey],
        message_count: 1,
      },
      true
    );
    if (!res.ok) {
      fail('POST /create_new_session', `Status ${res.status}: ${JSON.stringify(res.data)}`);
      process.exit(1);
    }
    sessionId = (res.data as { session_id: string }).session_id;
    pass('POST /create_new_session', `session_id: ${sessionId}`);
  } catch (e) {
    fail('POST /create_new_session', String(e));
    process.exit(1);
  }

  // Step 6: List sessions
  console.log('\n--- Step 6: POST /list_sessions ---');
  try {
    const res = await request('POST', '/list_sessions', {}, true);
    if (!res.ok) {
      fail('POST /list_sessions', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    } else {
      const sessions = (res.data as { session_ids: string[] }).session_ids;
      if (sessions.includes(sessionId!)) {
        pass('POST /list_sessions', `Found our session in list (${sessions.length} total)`);
      } else {
        fail('POST /list_sessions', `Our session ${sessionId} not in list: ${JSON.stringify(sessions)}`);
      }
    }
  } catch (e) {
    fail('POST /list_sessions', String(e));
  }

  // Step 7: Get session info
  console.log('\n--- Step 7: POST /get_session_info ---');
  try {
    const res = await request(
      'POST',
      '/get_session_info',
      { session_id: sessionId },
      true
    );
    if (!res.ok) {
      fail('POST /get_session_info', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    } else {
      const info = res.data as { message_count: number; pubkeys: string[]; coordinator_pubkey: string };
      pass(
        'POST /get_session_info',
        `message_count: ${info.message_count}, participants: ${info.pubkeys.length}`
      );
    }
  } catch (e) {
    fail('POST /get_session_info', String(e));
  }

  // Step 8: Send message
  console.log('\n--- Step 8: POST /send ---');
  try {
    const res = await request(
      'POST',
      '/send',
      {
        session_id: sessionId,
        recipients: [], // Empty = send to coordinator
        msg: 'deadbeef', // Hex-encoded test message
      },
      true
    );
    if (!res.ok) {
      fail('POST /send', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    } else {
      pass('POST /send', 'Message sent successfully');
    }
  } catch (e) {
    fail('POST /send', String(e));
  }

  // Step 9: Receive messages
  console.log('\n--- Step 9: POST /receive ---');
  try {
    const res = await request(
      'POST',
      '/receive',
      {
        session_id: sessionId,
        as_coordinator: true,
      },
      true
    );
    if (!res.ok) {
      fail('POST /receive', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    } else {
      const msgs = (res.data as { msgs: Array<{ sender: string; msg: string }> }).msgs;
      pass('POST /receive', `Received ${msgs.length} message(s)`);
    }
  } catch (e) {
    fail('POST /receive', String(e));
  }

  // Step 10: Close session
  console.log('\n--- Step 10: POST /close_session ---');
  try {
    const res = await request(
      'POST',
      '/close_session',
      { session_id: sessionId },
      true
    );
    if (!res.ok) {
      fail('POST /close_session', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    } else {
      pass('POST /close_session', 'Session closed successfully');
    }
  } catch (e) {
    fail('POST /close_session', String(e));
  }

  // ==========================================================================
  // Summary
  // ==========================================================================

  console.log('');
  console.log('='.repeat(60));
  console.log('  Summary');
  console.log('='.repeat(60));
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log('='.repeat(60));
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
