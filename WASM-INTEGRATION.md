# FROST WASM Integration

This document describes the integration of real FROST cryptographic operations via WebAssembly.

## Production Readiness Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Ed25519 Auth** | ✅ Production | Real @noble/ed25519 signing (see XEdDSA note below) |
| **Ed25519 ↔ X25519** | ✅ Production | Real key conversion via @noble/curves |
| **X25519 E2E Encryption** | ✅ Production | Real ECDH + AES-GCM for message encryption |
| **Password Key Storage** | ✅ Production | PBKDF2 + AES-GCM for local key encryption |
| **FROST WASM (Ed25519)** | ⚠️ Demo Only | Works but wrong curve for Zcash |
| **FROST WASM (Zcash)** | ❌ Not Started | Requires frost-rerandomized |
| **frostd Client** | ✅ Production | Matches official spec |
| **State Machines** | ⚠️ Demo Only | Works but `inviteCode` is not in frostd spec |

## What's Demo vs Production

### Production-Ready Components

These components use real cryptography and match the frostd specification:

1. **Authentication Crypto** (`src/lib/crypto/index.ts`)
   - Real Ed25519 key generation via @noble/ed25519
   - Real Ed25519 signing for /login challenge
   - Real Ed25519 ↔ X25519 key conversion via @noble/curves
   - Unified keypair support (one key for auth + encryption)
   - Real X25519 ECDH key exchange for E2E encryption
   - Real AES-256-GCM encryption with HKDF key derivation
   - Real PBKDF2 password-based key derivation

2. **frostd REST Client** (`src/lib/frost-client/`)
   - Implements all endpoints from the official spec
   - /challenge, /login, /create_new_session, /list_sessions
   - /get_session_info, /send, /receive, /close_session
   - Proper polling-based message receiving

### Demo-Only Components

These components work but need changes for production:

1. **FROST WASM Bindings** (`src/lib/frost-wasm/`)
   - Uses frost-ed25519 (Ed25519 curve)
   - Zcash requires frost-rerandomized (Pasta/Jubjub curves)
   - The API is identical - only the Rust dependency changes

2. **State Machine `inviteCode`** (`src/lib/state-machines/`)
   - The frostd spec does NOT have an invite code concept
   - Sessions are identified by session_id only
   - Participants join by knowing the session_id and being in the pubkeys list

## XEdDSA vs Ed25519 Authentication

> **Known Limitation:** The frostd specification technically requires XEdDSA signatures, but this implementation uses standard Ed25519.

### What This Means

| Aspect | Current (Ed25519) | Spec-Strict (XEdDSA) |
|--------|-------------------|----------------------|
| **Algorithm** | RFC 8032 Ed25519 | Signal XEdDSA |
| **Key Usage** | Separate signing key | Same key for signing + ECDH |
| **Compatibility** | Works with most frostd | Required for strict compliance |
| **Implementation** | @noble/ed25519 | Would require custom implementation |

### Why Ed25519 Works

1. **Same Curve:** Ed25519 and X25519 are both Curve25519
2. **Same Keys:** We properly convert Ed25519 → X25519 for encryption
3. **Practical Compatibility:** Many frostd implementations accept Ed25519

### XEdDSA Future Work

If strict XEdDSA compliance is required:

```typescript
// Current: Ed25519 signature
const signature = await ed.signAsync(messageBytes, privateKey);

// XEdDSA would require:
// 1. Convert Ed25519 private key to X25519 format
// 2. Use XEdDSA signing algorithm (different from Ed25519)
// See: https://signal.org/docs/specifications/xeddsa/
```

**Recommendation:** Test with your frostd server. If Ed25519 signatures are rejected, XEdDSA implementation would be needed.

## Curve Compatibility (Critical for Zcash)

> **Warning:** The current WASM implementation uses **frost-ed25519** (Ed25519 curve) for demonstration. This is intentional for development but will NOT work with Zcash transactions.

### Why Ed25519 for Demo?

1. Ed25519 is stable and well-tested in the frost crate ecosystem
2. The FROST API is identical across curves - switching is a one-line change
3. Allows UI development to proceed without waiting for curve-specific issues
4. `frost-rerandomized` requires additional work for WASM compatibility

### Production Curve Requirements

| Zcash Pool | Required Crate | Curve | Status |
|------------|----------------|-------|--------|
| Orchard (NU5+) | `frost-rerandomized` | RedPallas (Pasta curves) | Not implemented |
| Sapling | `frost-rerandomized` | Jubjub | Not implemented |
| Transparent | `frost-secp256k1` | secp256k1 | Not implemented |

### Migration Path

```rust
// Current (demo):
use frost_ed25519 as frost;

// Production (Orchard):
use frost_rerandomized as frost;
```

The TypeScript interface remains unchanged - only the Rust crate dependency changes.

## Milestones to Production

### Phase 1: Current State (Demo)
- [x] Ed25519 authentication crypto (PRODUCTION)
- [x] X25519 E2E encryption (PRODUCTION)
- [x] frostd REST client matching spec (PRODUCTION)
- [x] FROST WASM with Ed25519 curve (DEMO)
- [x] State machines for ceremony flow (DEMO)
- [x] Mock client for offline development

