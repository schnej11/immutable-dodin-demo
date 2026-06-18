# Immutable DoDIN — Federated Merkle Audit Demo

A React component demonstrating a hierarchical Merkle tree audit system for DoDIN endpoints, with Bitcoin testnet anchoring.

## What it does

Simulates a live event feed from DoDIN endpoints (file saves, AI prompts, logins, network connections) and cryptographically hashes each event using SHA-256. Events are organized into a 4-tier Merkle tree:

| Tier | Level |
|------|-------|
| 1 | Individual endpoints (NIPR workstations) |
| 2 | Base/installation roots |
| 3 | Regional gateway roots (EUCOM, INDOPACOM, CENTCOM) |
| 4 | Global anchor root → Bitcoin testnet OP_RETURN |

The global root is anchored to the Bitcoin testnet every 5 minutes (30 seconds in demo mode), providing a tamper-evident, immutable audit trail at a cost of 32 bytes per cycle.

## Tamper detection

Click **Tamper** on any live event to simulate an adversarial log modification. The Merkle root instantly invalidates and a quarantine alert fires showing the exact endpoint, file, and root hash mismatch.

## Running the UI

```bash
npm install
npm run dev
```

Open http://localhost:5173. The **Blockchain Anchor** tab shows the current global root hash.

## Blockchain anchoring

`broadcast.js` signs and broadcasts a real Bitcoin testnet `OP_RETURN` transaction embedding the 32-byte Merkle root.

### 1. Generate a testnet wallet

```bash
node broadcast.js --keygen
```

This prints an address and WIF private key. Save both.

### 2. Fund the address

Get free testnet BTC from a faucet (e.g. https://coinfaucet.eu/en/btc-testnet/). Paste your address and submit — funds arrive in ~60 seconds.

### 3. Broadcast

Copy the 64-character hex root hash from the **Blockchain Anchor** tab in the UI, then run:

```bash
node broadcast.js <WIF_KEY> <ROOT_HASH_HEX>
```

Example output:
```
Address : tb1q55pfcqrx66dqr5twphsydakcsvmk597llfmxfn
Root    : b0d6f96e74447e09a5ba210fa9e0022b6d882f9ebe81252498285092c5d2da09
UTXO    : d018308f...f57f6:0 (177384 sats)
Fee     : 1500 sats  Change: 175884 sats

Broadcasting…

✅ Confirmed!
TXID    : 6509251f3bb69b8c01f7dfd6a0cb40db852e5a96a115598e758ac066939406b0
View    : https://blockstream.info/testnet/tx/6509251f...
```

Verify the embedded hash at https://blockstream.info/testnet — look for the `OP_RETURN` output in the transaction.

## Usage as a component

Drop `immutable-dodin-demo.jsx` into any React project and render `<App />`. No external dependencies beyond React itself — SHA-256 uses the browser's native `crypto.subtle` API.

```jsx
import App from './immutable-dodin-demo';

export default function Page() {
  return <App />;
}
```

---

`UNCLASSIFIED // DEMO`
