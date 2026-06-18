import { useState, useEffect, useRef } from "react";

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg: "#080c14", surf: "#0d1220", surf2: "#111929", surf3: "#162030",
  border: "#1b2a3f", borderHi: "#253d58", text: "#c8d8e8", dim: "#5a7a96",
  muted: "#243040",
  green: "#2ecc71", greenBg: "#051510", greenBd: "#0a3520",
  red: "#e74c3c", redBg: "#180808", redBd: "#4d1515",
  amber: "#f39c12", amberBg: "#180e00", amberBd: "#5a3800",
  blue: "#3498db", blueBg: "#071020", blueBd: "#0e2e50",
  cyan: "#1abc9c", cyanBg: "#051a15", cyanBd: "#0a3028",
  violet: "#9b59b6", violetBg: "#0e0620", violetBd: "#3b1f5a",
  mono: "'Courier New', Consolas, 'Lucida Console', monospace",
};

// ── Static hierarchy ──────────────────────────────────────────────────────────
const ENDPOINT_BASE = {
  "NIPR-WS-001": "JBPHH",       "NIPR-WS-042": "JBPHH",
  "NIPR-WS-117": "Al Udeid AB", "NIPR-WS-203": "Al Udeid AB",
  "NIPR-WS-311": "Peterson SFB","NIPR-WS-408": "Peterson SFB",
};
const BASE_REGION = {
  "JBPHH": "INDOPACOM", "Al Udeid AB": "CENTCOM", "Peterson SFB": "USSPACECOM",
};
const ENDPOINTS = ["NIPR-WS-001","NIPR-WS-042","NIPR-WS-117","NIPR-WS-203","NIPR-WS-311","NIPR-WS-408"];
const BASES     = ["JBPHH","Al Udeid AB","Peterson SFB"];
const REGIONS   = ["INDOPACOM","CENTCOM","USSPACECOM"];

// ── Crypto helpers ────────────────────────────────────────────────────────────
async function sha256(data) {
  const enc = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Pair(a, b) { return sha256(a + b); }
async function buildMerkleRoot(hashes) {
  if (!hashes.length) return null;
  let lvl = [...hashes];
  while (lvl.length > 1) {
    const next = [];
    for (let i = 0; i < lvl.length; i += 2)
      next.push(await sha256Pair(lvl[i], lvl[i + 1] || lvl[i]));
    lvl = next;
  }
  return lvl[0];
}

function genDemoTxid() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Event generators ──────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { type: "FILE_SAVE",    icon: "💾", label: "File saved"      },
  { type: "AI_PROMPT",   icon: "🤖", label: "AI prompt exec"  },
  { type: "FILE_MODIFY", icon: "✏️", label: "File modified"   },
  { type: "LOGIN_CAC",   icon: "🔐", label: "CAC login"       },
  { type: "NET_CONNECT", icon: "🌐", label: "Network connect" },
];
const FILES = [
  "logistics_manifest_v3.docx","unit_deploy_order.xlsx","supply_chain_data.csv",
  "ops_memo_final.docx","intel_brief.pdf","mission_plan_alpha.docx",
];

function genEvent(id) {
  const et   = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const ep   = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const file = FILES[Math.floor(Math.random() * FILES.length)];
  const base = ENDPOINT_BASE[ep];
  return {
    id, timestamp: Date.now(), type: et.type, icon: et.icon, label: et.label,
    endpoint: ep, base, region: BASE_REGION[base], file,
    user: "GS" + (Math.floor(Math.random() * 5) + 9) + "-" + Math.floor(1000 + Math.random() * 9000),
    payload: `${et.type}::${ep}::${file}::${Date.now()}::${Math.random()}`,
    tampered: false,
  };
}

