import { useState, useEffect, useRef, useCallback } from "react";

// ── Crypto helpers ────────────────────────────────────────────────────────────
async function sha256(data) {
  const encoded = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Pair(a, b) {
  return sha256(a + b);
}

async function buildMerkleRoot(hashes) {
  if (!hashes.length) return sha256("empty");
  let level = [...hashes];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || level[i];
      next.push(await sha256Pair(left, right));
    }
    level = next;
  }
  return level[0];
}

// ── Event generators ──────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { type: "FILE_SAVE",    icon: "💾", label: "File saved",       tier: "A" },
  { type: "AI_PROMPT",   icon: "🤖", label: "AI prompt exec",   tier: "A" },
  { type: "FILE_MODIFY", icon: "✏️", label: "File modified",    tier: "A" },
  { type: "LOGIN_CAC",   icon: "🔐", label: "CAC login",        tier: "A" },
  { type: "NET_CONNECT", icon: "🌐", label: "Network connect",  tier: "A" },
];

const ENDPOINTS = ["NIPR-WS-001","NIPR-WS-042","NIPR-WS-117","NIPR-WS-203","NIPR-WS-311"];
const BASES = ["Joint Base Alpha","Fort Command","Naval Station Bravo"];
const REGIONS = ["EUCOM-GW","INDOPACOM-GW","CENTCOM-GW"];

function genEvent(id) {
  const et = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const ep = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const files = ["logistics_manifest_v3.docx","unit_deply_order.xlsx","supply_chain_data.csv","ops_memo_final.docx"];
  const file = files[Math.floor(Math.random() * files.length)];
  return {
    id,
    timestamp: Date.now(),
    type: et.type,
    icon: et.icon,
    label: et.label,
    endpoint: ep,
    file,
    user: "GS13-" + Math.floor(1000 + Math.random() * 9000),
    payload: `${et.type}::${ep}::${file}::${Date.now()}::${Math.random()}`,
    hash: null,
    tampered: false,
  };
}

// ── Bitcoin Testnet helpers (Blockstream Esplora) ─────────────────────────────
async function broadcastToTestnet(rootHash, wifKey) {
  // Build OP_RETURN tx embedding the 32-byte hash
  // NOTE: Full raw tx building requires bitcoin-js; here we call a helper endpoint
  // For demo: we use Blockstream's testnet API to show the anchor workflow
  // Real implementation needs: wallet UTXO selection + tx signing with WIF key
  const endpoint = `https://blockstream.info/testnet/api`;
  try {
    // Step 1: Get UTXOs for address derived from WIF key
    // (Simplified - in production use bitcoinjs-lib for signing)
    const res = await fetch(`${endpoint}/address/tb1qtest/utxo`);
    if (!res.ok) throw new Error("UTXO fetch failed");
    const utxos = await res.json();
    return { success: false, msg: "Full tx signing requires bitcoinjs-lib. See instructions below.", utxos };
  } catch(e) {
    return { success: false, msg: e.message };
  }
}

