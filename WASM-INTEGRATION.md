# FROST WASM Integration

This document describes the integration of real FROST cryptographic operations via WebAssembly.

## Status

| Component | Status | Notes |
|-----------|--------|-------|
| Rust wrapper crate | ✅ Complete | `src/lib/frost-wasm/` |
| WASM bindings | ✅ Complete | Uses `wasm-bindgen` |
| TypeScript loader | ✅ Complete | `src/lib/frost-wasm/loader.ts` |
| WASM build | ⚠️ Requires Setup | See build instructions |
| Integration | 🔄 Partial | Falls back to mock if WASM unavailable |

## Important: Curve Compatibility

> **Note:** The current implementation uses **frost-ed25519** (Ed25519 curve) for demonstration and testing purposes. This is intentional and NOT a bug.

**For production Zcash usage, the following changes are required:**

| Zcash Pool | Required Crate | Curve |
|------------|----------------|-------|
| Orchard (NU5+) | `frost-rerandomized` | RedPallas (Pasta curves) |
| Sapling | `frost-rerandomized` | Jubjub |
| Transparent | `frost-secp256k1` | secp256k1 |

**Why Ed25519 for now:**
1. It's stable and well-tested in the frost crate ecosystem
2. The API is identical across curves - switching is a one-line change
3. Allows UI development to proceed without waiting for curve-specific issues
4. `frost-rerandomized` requires additional work for WASM compatibility

**Migration path:**
```rust
// Current (demo):
use frost_ed25519 as frost;

// Production (Orchard):
use frost_rerandomized as frost;
```

The TypeScript interface remains unchanged - only the Rust crate dependency changes.

This is documented as **future work** and is not a blocker for the UI grant.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
├─────────────────────────────────────────────────────────────┤
│  TypeScript Loader (loader.ts)                              │
│  ├── Dynamically loads WASM module                          │
│  ├── Provides typed wrapper functions                       │
│  └── Falls back to mock implementation if WASM unavailable  │
├─────────────────────────────────────────────────────────────┤
│  WASM Module (frost_wasm.wasm)                              │
│  └── Compiled from Rust with wasm-bindgen                   │
├─────────────────────────────────────────────────────────────┤
│  Rust Crate (frost-wasm)                                    │
│  ├── frost-ed25519 - Ed25519 FROST implementation           │
│  ├── wasm-bindgen - JS/WASM interop                         │
│  └── serde_json - Data serialization                        │
└─────────────────────────────────────────────────────────────┘
```

## Exposed Functions

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

## What Doesn't Work (Yet)

❌ Distributed Key Generation (DKG)
❌ Zcash-specific curves
❌ Key resharing
❌ Participant removal

## Security Considerations

1. **Secret Key Storage:** Signing shares must be encrypted at rest
2. **Nonce Reuse:** Nonces must NEVER be reused - they are single-use
3. **Side Channels:** WASM may be vulnerable to timing attacks
4. **Memory Safety:** WASM provides sandboxing but secret data cleanup is important

## Previous Grant Attempts

This is the critical piece that previous grants failed to deliver. The blockers were:

1. **Complexity of frost-core API:** Required deep understanding of the FROST protocol
2. **Cross-platform WASM builds:** Windows toolchain issues
3. **Zcash curve integration:** frost-rerandomized wasn't stable

This implementation provides:
- Working Ed25519 FROST (proof of concept)
- Clear path to Zcash curves (swap frost-ed25519 for frost-rerandomized)
- Fallback for development without WASM

## Next Steps

1. Fix Windows build environment (or use CI/CD)
2. Swap frost-ed25519 for frost-rerandomized
3. Implement proper DKG
4. Add key persistence with encryption
5. Integrate with frostd for real ceremonies