async function broadcastToTestnet(rootHash) {
  try {
    const res = await fetch("http://localhost:3001/anchor", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootHash }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, msg: data.error };
    return { success: true, txid: data.txid, url: data.url };
  } catch {
    return { success: false, msg: "Anchor server not running — using demo mode." };
  }
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Snapshot bundle status helpers ────────────────────────────────────────────
const STATUS_META = {
  pending:              { color: C.amber,  bg: C.amberBg,  bd: C.amberBd,  label: "PENDING"               },
  anchoring:            { color: C.dim,    bg: C.surf2,    bd: C.border,   label: "ANCHORING…"            },
  pending_confirmation: { color: C.amber,  bg: C.amberBg,  bd: C.amberBd,  label: "PENDING CONFIRMATION"  },
  verifying:            { color: C.dim,    bg: C.surf2,    bd: C.border,   label: "VERIFYING…"            },
  blockchain_confirmed: { color: C.green,  bg: C.greenBg,  bd: C.greenBd,  label: "✅ BLOCKCHAIN CONFIRMED"},
  demo_confirmed:       { color: C.cyan,   bg: C.cyanBg,   bd: C.cyanBd,   label: "DEMO CONFIRMED"        },
  transmitted:          { color: C.violet, bg: C.violetBg, bd: C.violetBd, label: "📡 TRANSMITTED"        },
};

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [panel, setPanel]                 = useState("hashforce");
  const [events, setEvents]               = useState([]);
  const [eventHashes, setEventHashes]     = useState([]);
  const [endpointRoots, setEndpointRoots] = useState({});
  const [baseRoots, setBaseRoots]         = useState({});
  const [regionRoots, setRegionRoots]     = useState({});
  const [globalRoot, setGlobalRoot]       = useState(null);
  const [tamperAlert, setTamperAlert]     = useState(null);
  const [isRunning, setIsRunning]         = useState(true);

  // Bundle workflow state
  const [snapshots, setSnapshots]               = useState([]);
  const [transmittedBundles, setTransmittedBundles] = useState([]);
  const [expandedBundles, setExpandedBundles]   = useState(new Set());
  const [snapshotting, setSnapshotting]         = useState(false);

  const counterRef = useRef(0);

  // ── Event simulation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => {
      setEvents(prev => [genEvent(++counterRef.current), ...prev].slice(0, 100));
    }, 1200);
    return () => clearInterval(t);
  }, [isRunning]);

  // ── Merkle tree recomputation ─────────────────────────────────────────────
  useEffect(() => {
    if (!events.length) return;
    (async () => {
      const hashes = await Promise.all(
        events.map(e => e.tampered ? sha256("TAMPERED::" + e.payload) : sha256(e.payload))
      );
      setEventHashes(hashes);

      const epRoots = {};
      for (const ep of ENDPOINTS) {
        const hs = events.map((e, i) => e.endpoint === ep ? hashes[i] : null).filter(Boolean);
        if (hs.length) epRoots[ep] = await buildMerkleRoot(hs);
      }
      setEndpointRoots(epRoots);

      const bRoots = {};
      for (const base of BASES) {
        const roots = ENDPOINTS.filter(ep => ENDPOINT_BASE[ep] === base && epRoots[ep]).map(ep => epRoots[ep]);
        const r = await buildMerkleRoot(roots);
        if (r) bRoots[base] = r;
      }
      setBaseRoots(bRoots);

      const rRoots = {};
      for (const reg of REGIONS) {
        const roots = BASES.filter(b => BASE_REGION[b] === reg && bRoots[b]).map(b => bRoots[b]);
        const r = await buildMerkleRoot(roots);
        if (r) rRoots[reg] = r;
      }
      setRegionRoots(rRoots);

      const gr = await buildMerkleRoot(Object.values(rRoots));
      setGlobalRoot(prev => {
        if (prev && gr && prev !== gr) {
          const t = events.find(e => e.tampered);
          if (t) setTamperAlert({ endpoint: t.endpoint, file: t.file, ts: Date.now(), oldRoot: prev, newRoot: gr });
        }
        return gr;
      });
    })();
  }, [events]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const tamperEvent  = id => { setEvents(p => p.map(e => e.id === id ? { ...e, tampered: true  } : e)); setTamperAlert(null); };
  const restoreEvent = id => { setEvents(p => p.map(e => e.id === id ? { ...e, tampered: false } : e)); setTamperAlert(null); };

  const handleSnapshot = async () => {
    if (!events.length || !globalRoot || snapshotting) return;
    setSnapshotting(true);
    const eventsWithHashes = events.map((e, i) => ({
      id: e.id, timestamp: e.timestamp, endpoint: e.endpoint,
      base: e.base, region: e.region, eventType: e.type,
      file: e.file, user: e.user, payloadHash: eventHashes[i] || null,
      tampered: e.tampered,
    }));
    const bundle = {
      snapshotId:      crypto.randomUUID(),
      capturedAt:      new Date().toISOString(),
      capturedBy:      "HASH-FORCE-OPS",
      eventCount:      events.length,
      merkleRoot:      globalRoot,
      integrityStatus: events.some(e => e.tampered) ? "CONTAINS_VIOLATIONS" : "CLEAN",
      events:          eventsWithHashes,
      status: "pending", txid: null, isDemo: false, txUrl: null, verifyNote: null,
    };
    setSnapshots(prev => [bundle, ...prev]);
    setSnapshotting(false);
  };

  const handleAnchorBundle = async (bundle) => {
    setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId ? { ...s, status: "anchoring" } : s));
    const result = await broadcastToTestnet(bundle.merkleRoot);
    if (result.success) {
      setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId
        ? { ...s, status: "pending_confirmation", txid: result.txid, txUrl: result.url, isDemo: false }
        : s));
    } else {
      const demoTxid = genDemoTxid();
      setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId
        ? { ...s, status: "pending_confirmation", txid: demoTxid,
            txUrl: `https://blockstream.info/testnet/tx/${demoTxid}`,
            isDemo: true, verifyNote: result.msg }
        : s));
    }
  };

  const handleVerify = async (bundle) => {
    setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId ? { ...s, status: "verifying" } : s));
    if (bundle.isDemo) {
      setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId
        ? { ...s, status: "demo_confirmed", verifyNote: "Simulated — no real on-chain transaction." }
        : s));
      return;
    }
    try {
      const res = await fetch(`https://blockstream.info/testnet/api/tx/${bundle.txid}`);
      if (res.ok) {
        setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId
          ? { ...s, status: "blockchain_confirmed", verifyNote: null }
          : s));
      } else {
        setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId
          ? { ...s, status: "pending_confirmation", verifyNote: "Not yet confirmed — retry in a moment." }
          : s));
      }
    } catch {
      setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId
        ? { ...s, status: "pending_confirmation", verifyNote: "Network error — check connection." }
        : s));
    }
  };

  const handleSendBundle = (bundle) => {
    setTransmittedBundles(prev =>
      prev.find(b => b.snapshotId === bundle.snapshotId) ? prev : [bundle, ...prev]
    );
    setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId ? { ...s, status: "transmitted" } : s));
  };

  const toggleBundle = id => setExpandedBundles(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const hasTamper      = events.some(e => e.tampered);
  const tamperedEvents = events.filter(e => e.tampered);
  const tamperedEps    = new Set(tamperedEvents.map(e => e.endpoint));

  const confirmedSnapshots = snapshots.filter(s => ["blockchain_confirmed","demo_confirmed","transmitted"].includes(s.status)).length;

  // ── Shared sub-renders ────────────────────────────────────────────────────

  function renderMerkleHierarchy() {
    return (
      <div style={{ width: 230, flexShrink: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 13px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 12 }}>Merkle Hierarchy</div>

        <div style={{ marginBottom: 13 }}>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 5, textTransform: "uppercase" }}>Tier 4 — Global Anchor</div>
          <div style={{ background: globalRoot ? (hasTamper ? C.redBg : C.greenBg) : C.surf2, border: `1px solid ${globalRoot ? (hasTamper ? C.redBd : C.greenBd) : C.border}`, borderRadius: 4, padding: "8px 10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: hasTamper ? C.red : C.green, marginBottom: 5 }}>
              {hasTamper ? "⚠  INTEGRITY FAIL" : "●  INTEGRITY OK"}
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 7.5, color: hasTamper ? C.red : C.green, wordBreak: "break-all", lineHeight: 1.6 }}>{globalRoot || "—"}</div>
          </div>
        </div>

        <div style={{ marginBottom: 13 }}>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 5, textTransform: "uppercase" }}>Tier 3 — Regional</div>
          {REGIONS.map(reg => (
            <div key={reg} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: C.blue, fontWeight: 600, marginBottom: 2 }}>{reg}</div>
              <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.dim, wordBreak: "break-all", lineHeight: 1.5 }}>{regionRoots[reg] || "—"}</div>
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 5, textTransform: "uppercase" }}>Tier 2 — Installations</div>
          {BASES.map(base => (
            <div key={base} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 2 }}>{base}</div>
              <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.muted, wordBreak: "break-all", lineHeight: 1.5 }}>{baseRoots[base] || "—"}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderLiveEvents() {
    return (
      <div style={{ flex: 1, minWidth: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 13px", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
          <span>Live Events Feed</span>
          <span style={{ fontFamily: C.mono, color: C.muted }}>{events.length} total</span>
        </div>

        <div style={{ flex: 1, height: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {events.slice(0, 60).map((e, i) => (
            <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 7px", borderRadius: 4, background: e.tampered ? C.redBg : C.surf2, border: `1px solid ${e.tampered ? C.redBd : C.border}` }}>
              <span style={{ fontSize: 13, lineHeight: 1.6, flexShrink: 0 }}>{e.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.blue, fontWeight: 700 }}>{e.endpoint}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, flexShrink: 0 }}>{fmtTime(e.timestamp)}</span>
                </div>
                <div style={{ fontSize: 12, color: e.tampered ? C.red : C.text, marginTop: 1, fontWeight: e.tampered ? 600 : 400 }}>
                  {e.label}{e.tampered && <span style={{ marginLeft: 5 }}>[TAMPERED]</span>}
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, marginTop: 1 }}>{e.file}</div>
                <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.muted, marginTop: 2, wordBreak: "break-all", lineHeight: 1.4 }}>{eventHashes[i] || "hashing…"}</div>
              </div>
              {!e.tampered && (
                <button onClick={() => tamperEvent(e.id)} style={{ padding: "2px 6px", fontSize: 10, borderRadius: 3, border: `1px solid ${C.redBd}`, background: C.redBg, color: C.red, cursor: "pointer", flexShrink: 0, fontFamily: C.mono, fontWeight: 700 }}>
                  TAMPER
                </button>
              )}
            </div>
          ))}
          {!events.length && (
            <div style={{ textAlign: "center", color: C.dim, fontSize: 12, padding: "40px 0", opacity: 0.6 }}>Waiting for events…</div>
          )}
        </div>

        {/* Snapshot button */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={handleSnapshot}
            disabled={!events.length || !globalRoot || snapshotting}
            style={{
              width: "100%", padding: "10px 0", borderRadius: 4, fontSize: 14, fontWeight: 700,
              fontFamily: C.mono, letterSpacing: "0.05em", cursor: events.length && globalRoot && !snapshotting ? "pointer" : "not-allowed",
              border: `1px solid ${events.length && globalRoot ? C.blue : C.border}`,
              background: events.length && globalRoot && !snapshotting ? C.blueBg : C.surf2,
              color: events.length && globalRoot && !snapshotting ? C.blue : C.dim,
            }}
          >
            {snapshotting ? "CAPTURING…" : "📸  SNAPSHOT & QUEUE"}
          </button>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 5, textAlign: "center" }}>
            Bundles {events.length} events into a signed JSON payload → Pending Queue
          </div>
        </div>
      </div>
    );
  }

  function renderBundleStatusBadge(status) {
    const m = STATUS_META[status] || STATUS_META.pending;
    return (
      <span style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.bd}`, padding: "2px 8px", borderRadius: 2, letterSpacing: "0.05em" }}>
        {m.label}
      </span>
    );
  }

  function renderPendingQueue() {
    return (
      <div style={{ width: 310, flexShrink: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 13px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Pending Queue</span>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{snapshots.length} bundles</span>
        </div>

        <div style={{ height: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {snapshots.length === 0 && (
            <div style={{ textAlign: "center", color: C.dim, fontSize: 12, padding: "50px 0", opacity: 0.6 }}>
              No bundles yet<br />
              <span style={{ fontSize: 10, color: C.muted }}>Click 📸 Snapshot & Queue</span>
            </div>
          )}
          {snapshots.map(bundle => {
            const m = STATUS_META[bundle.status] || STATUS_META.pending;
            const canAnchor    = bundle.status === "pending";
            const canVerify    = bundle.status === "pending_confirmation";
            const canSend      = ["blockchain_confirmed","demo_confirmed"].includes(bundle.status);
            const isWorking    = ["anchoring","verifying"].includes(bundle.status);
            return (
              <div key={bundle.snapshotId} style={{ background: C.surf2, border: `1px solid ${m.bd}`, borderRadius: 5, padding: "10px 11px" }}>

                {/* Bundle header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
                  {renderBundleStatusBadge(bundle.status)}
                  <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>{fmtTime(new Date(bundle.capturedAt).getTime())}</span>
                </div>

                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginBottom: 3 }}>
                  ID: {bundle.snapshotId.slice(0, 18)}…
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.text }}>{bundle.eventCount} events</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: C.mono,
                    color: bundle.integrityStatus === "CLEAN" ? C.green : C.red,
                    background: bundle.integrityStatus === "CLEAN" ? C.greenBg : C.redBg,
                    border: `1px solid ${bundle.integrityStatus === "CLEAN" ? C.greenBd : C.redBd}`,
                    padding: "1px 6px", borderRadius: 2,
                  }}>
                    {bundle.integrityStatus === "CLEAN" ? "✓ CLEAN" : "⚠ CONTAINS VIOLATIONS"}
                  </span>
                </div>

                <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.dim, wordBreak: "break-all", lineHeight: 1.5, marginBottom: 6 }}>
                  root: {bundle.merkleRoot}
                </div>

                {bundle.txid && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 7.5, color: bundle.isDemo ? C.cyan : C.blue, wordBreak: "break-all", lineHeight: 1.5 }}>
                      txid: {bundle.txid}
                      {bundle.isDemo && <span style={{ color: C.muted }}> (demo)</span>}
                    </div>
                  </div>
                )}

                {bundle.verifyNote && (
                  <div style={{ fontSize: 10, color: C.amber, marginBottom: 5, fontStyle: "italic" }}>{bundle.verifyNote}</div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 7 }}>
                  {canAnchor && (
                    <button onClick={() => handleAnchorBundle(bundle)} style={btnStyle(C.blue, C.blueBg, C.blueBd)}>
                      ⚓ Anchor to Testnet
                    </button>
                  )}
                  {canVerify && (
                    <button onClick={() => handleVerify(bundle)} style={btnStyle(C.amber, C.amberBg, C.amberBd)}>
                      🔍 Verify on Blockstream
                    </button>
                  )}
                  {canSend && (
                    <button onClick={() => handleSendBundle(bundle)} style={btnStyle(C.cyan, C.cyanBg, C.cyanBd)}>
                      📡 Send to Cyber Command
                    </button>
                  )}
                  {isWorking && (
                    <div style={{ textAlign: "center", fontSize: 11, color: C.dim, padding: "4px 0", fontFamily: C.mono }}>
                      {bundle.status === "anchoring" ? "Broadcasting to Bitcoin testnet…" : "Querying Blockstream API…"}
                    </div>
                  )}
                  <button
                    onClick={() => downloadJson(bundle, `snapshot-${bundle.snapshotId.slice(0,8)}.json`)}
                    style={btnStyle(C.dim, C.surf3, C.border)}
                  >
                    ⬇ Download JSON
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTamperedEvents() {
    return (
      <div style={{ width: 205, flexShrink: 0, background: C.surf, border: `1px solid ${tamperedEvents.length ? C.redBd : C.border}`, borderRadius: 6, padding: "12px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: tamperedEvents.length ? C.red : C.dim, textTransform: "uppercase", borderBottom: `1px solid ${tamperedEvents.length ? C.redBd : C.border}`, paddingBottom: 7, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Tampered</span>
          {tamperedEvents.length > 0 && (
            <span style={{ background: C.redBg, border: `1px solid ${C.redBd}`, color: C.red, fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 3, fontFamily: C.mono }}>
              {tamperedEvents.length}
            </span>
          )}
        </div>
        {tamperedEvents.length === 0 ? (
          <div style={{ textAlign: "center", color: C.dim, fontSize: 12, padding: "50px 0" }}>
            <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.35 }}>✓</div>No violations
          </div>
        ) : (
          <div style={{ height: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {tamperedEvents.map(e => (
              <div key={e.id} style={{ background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 4, padding: "8px 9px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.red, fontWeight: 700 }}>{e.endpoint}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9, color: C.dim }}>{fmtTime(e.timestamp)}</span>
                </div>
                <div style={{ fontSize: 11, color: C.red, marginBottom: 2 }}>{e.label}</div>
                <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, marginBottom: 7 }}>{e.file}</div>
                <button onClick={() => restoreEvent(e.id)} style={{ width: "100%", padding: "4px 0", fontSize: 11, borderRadius: 3, border: `1px solid ${C.greenBd}`, background: C.greenBg, color: C.green, cursor: "pointer", fontWeight: 700, fontFamily: C.mono }}>
                  ↩ RESTORE
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderEndpointGrid() {
    return (
      <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
          <span>Tier 1 — Endpoint Nodes</span>
          <span style={{ fontFamily: C.mono, color: C.muted }}>{Object.keys(endpointRoots).length} / {ENDPOINTS.length} active</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))", gap: 9 }}>
          {ENDPOINTS.map(ep => {
            const isTampered = tamperedEps.has(ep);
            const root = endpointRoots[ep];
            const epEvents = events.filter(e => e.endpoint === ep);
            const last = epEvents[0];
            return (
              <div key={ep} style={{ background: isTampered ? C.redBg : C.surf2, border: `1px solid ${isTampered ? C.redBd : C.border}`, borderRadius: 4, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: isTampered ? C.red : C.blue }}>{ep}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, fontFamily: C.mono, background: isTampered ? C.redBd : C.greenBg, color: isTampered ? C.red : C.green, border: `1px solid ${isTampered ? C.red : C.greenBd}` }}>
                    {isTampered ? "TAMPERED" : root ? "CLEAN" : "IDLE"}
                  </span>
                </div>
                {last && <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>{last.icon} {last.label} · <span style={{ fontFamily: C.mono }}>{fmtTime(last.timestamp)}</span></div>}
                <div style={{ fontFamily: C.mono, fontSize: 7.5, color: isTampered ? C.redBd : C.muted, wordBreak: "break-all", lineHeight: 1.4 }}>{root || "no data"}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{epEvents.length} events</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderFooterStats() {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["Events Live",   events.length,                                false],
          ["Endpoints",     Object.keys(endpointRoots).length,            false],
          ["Tampered",      tamperedEvents.length,                        tamperedEvents.length > 0],
          ["Bundles",       snapshots.length,                             false],
          ["Confirmed",     confirmedSnapshots,                           false],
          ["Transmitted",   transmittedBundles.length,                   false],
          ["Chain Cost",    "32 B / 5 MIN",                              false],
        ].map(([label, val, alert]) => (
          <div key={label} style={{ flex: 1, minWidth: 80, background: C.surf, border: `1px solid ${alert ? C.redBd : C.border}`, borderRadius: 4, padding: "8px 11px" }}>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, fontFamily: C.mono, color: alert ? C.red : C.text }}>{val}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderCyberCommand() {
    return (
      <div style={{ padding: "14px 20px" }}>
        <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.cyan }}>
              ◈ Cyber Command — Situational Awareness
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
              Blockchain-confirmed · Hash Force–transmitted bundles only · {transmittedBundles.length} bundles received
            </div>
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, padding: "4px 10px", borderRadius: 3 }}>READ ONLY</span>
        </div>

        {transmittedBundles.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.dim }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.2 }}>◈</div>
            <div style={{ fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>No bundles received</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.8 }}>
              Hash Force → 📸 Snapshot → ⚓ Anchor → 🔍 Verify → 📡 Send to Cyber Command
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {transmittedBundles.map(bundle => {
              const isExpanded = expandedBundles.has(bundle.snapshotId);
              const violations = bundle.events.filter(e => e.tampered).length;
              return (
                <div key={bundle.snapshotId} style={{ background: C.surf, border: `1px solid ${violations ? C.redBd : C.greenBd}`, borderRadius: 6, overflow: "hidden" }}>

                  {/* Bundle card header */}
                  <div style={{ padding: "10px 16px", background: C.surf2, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: violations ? C.red : C.green, background: violations ? C.redBg : C.greenBg, border: `1px solid ${violations ? C.redBd : C.greenBd}`, padding: "2px 8px", borderRadius: 2 }}>
                          {violations ? `⚠ CONTAINS ${violations} VIOLATION${violations !== 1 ? "S" : ""}` : "✓ CLEAN"}
                        </span>
                        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>
                          {bundle.eventCount} events · {fmtTime(new Date(bundle.capturedAt).getTime())}
                        </span>
                      </div>
                      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, marginBottom: 3 }}>
                        ID: {bundle.snapshotId}
                      </div>
                      <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.dim, wordBreak: "break-all", lineHeight: 1.5 }}>
                        root: {bundle.merkleRoot}
                      </div>
                      {bundle.txid && (
                        <div style={{ marginTop: 4 }}>
                          <a href={bundle.txUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontFamily: C.mono, fontSize: 7.5, color: bundle.isDemo ? C.cyan : C.blue, wordBreak: "break-all", lineHeight: 1.5 }}>
                            ⛓ txid: {bundle.txid}{bundle.isDemo && " (demo)"}
                          </a>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexShrink: 0 }}>
                      <button onClick={() => toggleBundle(bundle.snapshotId)} style={btnStyle(C.blue, C.blueBg, C.blueBd)}>
                        {isExpanded ? "▲ Collapse" : "▼ Expand Tree"}
                      </button>
                      <button onClick={() => downloadJson(bundle, `bundle-${bundle.snapshotId.slice(0,8)}.json`)} style={btnStyle(C.dim, C.surf3, C.border)}>
                        ⬇ Download JSON
                      </button>
                    </div>
                  </div>

                  {/* Expandable tree */}
                  {isExpanded && (
                    <div style={{ padding: "12px 16px" }}>
                      {REGIONS.map(reg => {
                        const regEvents = bundle.events.filter(e => e.region === reg);
                        if (!regEvents.length) return null;
                        return (
                          <div key={reg} style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.cyan, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                              ◈ {reg} <span style={{ fontSize: 10, fontWeight: 400, color: C.dim }}>({regEvents.length} events)</span>
                            </div>
                            {BASES.filter(b => BASE_REGION[b] === reg).map(base => {
                              const baseEvents = regEvents.filter(e => e.base === base);
                              if (!baseEvents.length) return null;
                              return (
                                <div key={base} style={{ marginLeft: 14, marginBottom: 8 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 5 }}>
                                    ▸ {base} <span style={{ fontSize: 10, fontWeight: 400, color: C.dim }}>({baseEvents.length})</span>
                                  </div>
                                  {ENDPOINTS.filter(ep => ENDPOINT_BASE[ep] === base).map(ep => {
                                    const epEvents = baseEvents.filter(e => e.endpoint === ep);
                                    if (!epEvents.length) return null;
                                    return (
                                      <div key={ep} style={{ marginLeft: 14, marginBottom: 6 }}>
                                        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 4 }}>
                                          → {ep}
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginLeft: 14 }}>
                                          {epEvents.map(ev => (
                                            <div key={ev.id} style={{ background: ev.tampered ? C.redBg : C.greenBg, border: `1px solid ${ev.tampered ? C.redBd : C.greenBd}`, borderRadius: 3, padding: "6px 10px" }}>
                                              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
                                                {ev.tampered && (
                                                  <span style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, color: C.red, background: C.redBd, padding: "1px 5px", borderRadius: 2 }}>
                                                    ⚠ INTEGRITY VIOLATION
                                                  </span>
                                                )}
                                                <span style={{ fontSize: 11, fontWeight: 600, color: ev.tampered ? C.red : C.text }}>{ev.eventType}</span>
                                                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>{ev.file}</span>
                                                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>{ev.user}</span>
                                                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>{fmtTime(ev.timestamp)}</span>
                                              </div>
                                              <div style={{ fontFamily: C.mono, fontSize: 7.5, color: ev.tampered ? C.red : C.greenBd, wordBreak: "break-all", lineHeight: 1.5 }}>
                                                hash: {ev.payloadHash || "—"}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Cyber Command footer */}
        {transmittedBundles.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {[
              ["Bundles Received",  transmittedBundles.length,                                                  false],
              ["Total Events",      transmittedBundles.reduce((s, b) => s + b.eventCount, 0),                  false],
              ["Clean Bundles",     transmittedBundles.filter(b => b.integrityStatus === "CLEAN").length,       false],
              ["Violations",        transmittedBundles.filter(b => b.integrityStatus !== "CLEAN").length,       transmittedBundles.some(b => b.integrityStatus !== "CLEAN")],
              ["On-Chain",          transmittedBundles.filter(b => !b.isDemo).length,                          false],
              ["Demo Mode",         transmittedBundles.filter(b => b.isDemo).length,                           false],
            ].map(([label, val, alert]) => (
              <div key={label} style={{ flex: 1, minWidth: 90, background: C.surf, border: `1px solid ${alert ? C.redBd : C.border}`, borderRadius: 4, padding: "8px 11px" }}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, fontFamily: C.mono, color: alert ? C.red : C.text }}>{val}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Root render ───────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: "100vh", fontSize: 14 }}>

      {/* ── Header ── */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ background: C.amberBg, border: `1px solid ${C.amberBd}`, color: C.amber, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 2, letterSpacing: "0.1em", fontFamily: C.mono }}>
            UNCLASSIFIED // DEMO
          </span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Immutable DoDIN — Federated Merkle Audit
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
              Hierarchical Merkle Tree · Bitcoin Testnet Anchor
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[
            { id: "hashforce",    label: "⬡ HASH FORCE",   sub: "Operator View"                           },
            { id: "cybercommand", label: "◈ CYBER COMMAND", sub: `${transmittedBundles.length} bundles`    },
            { id: "both",         label: "⊞ BOTH",          sub: "Split View"                              },
          ].map(tab => (
            <button key={tab.id} onClick={() => setPanel(tab.id)} style={{
              padding: "6px 14px", borderRadius: 4, cursor: "pointer", textAlign: "left",
              border:     `1px solid ${panel === tab.id ? C.blue : C.border}`,
              background: panel === tab.id ? C.blueBg : C.surf2,
              color:      panel === tab.id ? C.blue : C.dim,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em" }}>{tab.label}</div>
              <div style={{ fontSize: 10, opacity: 0.75, marginTop: 1 }}>{tab.sub}</div>
            </button>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", background: isRunning ? C.green : C.amber, boxShadow: `0 0 8px ${isRunning ? C.green : C.amber}` }} />
            <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: isRunning ? C.green : C.amber, letterSpacing: "0.08em" }}>
              {isRunning ? "LIVE" : "PAUSED"}
            </span>
            <button onClick={() => setIsRunning(r => !r)} style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${C.borderHi}`, background: C.surf2, color: C.text, cursor: "pointer", fontSize: 12 }}>
              {isRunning ? "⏸ Pause" : "▶ Resume"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tamper Alert ── */}
      {tamperAlert && (
        <div style={{ background: C.redBg, borderBottom: `1px solid ${C.redBd}`, borderLeft: `4px solid ${C.red}`, padding: "10px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: C.red, fontSize: 13, letterSpacing: "0.06em" }}>INTEGRITY VIOLATION DETECTED — ENDPOINT QUARANTINED</div>
            <div style={{ fontSize: 12, color: C.red, opacity: 0.9, marginTop: 3 }}>
              Endpoint: <strong>{tamperAlert.endpoint}</strong> · File: <span style={{ fontFamily: C.mono }}>{tamperAlert.file}</span>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.red, opacity: 0.7, marginTop: 3, lineHeight: 1.8 }}>
              PREV: {tamperAlert.oldRoot}<br />NOW:  {tamperAlert.newRoot}
            </div>
          </div>
          <button onClick={() => setTamperAlert(null)} style={{ background: "transparent", border: `1px solid ${C.redBd}`, color: C.red, cursor: "pointer", padding: "3px 8px", borderRadius: 3, fontSize: 11 }}>✕</button>
        </div>
      )}

      {/* ════════════════════════════════ HASH FORCE ════════════════════════════ */}
      {(panel === "hashforce" || panel === "both") && (
        <div style={{ padding: panel === "both" ? "12px 16px" : "14px 20px", display: "flex", flexDirection: "column", gap: 12, borderBottom: panel === "both" ? `2px solid ${C.borderHi}` : "none" }}>

          {panel === "both" && (
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase" }}>
              ⬡ HASH FORCE — OPERATOR VIEW
            </div>
          )}

          {/* 4-column row */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {renderMerkleHierarchy()}
            {renderLiveEvents()}
            {renderPendingQueue()}
            {renderTamperedEvents()}
          </div>

          {renderEndpointGrid()}
          {renderFooterStats()}
        </div>
      )}

      {/* ════════════════════════════ CYBER COMMAND ═════════════════════════════ */}
      {(panel === "cybercommand" || panel === "both") && renderCyberCommand()}

    </div>
  );
}

// ── Shared button style helper ────────────────────────────────────────────────
function btnStyle(color, bg, bd) {
  return {
    width: "100%", padding: "5px 0", fontSize: 11, borderRadius: 3,
    border: `1px solid ${bd}`, background: bg, color, cursor: "pointer",
    fontFamily: "'Courier New', Consolas, 'Lucida Console', monospace",
    fontWeight: 700, letterSpacing: "0.04em",
  };
}
