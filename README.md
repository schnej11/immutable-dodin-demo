# Immutable DoDIN — Federated Merkle Audit Demo

A React dashboard demonstrating a hierarchical Merkle tree audit system for DoDIN endpoints, with real Bitcoin testnet anchoring.

## What it does

Simulates a live event feed from DoDIN endpoints (file saves, AI prompts, CAC logins, network connections) and cryptographically hashes each event using SHA-256. Events roll up into a 4-tier Merkle tree:

| Tier | Level |
|------|-------|
| 1 | Individual NIPR workstations |
| 2 | Installation roots (JBPHH, Al Udeid AB, Peterson SFB) |
| 3 | Regional command roots (INDOPACOM, CENTCOM, USSPACECOM) |
| 4 | Global anchor root → Bitcoin testnet OP_RETURN |

The global root is anchored to the Bitcoin testnet every 5 minutes (30 seconds in demo mode), providing a tamper-evident, immutable audit trail at a cost of 32 bytes per cycle.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your testnet wallet

Generate a wallet if you don't have one:

```bash
node broadcast.js --keygen
```

Fund the printed address at https://coinfaucet.eu/en/btc-testnet/ — funds arrive in ~60 seconds.

Copy the WIF key into `.env`:

```bash
cp .env.example .env
# edit .env and set WIF_KEY=<your key>
```

### 3. Run

```bash
npm run dev
```

This starts both the React UI (http://localhost:5173) and the anchor server (http://localhost:3001) together. The UI will automatically broadcast to the Bitcoin testnet when you click **⚓ Anchor to Testnet**.

> **Note:** Vite is locked to port 5173 (`strictPort: true`). If that port is in use, the dev server will error rather than silently switching ports and breaking the anchor connection.

---

## Dashboard

The UI runs as a full-screen dark ops dashboard with three main columns:

- **Merkle Hierarchy** — live Tier 2–4 roots with integrity status
- **Live Events Feed** — streaming endpoint events with per-event SHA-256 hashes; click **TAMPER** on any event to simulate adversarial log modification
- **Tampered Events** — isolated panel listing all integrity violations with a **↩ RESTORE INTEGRITY** button per event

Below that, a **Tier 1 Endpoint Nodes** grid shows all NIPR workstations with their current Merkle root and CLEAN / TAMPERED / IDLE status.

## Manual broadcast

To broadcast a specific root hash outside the UI:

```bash
node broadcast.js <WIF_KEY> <ROOT_HASH_HEX>
```

Example output:
```
Address : tb1q55pfcqrx66dqr5twphsydakcsvmk597llfmxfn
Root    : b0d6f96e74447e09a5ba210fa9e0022b6d882f9ebe81252498285092c5d2da09
UTXO    : d018308fa916132e8f25f0611ef60159a4b49d4059401004388903219a1f57f6:0 (177384 sats)
Fee     : 1500 sats  Change: 175884 sats

Broadcasting…

✅ Confirmed!
TXID    : 6509251f3bb69b8c01f7dfd6a0cb40db852e5a96a115598e758ac066939406b0
View    : https://blockstream.info/testnet/tx/6509251f3bb69b8c01f7dfd6a0cb40db852e5a96a115598e758ac066939406b0
```

Verify the embedded hash at https://blockstream.info/testnet — look for the `OP_RETURN` output in the transaction.

---

`UNCLASSIFIED // DEMO`