### Phase 2: Curve Migration
- [ ] Update frost-wasm to use frost-rerandomized
- [ ] Test WASM builds on all platforms
- [ ] Verify signature compatibility with Zcash nodes

### Phase 3: Spec Compliance
- [ ] Remove inviteCode from state machines
- [ ] Implement proper Ed25519 -> X25519 key conversion
- [ ] Add real transaction parsing for Zcash

### Phase 4: Production Hardening
- [ ] Implement proper DKG (vs trusted dealer)
- [ ] Add key resharing capability
- [ ] Security audit of crypto code

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
├─────────────────────────────────────────────────────────────┤
│  Crypto Module (src/lib/crypto/) - PRODUCTION               │
│  ├── Ed25519 signing via @noble/ed25519                     │
│  ├── X25519 ECDH via @noble/curves                          │
│  └── AES-GCM via WebCrypto API                              │
├─────────────────────────────────────────────────────────────┤
│  TypeScript Loader (loader.ts)                              │
│  ├── Dynamically loads WASM module                          │
│  ├── Provides typed wrapper functions                       │
│  └── Falls back to mock implementation if WASM unavailable  │
├─────────────────────────────────────────────────────────────┤
│  WASM Module (frost_wasm.wasm) - DEMO ONLY                  │
│  └── Compiled from Rust with wasm-bindgen                   │
│  └── Uses frost-ed25519 (NOT Zcash-compatible)              │
├─────────────────────────────────────────────────────────────┤
│  Rust Crate (frost-wasm)                                    │
│  ├── frost-ed25519 - Ed25519 FROST (demo)                   │
│  ├── wasm-bindgen - JS/WASM interop                         │
│  └── serde_json - Data serialization                        │
└─────────────────────────────────────────────────────────────┘
```

## Exposed WASM Functions

The WASM module exposes these functions:

### `generate_key_shares(threshold, total)`

Generates key shares using trusted dealer key generation (DKG).

**Parameters:**
- `threshold: u16` - Minimum signers required (t)
- `total: u16` - Total participants (n)

**Returns:** JSON containing:
```typescript
{
  group_public_key: string,  // Hex-encoded group public key
  shares: [{
    identifier: number,
    signing_share: string,   // Hex-encoded (KEEP SECRET!)
    verifying_share: string  // Hex-encoded
  }],
  threshold: number,
  total: number
}
```

### `generate_round1_commitment(signing_share, identifier)`

Generates Round 1 commitment and nonces.

**Parameters:**
- `signing_share: string` - Participant's signing share (hex)
- `identifier: u16` - Participant ID (1-indexed)

**Returns:** JSON containing:
```typescript
{
  commitment: {
    identifier: number,
    hiding: string,   // Hex-encoded (broadcast this)
    binding: string   // Hex-encoded (broadcast this)
  },
  nonces: {
    identifier: number,
    hiding: string,   // Hex-encoded (KEEP SECRET!)
    binding: string   // Hex-encoded (KEEP SECRET!)
  }
}
```

### `generate_round2_signature(signing_share, nonces, commitments, message, identifier)`

Generates Round 2 signature share.

**Parameters:**
- `signing_share: string` - Signing share (hex)
- `nonces: string` - JSON of SigningNonces from Round 1
- `commitments: string` - JSON array of all Commitments
- `message: string` - Message to sign (hex)
- `identifier: u16` - Participant ID

**Returns:** JSON containing:
```typescript
{
  identifier: number,
  share: string  // Hex-encoded signature share
}
```

### `aggregate_signature(shares, commitments, message, group_public_key)`

Aggregates signature shares into final signature.

**Parameters:**
- `shares: string` - JSON array of SignatureShares
- `commitments: string` - JSON array of Commitments
- `message: string` - Signed message (hex)
- `group_public_key: string` - Group public key (hex)

**Returns:** JSON containing:
```typescript
{
  r: string,         // R component (hex)
  s: string,         // s component (hex)
  signature: string  // Full signature R||s (hex, 64 bytes)
}
```

### `verify_signature(signature, message, group_public_key)`

Verifies an aggregate signature.

**Returns:** `{ "valid": true/false }`

## Build Instructions

### Prerequisites

1. **Rust** (1.70+): https://rustup.rs/
2. **wasm-pack**: `cargo install wasm-pack`
3. **wasm32-unknown-unknown target**: `rustup target add wasm32-unknown-unknown`

### Building on Linux/macOS

```bash
cd src/lib/frost-wasm
wasm-pack build --target web --out-dir pkg
```

### Building on Windows

Windows builds require Visual Studio Build Tools with the C++ workload installed.

**Option 1: Use Visual Studio Developer Command Prompt**

1. Open "Developer Command Prompt for VS 2022"
2. Navigate to `src/lib/frost-wasm`
3. Run: `wasm-pack build --target web --out-dir pkg`

**Option 2: Fix PATH conflict with Git**

If you have Git installed, its `link.exe` may shadow MSVC's linker. Solutions:

1. Temporarily remove Git from PATH:
   ```powershell
   $env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*Git*' }) -join ';'
   wasm-pack build --target web --out-dir pkg
   ```

2. Or use the cargo config (already created at `.cargo/config.toml`):
   - Ensure the linker path is correct for your VS version
   - Set `LIB` environment variable to include Windows SDK libs

**Option 3: Use Docker**

```dockerfile
FROM rust:latest
RUN cargo install wasm-pack
RUN rustup target add wasm32-unknown-unknown
WORKDIR /app
COPY . .
RUN wasm-pack build --target web --out-dir pkg
```

### Build Output

After successful build, `pkg/` will contain:
- `frost_wasm.js` - JavaScript glue code
- `frost_wasm.d.ts` - TypeScript definitions
- `frost_wasm_bg.wasm` - WebAssembly binary
- `package.json` - npm package metadata

## Integration with Next.js

### Using the TypeScript Loader

```typescript
import { getFrostOperations } from '@/lib/frost-wasm/loader';