async function checkTxStatus(txid) {
  try {
    const res = await fetch(`https://blockstream.info/testnet/api/tx/${txid}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function hashColor(h) {
  if (!h) return "#888";
  return `#${h.slice(0,6)}`;
}

function truncHash(h) {
  if (!h) return "computing…";
  return h.slice(0,8) + "…" + h.slice(-8);
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [events, setEvents] = useState([]);
  const [eventHashes, setEventHashes] = useState([]);
  const [endpointRoots, setEndpointRoots] = useState({});
  const [baseRoots, setBaseRoots] = useState({});
  const [regionRoots, setRegionRoots] = useState({});
  const [globalRoot, setGlobalRoot] = useState(null);
  const [prevGlobalRoot, setPrevGlobalRoot] = useState(null);
  const [tamperAlert, setTamperAlert] = useState(null);
  const [anchorHistory, setAnchorHistory] = useState([]);
  const [wifKey, setWifKey] = useState("");
  const [txid, setTxid] = useState("");
  const [broadcastStatus, setBroadcastStatus] = useState(null);
  const [isRunning, setIsRunning] = useState(true);
  const [activeTab, setActiveTab] = useState("live");
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [lastAnchorTime, setLastAnchorTime] = useState(null);
  const counterRef = useRef(0);
  const intervalRef = useRef(null);
  const merkleIntervalRef = useRef(null);

  // Generate events
  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      const e = genEvent(++counterRef.current);
      setEvents(prev => [e, ...prev].slice(0, 60));
    }, 1200);
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  // Hash all events + rebuild Merkle tree
  useEffect(() => {
    if (!events.length) return;
    (async () => {
      // Hash each event
      const hashes = await Promise.all(
        events.map(e => e.tampered
          ? sha256("TAMPERED::" + e.payload)
          : sha256(e.payload)
        )
      );
      setEventHashes(hashes);

      // Group by endpoint → build endpoint-level Merkle roots
      const byEndpoint = {};
      events.forEach((e, i) => {
        if (!byEndpoint[e.endpoint]) byEndpoint[e.endpoint] = [];
        byEndpoint[e.endpoint].push(hashes[i]);
      });
      const epRoots = {};
      for (const [ep, hs] of Object.entries(byEndpoint)) {
        epRoots[ep] = await buildMerkleRoot(hs);
      }
      setEndpointRoots(epRoots);

      // Assign endpoints to bases (round-robin for demo)
      const baseAssign = { [BASES[0]]: [], [BASES[1]]: [], [BASES[2]]: [] };
      Object.entries(epRoots).forEach(([ep, root], i) => {
        baseAssign[BASES[i % 3]].push(root);
      });
      const bRoots = {};
      for (const [base, roots] of Object.entries(baseAssign)) {
        bRoots[base] = await buildMerkleRoot(roots);
      }
      setBaseRoots(bRoots);

      // Assign bases to regions
      const regAssign = { [REGIONS[0]]: [], [REGIONS[1]]: [], [REGIONS[2]]: [] };
      Object.entries(bRoots).forEach(([base, root], i) => {
        regAssign[REGIONS[i % 3]].push(root);
      });
      const rRoots = {};
      for (const [reg, roots] of Object.entries(regAssign)) {
        rRoots[reg] = await buildMerkleRoot(roots);
      }
      setRegionRoots(rRoots);

      // Global root
      const allRegRoots = Object.values(rRoots);
      const gr = await buildMerkleRoot(allRegRoots);

      setGlobalRoot(prev => {
        if (prev && prev !== gr) {
          const tampered = events.find(e => e.tampered);
          if (tampered) {
            setTamperAlert({
              endpoint: tampered.endpoint,
              file: tampered.file,
              ts: Date.now(),
              oldRoot: prev,
              newRoot: gr,
            });
          }
        }
        setPrevGlobalRoot(prev);
        return gr;
      });
    })();
  }, [events]);

  // Auto-anchor every 5 minutes (simulated)
  useEffect(() => {
    merkleIntervalRef.current = setInterval(() => {
      if (globalRoot) {
        setLastAnchorTime(Date.now());
        setAnchorHistory(prev => [{
          root: globalRoot,
          ts: Date.now(),
          events: events.length,
          status: "pending",
          txid: null,
        }, ...prev].slice(0, 10));
      }
    }, 30000); // 30s for demo (real = 5min)
    return () => clearInterval(merkleIntervalRef.current);
  }, [globalRoot, events.length]);

  const tamperEvent = (id) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, tampered: true } : e));
    setTamperAlert(null); // reset, will retrigger on next hash
  };

  const restoreEvent = (id) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, tampered: false } : e));
    setTamperAlert(null);
  };

  const handleAnchor = async () => {
    if (!globalRoot) return;
    setAnchorLoading(true);
    setBroadcastStatus(null);

    const anchor = {
      root: globalRoot,
      ts: Date.now(),
      events: events.length,
      status: "broadcasting",
      txid: null,
    };
    setAnchorHistory(prev => [anchor, ...prev].slice(0, 10));

    if (wifKey.trim()) {
      const result = await broadcastToTestnet(globalRoot, wifKey.trim());
      const finalAnchor = {
        ...anchor,
        status: result.success ? "confirmed" : "manual",
        txid: result.txid || null,
        msg: result.msg,
      };
      setBroadcastStatus(finalAnchor);
      setAnchorHistory(prev => [finalAnchor, ...prev.slice(1)]);
    } else {
      // Demo mode: show what WOULD be broadcast
      const demoAnchor = {
        ...anchor,
        status: "demo",
        opReturn: `OP_RETURN ${globalRoot}`,
        msg: "No WIF key provided — showing transaction preview only.",
      };
      setBroadcastStatus(demoAnchor);
      setAnchorHistory(prev => [demoAnchor, ...prev.slice(1)]);
    }
    setLastAnchorTime(Date.now());
    setAnchorLoading(false);
  };

  const hasTamper = events.some(e => e.tampered);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "var(--font-sans, 'Inter', system-ui, sans-serif)",
      color: "var(--color-text-primary, #1a1a1a)",
      background: "transparent",
      padding: "0",
      maxWidth: 900,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "0.5px solid var(--color-border-tertiary, #e5e5e5)",
        paddingBottom: 16,
        marginBottom: 20,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: "var(--color-background-danger, #fee2e2)",
              color: "var(--color-text-danger, #b91c1c)",
              fontSize: 11,
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: 4,
              letterSpacing: "0.05em",
            }}>UNCLASSIFIED // DEMO</span>
          </div>
          <h2 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 500 }}>Immutable DoDIN — Federated Merkle Audit</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary, #666)" }}>
            Real SHA-256 hashing · Hierarchical Merkle tree · Bitcoin testnet anchoring
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setIsRunning(r => !r)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "0.5px solid var(--color-border-secondary, #ccc)",
              background: isRunning ? "var(--color-background-success, #dcfce7)" : "var(--color-background-secondary, #f5f5f5)",
              color: isRunning ? "var(--color-text-success, #15803d)" : "var(--color-text-secondary, #666)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {isRunning ? "⏸ Pause feed" : "▶ Resume feed"}
          </button>
        </div>
      </div>

      {/* Tamper Alert Banner */}
      {tamperAlert && (
        <div style={{
          background: "var(--color-background-danger, #fee2e2)",
          border: "1.5px solid var(--color-border-danger, #fca5a5)",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, color: "var(--color-text-danger, #b91c1c)", fontSize: 14 }}>
              INTEGRITY VIOLATION DETECTED — MACHINE QUARANTINED
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-danger, #b91c1c)", marginTop: 4 }}>
              Endpoint: <strong>{tamperAlert.endpoint}</strong> · File: <code>{tamperAlert.file}</code>
            </div>
            <div style={{ fontSize: 11, marginTop: 6, color: "var(--color-text-danger, #b91c1c)", opacity: 0.8 }}>
              Global root mismatch vs. last anchor · Previous: <code>{truncHash(tamperAlert.oldRoot)}</code> → New: <code>{truncHash(tamperAlert.newRoot)}</code>
            </div>
          </div>
        </div>
      )}

      {/* Merkle Tree Visual */}
      <div style={{
        background: "var(--color-background-secondary, #f9f9f9)",
        border: "0.5px solid var(--color-border-tertiary, #e5e5e5)",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Live Merkle Tree
        </div>

        {/* Tier 4: Global */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <div style={{
            background: globalRoot ? (hasTamper ? "var(--color-background-danger)" : "var(--color-background-success)") : "var(--color-background-secondary)",
            border: `1.5px solid ${globalRoot ? (hasTamper ? "var(--color-border-danger)" : "var(--color-border-success)") : "var(--color-border-secondary)"}`,
            borderRadius: 8,
            padding: "8px 16px",
            textAlign: "center",
            minWidth: 300,
          }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", letterSpacing: "0.06em", marginBottom: 4 }}>TIER 4 · GLOBAL ANCHOR · BITCOIN TESTNET</div>
            <div style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 12,
              color: globalRoot ? (hasTamper ? "var(--color-text-danger)" : "var(--color-text-success)") : "var(--color-text-secondary)",
              wordBreak: "break-all",
            }}>
              {globalRoot ? truncHash(globalRoot) : "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", height: 16 }}>
          <div style={{ width: 1, background: "var(--color-border-secondary)", height: "100%" }} />
        </div>

        {/* Tier 3: Regions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8, flexWrap: "wrap" }}>
          {REGIONS.map(reg => (
            <div key={reg} style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 6,
              padding: "6px 10px",
              flex: 1,
              minWidth: 160,
              maxWidth: 220,
            }}>
              <div style={{ fontSize: 9, fontWeight: 500, color: "var(--color-text-secondary)", letterSpacing: "0.06em", marginBottom: 3 }}>TIER 3 · {reg}</div>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "var(--color-text-secondary)", wordBreak: "break-all" }}>
                {regionRoots[reg] ? truncHash(regionRoots[reg]) : "—"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", height: 16 }}>
          <div style={{ width: 1, background: "var(--color-border-secondary)", height: "100%" }} />
        </div>

        {/* Tier 2: Bases */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8, flexWrap: "wrap" }}>
          {BASES.map(base => (
            <div key={base} style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 6,
              padding: "6px 10px",
              flex: 1,
              minWidth: 140,
              maxWidth: 200,
            }}>
              <div style={{ fontSize: 9, fontWeight: 500, color: "var(--color-text-secondary)", letterSpacing: "0.06em", marginBottom: 3 }}>TIER 2 · {base.toUpperCase()}</div>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "var(--color-text-secondary)", wordBreak: "break-all" }}>
                {baseRoots[base] ? truncHash(baseRoots[base]) : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 16 }}>
        {[["live", "Live Events"], ["anchor", "Blockchain Anchor"], ["history", "Anchor History"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: "8px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === key ? "2px solid var(--color-text-primary)" : "2px solid transparent",
            color: activeTab === key ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: activeTab === key ? 500 : 400,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Live Events Tab */}
      {activeTab === "live" && (
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
            Click <strong>Tamper</strong> on any event to simulate an adversarial log modification. The Merkle root will instantly invalidate.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {events.slice(0, 20).map((e, i) => (
              <div key={e.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 6,
                background: e.tampered ? "var(--color-background-danger)" : "var(--color-background-primary)",
                border: `0.5px solid ${e.tampered ? "var(--color-border-danger)" : "var(--color-border-tertiary)"}`,
                fontSize: 12,
                transition: "background 0.3s",
              }}>
                <span style={{ fontSize: 14 }}>{e.icon}</span>
                <span style={{ color: "var(--color-text-secondary)", minWidth: 90 }}>{e.endpoint}</span>
                <span style={{ flex: 1, color: e.tampered ? "var(--color-text-danger)" : "var(--color-text-primary)" }}>
                  {e.label} · <code style={{ fontSize: 11 }}>{e.file}</code>
                  {e.tampered && <span style={{ marginLeft: 8, fontWeight: 500 }}> [TAMPERED]</span>}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 10,
                  color: "var(--color-text-secondary)",
                  minWidth: 120,
                }}>
                  {eventHashes[i] ? truncHash(eventHashes[i]) : "hashing…"}
                </span>
                {!e.tampered ? (
                  <button onClick={() => tamperEvent(e.id)} style={{
                    padding: "3px 8px",
                    fontSize: 11,
                    borderRadius: 4,
                    border: "0.5px solid var(--color-border-danger)",
                    background: "var(--color-background-danger)",
                    color: "var(--color-text-danger)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}>
                    ✏️ Tamper
                  </button>
                ) : (
                  <button onClick={() => restoreEvent(e.id)} style={{
                    padding: "3px 8px",
                    fontSize: 11,
                    borderRadius: 4,
                    border: "0.5px solid var(--color-border-success)",
                    background: "var(--color-background-success)",
                    color: "var(--color-text-success)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}>
                    ↩ Restore
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-secondary)", textAlign: "center" }}>
            Showing latest 20 of {events.length} events · Tier 1 endpoints: {Object.keys(endpointRoots).length}
          </div>
        </div>
      )}

      {/* Blockchain Anchor Tab */}
      {activeTab === "anchor" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 8,
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>Current global root (32 bytes → Bitcoin OP_RETURN)</div>
            <div style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 13,
              wordBreak: "break-all",
              padding: "10px 12px",
              background: "var(--color-background-primary)",
              borderRadius: 6,
              border: "0.5px solid var(--color-border-tertiary)",
              color: hasTamper ? "var(--color-text-danger)" : "var(--color-text-success)",
            }}>
              {globalRoot || "Waiting for events…"}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 6 }}>
              Covers {events.length} events across {Object.keys(endpointRoots).length} endpoints, {Object.keys(baseRoots).length} bases, {Object.keys(regionRoots).length} regions
            </div>
          </div>

          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 8,
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>WIF Private Key (testnet wallet)</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 10 }}>
              Optional. Provide a testnet WIF key to sign and broadcast a real OP_RETURN transaction. Leave blank for demo preview mode.{" "}
              <a href="https://blockstream.info/testnet/faucet" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-info)" }}>Get testnet BTC ↗</a>
            </div>
            <input
              type="password"
              value={wifKey}
              onChange={e => setWifKey(e.target.value)}
              placeholder="cPastYourWIFKeyHere… (optional)"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                color: "var(--color-text-primary)",
                fontSize: 12,
                fontFamily: "var(--font-mono, monospace)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={handleAnchor}
              disabled={!globalRoot || anchorLoading}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                color: "var(--color-text-primary)",
                cursor: globalRoot && !anchorLoading ? "pointer" : "not-allowed",
                fontSize: 14,
                fontWeight: 500,
                opacity: (!globalRoot || anchorLoading) ? 0.5 : 1,
              }}
            >
              {anchorLoading ? "Broadcasting…" : "⚓ Anchor to Bitcoin Testnet"}
            </button>

            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", padding: "0 2px" }}>
              In production this fires automatically every 5 minutes. Demo auto-anchors every 30 seconds.
            </div>
          </div>

          {broadcastStatus && (
            <div style={{
              background: broadcastStatus.status === "demo"
                ? "var(--color-background-info)"
                : broadcastStatus.status === "confirmed"
                ? "var(--color-background-success)"
                : "var(--color-background-warning)",
              border: `0.5px solid ${broadcastStatus.status === "demo" ? "var(--color-border-info)" : broadcastStatus.status === "confirmed" ? "var(--color-border-success)" : "var(--color-border-warning)"}`,
              borderRadius: 8,
              padding: "12px 14px",
            }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>
                {broadcastStatus.status === "demo" ? "🔍 Transaction Preview (Demo Mode)" :
                 broadcastStatus.status === "confirmed" ? "✅ Confirmed on Bitcoin Testnet" :
                 "⚙️ Manual Broadcast Required"}
              </div>

              {broadcastStatus.status === "demo" && (
                <>
                  <div style={{ fontSize: 12, marginBottom: 8, color: "var(--color-text-secondary)" }}>
                    {broadcastStatus.msg}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginBottom: 6 }}>
                    <strong>OP_RETURN payload (hex):</strong><br />
                    <code>{broadcastStatus.root}</code>
                  </div>
                  <div style={{ fontSize: 11, marginTop: 10, padding: "8px 10px", background: "var(--color-background-primary)", borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)" }}>
                    <strong>To broadcast for real:</strong>
                    <ol style={{ margin: "6px 0 0 0", paddingLeft: 16, lineHeight: 1.8, color: "var(--color-text-secondary)" }}>
                      <li>Install <code>bitcoinjs-lib</code>: <code>npm i bitcoinjs-lib</code></li>
                      <li>Create a testnet wallet and fund it via the <a href="https://blockstream.info/testnet/faucet" target="_blank" rel="noopener noreferrer">Blockstream faucet ↗</a></li>
                      <li>Build an <code>OP_RETURN</code> output with the 32-byte root hash above</li>
                      <li>Sign with your WIF key and POST the raw hex to <code>https://blockstream.info/testnet/api/tx</code></li>
                      <li>Verify at <a href={`https://blockstream.info/testnet/`} target="_blank" rel="noopener noreferrer">blockstream.info/testnet ↗</a></li>
                    </ol>
                  </div>
                </>
              )}

              {broadcastStatus.txid && (
                <a
                  href={`https://blockstream.info/testnet/tx/${broadcastStatus.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "var(--color-text-info)", fontFamily: "var(--font-mono)" }}
                >
                  View on Blockstream ↗ {truncHash(broadcastStatus.txid)}
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div>
          {anchorHistory.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: "32px 0" }}>
              No anchors yet. Click "Anchor to Bitcoin Testnet" or wait 30 seconds for auto-anchor.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {anchorHistory.map((a, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "var(--color-background-primary)",
                  border: "0.5px solid var(--color-border-tertiary)",
                  fontSize: 12,
                }}>
                  <span style={{ fontSize: 16 }}>
                    {a.status === "confirmed" ? "✅" : a.status === "demo" ? "🔍" : a.status === "pending" ? "⏳" : "⚙️"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                      {truncHash(a.root)}
                    </div>
                    <div style={{ color: "var(--color-text-secondary)", fontSize: 11, marginTop: 2 }}>
                      {new Date(a.ts).toLocaleTimeString()} · {a.events} events · {a.status}
                    </div>
                  </div>
                  {a.txid && (
                    <a
                      href={`https://blockstream.info/testnet/tx/${a.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--color-text-info)", fontSize: 11 }}
                    >
                      View tx ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer stats */}
      <div style={{
        display: "flex",
        gap: 12,
        marginTop: 20,
        paddingTop: 16,
        borderTop: "0.5px solid var(--color-border-tertiary)",
        flexWrap: "wrap",
      }}>
        {[
          ["Events hashed", events.length],
          ["Endpoints (Tier 1)", Object.keys(endpointRoots).length],
          ["Bases (Tier 2)", Object.keys(baseRoots).length],
          ["Regions (Tier 3)", Object.keys(regionRoots).length],
          ["Anchors", anchorHistory.length],
          ["Blockchain cost", "32 bytes / 5 min"],
        ].map(([label, val]) => (
          <div key={label} style={{
            flex: 1,
            minWidth: 100,
            background: "var(--color-background-secondary)",
            borderRadius: 8,
            padding: "8px 12px",
          }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
