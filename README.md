# FROST Multi-Sig UI

![Build Status](https://github.com/lamb356/frost-ui/actions/workflows/build.yml/badge.svg)

A Next.js web application for FROST (Flexible Round-Optimized Schnorr Threshold) multi-signature operations, designed for Zcash threshold signing ceremonies.

## Features

- **Threshold Key Generation**: Create t-of-n key shares using trusted dealer key generation
- **Signing Ceremonies**: Coordinate multi-party signing sessions with real-time status
- **WASM Cryptography**: Real FROST operations via WebAssembly (Ed25519 and Orchard/RedPallas)
- **Session Management**: Track active and completed signing sessions
- **frostd Integration**: Connect to frostd server for production ceremony coordination

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
├─────────────────────────────────────────────────────────────┤
│  React Components (shadcn/ui)                               │
│  ├── Key Generation Wizard                                  │
│  ├── Signing Session Manager                                │
│  └── Participant Coordination                               │
├─────────────────────────────────────────────────────────────┤
│  State Management (Zustand)                                 │
│  └── Sessions, Participants, Connection Status              │
├─────────────────────────────────────────────────────────────┤
│  FROST WASM Modules                                         │
│  ├── frost-wasm (Ed25519 signatures)                        │
│  ├── frost-zcash-wasm (Orchard/RedPallas signatures)        │
│  └── Key generation, commitment, signing, aggregation       │
├─────────────────────────────────────────────────────────────┤
│  frostd Connection                                          │
│  └── REST API to frostd server for ceremony coordination    │
└─────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 20+ (required by dependencies)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/lamb356/frost-ui.git
cd frost-ui

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## WASM Build

The FROST cryptography is compiled from Rust to WebAssembly. WASM builds are automated via GitHub Actions, but you can build locally:

### Linux/macOS

```bash
# Install Rust and wasm-pack
curl https://sh.rustup.rs -sSf | sh
cargo install wasm-pack
rustup target add wasm32-unknown-unknown

# Build WASM
./scripts/build-wasm.sh
```

### Windows

See [WASM-INTEGRATION.md](./WASM-INTEGRATION.md) for Windows-specific instructions.

### CI/CD Pipeline

The CI workflow automatically builds WASM modules and commits them back to the repository. This ensures:
- Consistent WASM builds across all contributors
- No local Rust toolchain required for frontend development
- Reproducible builds (Rust 1.88.0 + wasm-pack 0.13.1 pinned)

The workflow only runs on `main` branch pushes and requires all tests to pass before committing artifacts.

**Pipeline steps:**
1. Builds WASM modules on Ubuntu (avoiding Windows toolchain issues)
2. Runs linter and builds Next.js application
3. Runs automated tests against WASM modules
4. Commits WASM artifacts back to repository (main branch only)

## Project Structure

```
frost-ui/
├── src/
│   ├── app/                    # Next.js app router pages
│   │   ├── page.tsx            # Home/Dashboard
│   │   ├── sessions/           # Signing sessions
│   │   └── settings/           # Configuration
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui components
│   │   └── frost/              # FROST-specific components
│   └── lib/
│       ├── frost-wasm/         # Rust WASM module
│       │   ├── src/lib.rs      # FROST bindings
│       │   ├── Cargo.toml      # Rust dependencies
│       │   └── loader.ts       # TypeScript WASM loader
│       ├── hooks/              # React hooks
│       └── store.ts            # Zustand state
├── .github/workflows/          # CI/CD
└── scripts/                    # Build scripts
```

## Documentation

- [WASM Integration](./WASM-INTEGRATION.md) - Details on the FROST WASM module

## Development

```bash
# Run development server
npm run dev

# Type check
npm run lint

# Build for production
npm run build
```

## Testing

### CI Tests (automated)

The following tests run automatically in CI after WASM is built:

```bash
npm test  # Runs Zcash WASM tests (9 tests)
```

### Integration Tests (manual, requires frostd)

These tests require a running frostd server (see setup below):

```bash
# Ed25519 signing ceremony against live frostd (33 tests)
npm run test:ed25519 -- https://localhost:2745

# Zcash/Orchard signing ceremony against live frostd (34 tests)
npm run test:zcash-live -- https://localhost:2745
```

### Test Summary

| Suite | Tests | CI | Description |
|-------|-------|-----|-------------|
| Zcash WASM | 9 | ✅ | Local cryptographic correctness |
| Ed25519 Live | 33 | Manual | Full ceremony against frostd |
| Zcash Live | 34 | Manual | Full Orchard ceremony against frostd |
| **Total** | **76+** | | |

## Testing with frostd

To test the client against a real frostd server:

### 1. Install frostd

```bash
cargo install frostd
```

### 2. Generate TLS Certificates

frostd requires TLS. Use [mkcert](https://github.com/FiloSottile/mkcert) for local development:

```bash
# Install mkcert (macOS)
brew install mkcert

# Install mkcert (Linux)
# See https://github.com/FiloSottile/mkcert#installation

# Generate local CA and certs
mkcert -install
mkcert localhost
```

### 3. Run frostd

```bash
frostd --cert localhost.pem --key localhost-key.pem
```

Default port is 2745.

### 4. Run Smoke Test

```bash
# Test against local frostd
npx tsx scripts/test-frostd.ts

# Or specify a custom URL
npx tsx scripts/test-frostd.ts https://localhost:2745
```

The smoke test validates the complete authentication and session flow:
- Challenge/response authentication with XEdDSA
- Session creation, listing, and info retrieval
- Message send/receive
- Session cleanup

## Security Considerations

- **Secret Key Storage**: Signing shares must never be logged or stored unencrypted
- **Nonce Reuse**: Nonces are single-use and bound to message_id; reuse compromises security
- **TLS Required**: All frostd communication must use TLS to prevent MITM attacks

## Related Projects

- [FROST](https://github.com/ZcashFoundation/frost) - FROST implementation in Rust
- [frostd](https://github.com/ZcashFoundation/frost) - FROST daemon for ceremony coordination

## License

MIT
