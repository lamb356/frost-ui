# FROST WASM Integration

This document describes the integration of real FROST cryptographic operations via WebAssembly.

## Production Readiness Summary

| Component | Status | Tests | Notes |
|-----------|--------|-------|-------|
| **XEdDSA Auth** | ✅ Production | 10 | Spec-compliant XEdDSA signatures (Signal Protocol) |
| **FROST Ed25519** | ✅ Production | 33 | Full signing ceremony with E2E encryption |
| **FROST RedPallas** | ✅ Production | 9 | Zcash Orchard compatible with rerandomization |
| **State Machines** | ✅ Production | - | Message-log driven, validation, deduplication |
| **E2E Encryption** | ✅ Production | - | X25519 ECDH + AES-256-GCM |
| **frostd Client** | ✅ Production | - | Matches official spec |

## WASM Modules

### 1. frost-wasm (Ed25519)

Standard FROST threshold signatures using Ed25519 curve.

**Location:** `src/lib/frost-wasm/`

**Features:**
- Key generation with trusted dealer
- Round 1 commitment generation
- Round 2 signature share generation
- Signature aggregation and verification
- JSON serialization via serde

### 2. xeddsa-wasm (Authentication)

XEdDSA signatures for frostd authentication.

**Location:** `src/lib/xeddsa-wasm/`

**Features:**
- X25519 key generation
- XEdDSA signing (allows X25519 keys to sign)
- UUID binary signing (16-byte format per spec)
- Verification

### 3. frost-zcash-wasm (RedPallas/Orchard)

FROST rerandomized signatures for Zcash Orchard.

**Location:** `src/lib/frost-zcash-wasm/`

**Features:**
- RedPallas curve (Pallas with BLAKE2b-512)
- Rerandomized FROST (ZIP-312)
- Transaction unlinkability via randomizer
- Full signing ceremony support

**Dependency:** Pinned to `reddsa` commit `3f737fd4d8a341360c75243a24fea47edba9f4f0`

## Running Tests

### Ed25519 Full Ceremony (33 tests)

Tests complete signing ceremony against live frostd server:

```bash
# Start frostd first (in WSL with TLS certs)
wsl bash -c "~/.cargo/bin/frostd --tls-cert localhost.pem --tls-key localhost-key.pem --ip 127.0.0.1 --port 2745 &"

# Run test
npx tsx scripts/test-ceremony.ts https://localhost:2745
```

**Test Coverage:**
- Keypair generation (3 participants)
- Authentication with frostd (XEdDSA)
- FROST key share generation (2-of-3)
- Session creation
- E2E encrypted message exchange
- Round 1 commitments
- Round 2 signature shares
- Signature aggregation
- Verification

### Zcash RedPallas Ceremony (9 tests)

Tests complete rerandomized signing locally:

```bash
npx tsx scripts/test-zcash-ceremony.ts
```

**Test Coverage:**
- Key generation (2-of-3)
- Round 1 commitments
- Signing package with randomizer (ZIP-312)
- Round 2 signature shares
- Aggregation
- Verification
- Randomization test (different randomizers = different valid signatures)

### XEdDSA Authentication (10 tests)

Tests authentication against frostd:

```bash
npx tsx scripts/test-frostd.ts https://localhost:2745
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
├─────────────────────────────────────────────────────────────┤
│  State Machines (src/lib/state-machines/)                    │
│  ├── coordinator-machine.ts - Manages signing ceremonies     │
│  ├── participant-machine.ts - Participant state management   │
│  └── validation.ts - Message validation, deduplication       │
├─────────────────────────────────────────────────────────────┤
│  Crypto Module (src/lib/crypto/)                             │
│  ├── XEdDSA signing via Rust WASM                           │
│  ├── X25519 ECDH via @noble/curves                          │
│  └── AES-GCM via WebCrypto API                              │
├─────────────────────────────────────────────────────────────┤
│  WASM Modules                                                │
│  ├── frost-wasm (Ed25519) - Standard FROST                  │
│  ├── xeddsa-wasm - Authentication signatures                │
│  └── frost-zcash-wasm (RedPallas) - Zcash Orchard           │
├─────────────────────────────────────────────────────────────┤
│  Message Types (src/types/messages.ts)                       │
│  ├── Wire envelope format {v, sid, id, t, from, ts, payload}│
│  ├── SIGNING_PACKAGE, ROUND1_COMMITMENT, COMMITMENTS_SET    │
│  ├── ROUND2_SIGNATURE_SHARE, SIGNATURE_RESULT, ABORT        │
│  └── Factory functions and serialization                     │
└─────────────────────────────────────────────────────────────┘
```

## State Machine Design

State machines are message-log driven and production-ready:

### Coordinator Machine States
```
Idle → CreatingSession → Waiting → Round1Collect → Round2Send
     → Round2Collect → Aggregating → Broadcasting → Complete
```

### Participant Machine States
```
Idle → Ready → AwaitSigning → Round1 → SendingCommitment
     → AwaitCommitments → Confirm → Round2 → SendingShare
     → AwaitResult → Complete
```

### Key Features
- Single source of truth = message log
- Strict message validation at ingress
- Deduplication via message ID tracking
- Nonce reuse protection via nonceMessageId
- Timeout handling (120s per round, 600s session)

