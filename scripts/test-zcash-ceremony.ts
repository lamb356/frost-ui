#!/usr/bin/env npx tsx
/**
 * FROST Zcash (RedPallas) Signing Ceremony Test
 *
 * Tests the complete FROST rerandomized signing ceremony using the RedPallas
 * curve for Zcash Orchard compatibility.
 *
 * Usage:
 *   npx tsx scripts/test-zcash-ceremony.ts
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// =============================================================================
// Types (matching loader.ts)
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
// Test Helpers
// =============================================================================

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseResult<T>(json: string): T {
  const result = JSON.parse(json);
  if (result.code && result.message) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result as T;
}

// =============================================================================
// Main Test
// =============================================================================

async function main() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  FROST Zcash (RedPallas) Signing Ceremony Test');
  console.log('='.repeat(70));
  console.log('  Curve: RedPallas (Pallas with BLAKE2b-512)');
  console.log('  Threshold: 2-of-3');
  console.log('  Feature: Rerandomized signing (ZIP-312)');
  console.log('='.repeat(70));
  console.log('');

  // Load WASM module
  console.log('Loading WASM module...');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const wasmDir = path.join(__dirname, '../src/lib/frost-zcash-wasm/pkg');

  // Check if WASM is built
  const wasmPath = path.join(wasmDir, 'frost_zcash_wasm_bg.wasm');
  if (!fs.existsSync(wasmPath)) {
    console.error('');
    console.error('[ERROR] WASM not built!');
    console.error('');
    console.error('Please build the WASM module first:');
    console.error('  cd src/lib/frost-zcash-wasm');
    console.error('  wasm-pack build --target web');
    console.error('');
    console.error('See src/lib/frost-zcash-wasm/README.md for build requirements.');
    process.exit(1);
  }

  const frostModule = await import('../src/lib/frost-zcash-wasm/pkg/frost_zcash_wasm.js');
  const wasmBytes = fs.readFileSync(wasmPath);
  await frostModule.default(wasmBytes);
  frostModule.init();
  const frost = frostModule;

  console.log('WASM module loaded!\n');

  // Test counters
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
  // STEP 1: Generate Key Shares (2-of-3)
  // ==========================================================================
  console.log('─'.repeat(70));
  console.log('STEP 1: Generate Key Shares (Trusted Dealer)');
  console.log('─'.repeat(70));

  let keygen: KeyGenResult;
  try {
    keygen = parseResult<KeyGenResult>(frost.generate_key_shares(2, 3));
    pass('Generated 2-of-3 key shares');
    log(`Group public key: ${keygen.group_public_key.slice(0, 32)}...`);
    log(`Threshold: ${keygen.threshold}, Total: ${keygen.total}`);
    log(`Shares: ${keygen.shares.map((s) => s.identifier).join(', ')}`);
  } catch (e) {
    fail('Generate key shares', String(e));
    process.exit(1);
  }

  // ==========================================================================
  // STEP 2: Round 1 - Generate Commitments
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 2: Round 1 - Generate Commitments');
  console.log('─'.repeat(70));

  const signers = [keygen.shares[0], keygen.shares[1]]; // First 2 participants
  const round1Results: Round1Result[] = [];

  for (const signer of signers) {
    try {
      const result = parseResult<Round1Result>(
        frost.generate_round1_commitment(signer.key_package)
      );
      round1Results.push(result);
      pass(`Participant ${signer.identifier}: Generated commitment`);
    } catch (e) {
      fail(`Participant ${signer.identifier}: Generate commitment`, String(e));
    }
  }

  if (round1Results.length !== 2) {
    console.log('\n[FATAL] Not enough commitments. Aborting.');
    process.exit(1);
  }

  // ==========================================================================
  // STEP 3: Create Signing Package with Randomizer
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 3: Create Signing Package with Randomizer (ZIP-312)');
  console.log('─'.repeat(70));

  const commitments: CommitmentInfo[] = round1Results.map((r) => r.commitment);
  const commitmentsJson = JSON.stringify(commitments);

  // Message to sign (hex-encoded)
  const messageHex = bytesToHex(
    crypto.createHash('sha256').update('Zcash Orchard Test Transaction').digest()
  );
  log(`Message hash: ${messageHex.slice(0, 32)}...`);

  let signingPackage: SigningPackageResult;
  try {
    signingPackage = parseResult<SigningPackageResult>(
      frost.create_signing_package(commitmentsJson, messageHex, keygen.public_key_package)
    );
    pass('Created signing package with randomizer');
    log(`Commitments: ${commitments.map((c) => c.identifier).join(', ')}`);
    log(`Randomizer: ${signingPackage.randomizer.slice(0, 50)}...`);
  } catch (e) {
    fail('Create signing package', String(e));
    process.exit(1);
  }

  // ==========================================================================
  // STEP 4: Round 2 - Generate Signature Shares
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 4: Round 2 - Generate Signature Shares');
  console.log('─'.repeat(70));

  const signatureShares: SignatureShareInfo[] = [];

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i];
    const round1 = round1Results[i];

    try {
      const share = parseResult<SignatureShareInfo>(
        frost.generate_round2_signature(
          signer.key_package,
          JSON.stringify(round1.nonces),
          signingPackage.signing_package,
          signingPackage.randomizer
        )
      );
      signatureShares.push(share);
      pass(`Participant ${signer.identifier}: Generated signature share`);
    } catch (e) {
      fail(`Participant ${signer.identifier}: Generate signature share`, String(e));
    }
  }

  if (signatureShares.length !== 2) {
    console.log('\n[FATAL] Not enough signature shares. Aborting.');
    process.exit(1);
  }

  // ==========================================================================
  // STEP 5: Aggregate Signature
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 5: Aggregate Signature');
  console.log('─'.repeat(70));

  let aggregateResult: AggregateResult;
  try {
    aggregateResult = parseResult<AggregateResult>(
      frost.aggregate_signature(
        JSON.stringify(signatureShares),
        signingPackage.signing_package,
        keygen.public_key_package,
        signingPackage.randomizer
      )
    );
    pass('Aggregated signature');
    log(`Signature: ${aggregateResult.signature.slice(0, 32)}...`);
  } catch (e) {
    fail('Aggregate signature', String(e));
    process.exit(1);
  }

  // ==========================================================================
  // STEP 6: Verify Signature
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 6: Verify Signature');
  console.log('─'.repeat(70));

  try {
    const verifyResult = parseResult<VerifyResult>(
      frost.verify_signature(
        aggregateResult.signature,
        messageHex,
        keygen.group_public_key,
        signingPackage.randomizer
      )
    );

    if (verifyResult.valid) {
      pass('Signature verification: VALID');
    } else {
      fail('Signature verification', 'Signature is INVALID');
    }
  } catch (e) {
    fail('Verify signature', String(e));
  }

  // ==========================================================================
  // STEP 7: Test Randomization (Different randomizer = different signature)
  // ==========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('STEP 7: Test Randomization');
  console.log('─'.repeat(70));

  try {
    // New round 1 commitments (must use fresh nonces!)
    const newRound1Results: Round1Result[] = [];
    for (const signer of signers) {
      const result = parseResult<Round1Result>(
        frost.generate_round1_commitment(signer.key_package)
      );
      newRound1Results.push(result);
    }

    const newCommitments = newRound1Results.map((r) => r.commitment);
    const newCommitmentsJson = JSON.stringify(newCommitments);

    // Create new signing package with new randomizer
    const newSigningPackage = parseResult<SigningPackageResult>(
      frost.create_signing_package(newCommitmentsJson, messageHex, keygen.public_key_package)
    );

    // Generate signature shares with new signing package
    const newShares: SignatureShareInfo[] = [];
    for (let i = 0; i < signers.length; i++) {
      const share = parseResult<SignatureShareInfo>(
        frost.generate_round2_signature(
          signers[i].key_package,
          JSON.stringify(newRound1Results[i].nonces),
          newSigningPackage.signing_package,
          newSigningPackage.randomizer
        )
      );
      newShares.push(share);
    }

    // Aggregate with new signing package
    const newAggResult = parseResult<AggregateResult>(
      frost.aggregate_signature(
        JSON.stringify(newShares),
        newSigningPackage.signing_package,
        keygen.public_key_package,
        newSigningPackage.randomizer
      )
    );

    // Verify with new randomizer
    const newVerifyResult = parseResult<VerifyResult>(
      frost.verify_signature(
        newAggResult.signature,
        messageHex,
        keygen.group_public_key,
        newSigningPackage.randomizer
      )
    );

    if (newVerifyResult.valid && newAggResult.signature !== aggregateResult.signature) {
      pass('Randomization test');
      log('Different randomizers produce different valid signatures');
      log(`Sig 1: ${aggregateResult.signature.slice(0, 20)}...`);
      log(`Sig 2: ${newAggResult.signature.slice(0, 20)}...`);
    } else if (!newVerifyResult.valid) {
      fail('Randomization test', 'New signature is invalid');
    } else {
      fail('Randomization test', 'Signatures should be different');
    }
  } catch (e) {
    fail('Randomization test', String(e));
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('');
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Curve: RedPallas (Zcash Orchard compatible)`);
  console.log(`  Group public key: ${keygen.group_public_key}`);
  console.log(`  Final signature: ${aggregateResult.signature}`);
  console.log('');
  console.log(`  Tests passed: ${passed}`);
  console.log(`  Tests failed: ${failed}`);
  console.log('='.repeat(70));
  console.log('');

  if (failed > 0) {
    console.log('[RESULT] Some tests failed.');
    process.exit(1);
  } else {
    console.log('[RESULT] All tests passed! Zcash FROST signing ceremony works correctly.');
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
