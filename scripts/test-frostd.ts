#!/usr/bin/env npx tsx
/**
 * frostd Smoke Test
 *
 * Tests the complete authentication and session flow against a running frostd server.
 *
 * Usage:
 *   npx tsx scripts/test-frostd.ts [server-url]
 *
 * Default server: http://localhost:2743
 */

// Use dynamic import for ESM modules
async function main() {
  const SERVER_URL = process.argv[2] || 'http://localhost:2743';

  console.log('');
  console.log('='.repeat(60));
  console.log('  frostd Smoke Test');
  console.log('='.repeat(60));
  console.log(`  Server: ${SERVER_URL}`);
  console.log('='.repeat(60));
  console.log('');

  // Import our crypto functions
  const { generateAuthKeyPair, signChallenge } = await import('../src/lib/crypto/index.js');

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
  try {
    const keys = generateAuthKeyPair();
    pubkey = keys.publicKey;
    pass('Generate keypair', `pubkey: ${pubkey.slice(0, 16)}...`);

    // Store private key for signing
    var privateKey = keys.privateKey;
  } catch (e) {
    fail('Generate keypair', String(e));
    process.exit(1);
  }

  // Step 2: Get challenge
  console.log('\n--- Step 2: GET /challenge ---');
  let challenge: string;
  try {
    const res = await request('POST', '/challenge');
    if (!res.ok) {
      fail('GET /challenge', `Status ${res.status}: ${JSON.stringify(res.data)}`);
      process.exit(1);
    }
    challenge = (res.data as { challenge: string }).challenge;
    pass('GET /challenge', `challenge: ${challenge}`);
  } catch (e) {
    fail('GET /challenge', String(e));
    process.exit(1);
  }

  // Step 3: Sign challenge with XEdDSA
  console.log('\n--- Step 3: Sign Challenge (XEdDSA) ---');
  let signature: string;
  try {
    signature = signChallenge(privateKey!, challenge);
    pass('Sign challenge', `signature: ${signature.slice(0, 32)}...`);
  } catch (e) {
    fail('Sign challenge', String(e));
    process.exit(1);
  }

  // Step 4: Login
  console.log('\n--- Step 4: POST /login ---');
  try {
    const res = await request('POST', '/login', {
      challenge,
      pubkey,
      signature,
    });
    if (!res.ok) {
      fail('POST /login', `Status ${res.status}: ${JSON.stringify(res.data)}`);
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