## E2E Encryption

All messages between participants are E2E encrypted:

1. **Key Exchange:** X25519 ECDH (ephemeral + recipient public key)
2. **Key Derivation:** HKDF-SHA256 with "frost-e2e" info
3. **Encryption:** AES-256-GCM with 12-byte nonce
4. **Message Format:** `{ephemeralPubkey, nonce, ciphertext}` (hex-encoded)

The frostd server cannot read message contents.

## XEdDSA Authentication

Authentication uses XEdDSA (Signal Protocol) to allow a single X25519 keypair for both ECDH and signing:

| Step | Description |
|------|-------------|
| **Key Generation** | Generate X25519 keypair (32-byte private key) |
| **Public Key Derivation** | Derive Ed25519 public key via XEdDSA (sign bit = 0) |
| **Challenge Signing** | Sign UUID as 16-byte binary (not 36-byte string) |
| **Verification** | frostd verifies using the Ed25519 public key |

## Challenge Signing (UUID Binary Format)

The frostd `/challenge` endpoint returns a UUID. Per spec, sign as **16-byte binary**:

| Format | Bytes | Example |
|--------|-------|---------|
| UTF-8 String | 36 bytes | `"550e8400-e29b-41d4-a716-446655440000"` |
| Binary (Correct) | 16 bytes | `0x55 0x0e 0x84 0x00 0xe2 0x9b ...` |

## Build Instructions

### Prerequisites

1. **Rust** (1.70+): https://rustup.rs/
2. **wasm-pack**: `cargo install wasm-pack`
3. **wasm32-unknown-unknown target**: `rustup target add wasm32-unknown-unknown`

### Building All WASM Modules

```bash
# frost-wasm (Ed25519)
cd src/lib/frost-wasm
wasm-pack build --target web --out-dir pkg

# xeddsa-wasm (Authentication)
cd src/lib/xeddsa-wasm
wasm-pack build --target web --out-dir pkg

# frost-zcash-wasm (RedPallas)
cd src/lib/frost-zcash-wasm
wasm-pack build --target web --out-dir pkg
```

### CI/CD

GitHub Actions builds all three WASM modules on Linux and commits the built artifacts.

## Zcash Curve Support

| Zcash Pool | Crate | Curve | Status |
|------------|-------|-------|--------|
| Orchard (NU5+) | `reddsa` + `frost-rerandomized` | RedPallas | ✅ Implemented |
| Sapling | `reddsa::frost::redjubjub` | RedJubjub | Future work |
| Transparent | `frost-secp256k1` | secp256k1 | Not planned |

## API Reference

### frost-zcash-wasm (RedPallas)

#### `generate_key_shares(threshold, total)`

Generates key shares using trusted dealer.

**Returns:**
```typescript
{
  group_public_key: string,    // Hex (32 bytes)
  public_key_package: string,  // JSON (for aggregation)
  shares: [{
    identifier: number,
    key_package: string        // JSON (KEEP SECRET!)
  }],
  threshold: number,
  total: number
}
```

#### `generate_round1_commitment(key_package_json)`

Generates Round 1 commitment and nonces.

**Returns:**
```typescript
{
  commitment: {
    identifier: number,
    commitment: string    // JSON (broadcast this)
  },
  nonces: {
    identifier: number,
    nonces: string        // JSON (KEEP SECRET!)
  }
}
```

#### `create_signing_package(commitments_json, message_hex, public_key_package_json)`

Creates signing package with randomizer (ZIP-312).

**Returns:**
```typescript
{
  signing_package: string,  // JSON
  randomizer: string        // JSON (distribute to signers)
}
```

#### `generate_round2_signature(key_package, nonces, signing_package, randomizer)`

Generates Round 2 signature share with rerandomization.

**Returns:**
```typescript
{
  identifier: number,
  share: string  // JSON signature share
}
```

#### `aggregate_signature(shares, signing_package, public_key_package, randomizer)`

Aggregates signature shares into final signature.

**Returns:**
```typescript
{
  signature: string,   // Hex (64 bytes)
  randomizer: string   // JSON (for verification)
}
```

#### `verify_signature(signature_hex, message_hex, group_public_key_hex, randomizer_json)`

Verifies a rerandomized FROST signature.

**Returns:** `{ "valid": true/false }`

## What's Complete

✅ FROST Ed25519 with full ceremony (33 tests pass)
✅ FROST RedPallas for Zcash Orchard (9 tests pass)
✅ XEdDSA authentication (10 tests pass)
✅ E2E encryption (X25519 ECDH + AES-GCM)
✅ Production state machines (message-log driven)
✅ Message validation and deduplication
✅ CI/CD builds for all WASM modules
✅ frostd client matching spec

## Future Work

- [ ] Distributed Key Generation (DKG) - currently uses trusted dealer
- [ ] Key resharing capability
- [ ] RedJubjub support for Zcash Sapling
- [ ] Security audit of crypto code
- [ ] Mobile wallet integration

## Security Considerations

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

Key points:
- Nonces are never reused (tracked per message_id)
- Messages are deduplicated by ID
- Key shares encrypted at rest (PBKDF2 + AES-GCM)
- E2E encryption (server cannot read contents)
- Trusted dealer model (DKG is future work)