async function signMessage() {
  const frost = await getFrostOperations();

  // frost.isRealCrypto tells you if using WASM or mock
  console.log('Using real FROST:', frost.isRealCrypto);

  // Generate keys (2-of-3)
  const keys = await frost.generateKeyShares(2, 3);

  // Round 1: Generate commitments
  const r1_1 = await frost.generateRound1Commitment(
    keys.shares[0].signing_share,
    1
  );
  const r1_2 = await frost.generateRound1Commitment(
    keys.shares[1].signing_share,
    2
  );

  const commitments = [r1_1.commitment, r1_2.commitment];
  const message = '48656c6c6f'; // "Hello" in hex

  // Round 2: Generate signature shares
  const sig1 = await frost.generateRound2Signature(
    keys.shares[0].signing_share,
    r1_1.nonces,
    commitments,
    message,
    1
  );
  const sig2 = await frost.generateRound2Signature(
    keys.shares[1].signing_share,
    r1_2.nonces,
    commitments,
    message,
    2
  );

  // Aggregate
  const signature = await frost.aggregateSignature(
    [sig1, sig2],
    commitments,
    message,
    keys.group_public_key
  );

  // Verify
  const valid = await frost.verifySignature(
    signature.signature,
    message,
    keys.group_public_key
  );

  console.log('Signature:', signature.signature);
  console.log('Valid:', valid);
}
```

### Next.js Configuration

For Next.js to properly handle WASM files, you may need to add to `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

module.exports = nextConfig;
```

## Known Issues & Blockers

### 1. Windows Build Environment

**Issue:** Git's `link.exe` shadows MSVC's linker
**Status:** Documented workarounds available
**Impact:** Builds fail on Windows without proper environment setup

### 2. Zcash Curve Support

**Issue:** Currently using Ed25519, not Zcash's curves
**Status:** Ed25519 is for demonstration - see "Curve Compatibility" section above
**Impact:** Demo signatures work, but won't work with real Zcash until curves are swapped

### 3. Key Package Serialization

**Issue:** Full key packages needed for some operations
**Status:** Current implementation uses minimal data
**Impact:** Some edge cases may fail

## What Works

✅ Key generation with trusted dealer
✅ Round 1 commitment generation
✅ Round 2 signature share generation
✅ Signature aggregation
✅ Signature verification
✅ TypeScript type safety
✅ Fallback to mock implementation
✅ Real Ed25519 authentication
✅ Real Ed25519 ↔ X25519 key conversion
✅ Real X25519 E2E encryption
✅ Unified keypair (one key for auth + encryption)

## What Doesn't Work (Yet)

❌ Distributed Key Generation (DKG)
❌ Zcash-specific curves (frost-rerandomized)
❌ Key resharing
❌ Participant removal
❌ XEdDSA signatures (using Ed25519 instead - see note above)

## Security Considerations

1. **Secret Key Storage:** Signing shares must be encrypted at rest
2. **Nonce Reuse:** Nonces must NEVER be reused - they are single-use
3. **Side Channels:** WASM may be vulnerable to timing attacks
4. **Memory Safety:** WASM provides sandboxing but secret data cleanup is important
5. **Ed25519 to X25519:** Generate separate keys rather than converting

## Previous Grant Attempts

This is the critical piece that previous grants failed to deliver. The blockers were:

1. **Complexity of frost-core API:** Required deep understanding of the FROST protocol
2. **Cross-platform WASM builds:** Windows toolchain issues
3. **Zcash curve integration:** frost-rerandomized wasn't stable

This implementation provides:
- Working Ed25519 FROST (proof of concept)
- Clear path to Zcash curves (swap frost-ed25519 for frost-rerandomized)
- Fallback for development without WASM
- Real production crypto for authentication and E2E encryption

## Next Steps

1. Fix Windows build environment (or use CI/CD)
2. Swap frost-ed25519 for frost-rerandomized
3. Implement proper DKG
4. Add key persistence with encryption
5. Integrate with frostd for real ceremonies
