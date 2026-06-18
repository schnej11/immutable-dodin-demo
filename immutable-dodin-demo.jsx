import { useState, useEffect, useRef } from "react";
import {
  Camera, Anchor, Radio, Download,
  Pause, Play, AlertTriangle, ChevronDown, ChevronUp,
  Activity, ShieldCheck, ShieldAlert, Cpu, Globe,
  RefreshCw, RotateCcw, CheckCircle2,
} from "lucide-react";

// ── VX dark-theme color tokens ────────────────────────────────────────────────
const C = {
  // Surfaces — Cod Grey base (never pure black)
  bg:       "#1E1E1E",
  surf:     "#282828",
  surf2:    "#141414",
  surf3:    "#2A2A2A",
  border:   "#2A2A2A",
  borderHi: "#434343",
  // Typography — Wild Sand / Silver / Boulder
  text:     "#F5F5F5",
  dim:      "#BEBEBE",
  muted:    "#757575",
  // VX accent — Philippine Yellow (primary interactive on dark)
  yellow:   "#FFCB03",
  yellowBg: "#1C1600",
  yellowBd: "#4A3A00",
  // Status signals (operational meaning — distinct from accent)
  green:    "#22C55E",
  greenBg:  "#0A1A0E",
  greenBd:  "#1A4020",
  red:      "#EF4444",
  redBg:    "#1C0707",
  redBd:    "#4A1212",
  amber:    "#F59E0B",
  amberBg:  "#1C1100",
  amberBd:  "#5A3800",
  teal:     "#14B8A6",
  tealBg:   "#061512",
  tealBd:   "#0A3028",
  violet:   "#A78BFA",
  violetBg: "#0E0820",
  violetBd: "#3B1F70",
  // Typography stacks
  fontBody:      "'Inter Tight', 'Helvetica Neue', Arial, sans-serif",
  fontTactical:  "'Chakra Petch', 'Inter Tight', sans-serif",
  fontCondensed: "'IBM Plex Sans Condensed', 'Inter Tight', sans-serif",
  fontMono:      "'Chakra Petch', ui-monospace, SFMono-Regular, Menlo, monospace",
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

// ── MPC anchor nodes ──────────────────────────────────────────────────────────
const MPC_NODES = [
  { id: "EUCOM-ANCHOR-01",     cmd: "US European Command"     },
  { id: "INDOPACOM-ANCHOR-02", cmd: "US Indo-Pacific Command" },
  { id: "CENTCOM-ANCHOR-03",   cmd: "US Central Command"      },
  { id: "NORTHCOM-ANCHOR-04",  cmd: "US Northern Command"     },
  { id: "STRATCOM-ANCHOR-05",  cmd: "US Strategic Command"    },
];
// Pentagon positions (viewBox 0 0 400 220, center 200,115, r=80)
const MPC_NODE_POS = [
  { x: 200, y: 35,  short: "EUCOM-01"  },
  { x: 276, y: 90,  short: "INDO-02"   },
  { x: 247, y: 180, short: "CENT-03"   },
  { x: 153, y: 180, short: "NORTH-04"  },
  { x: 124, y: 90,  short: "STRAT-05"  },
];

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
  { type: "FILE_SAVE",    label: "File saved"      },
  { type: "AI_PROMPT",   label: "AI prompt exec"  },
  { type: "FILE_MODIFY", label: "File modified"   },
  { type: "LOGIN_CAC",   label: "CAC login"       },
  { type: "NET_CONNECT", label: "Network connect" },
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
    id, timestamp: Date.now(), type: et.type, label: et.label,
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

// ── Status metadata ───────────────────────────────────────────────────────────
const STATUS_META = {
  pending:              { color: C.amber,  bg: C.amberBg,  bd: C.amberBd,  label: "PENDING"              },
  anchoring:            { color: C.muted,  bg: C.surf2,    bd: C.border,   label: "ANCHORING"            },
  pending_confirmation: { color: C.amber,  bg: C.amberBg,  bd: C.amberBd,  label: "PENDING CONFIRMATION" },
  verifying:            { color: C.muted,  bg: C.surf2,    bd: C.border,   label: "VERIFYING"            },
  blockchain_confirmed: { color: C.green,  bg: C.greenBg,  bd: C.greenBd,  label: "BLOCKCHAIN CONFIRMED" },
  demo_confirmed:       { color: C.teal,   bg: C.tealBg,   bd: C.tealBd,   label: "DEMO CONFIRMED"       },
  transmitted:          { color: C.violet, bg: C.violetBg, bd: C.violetBd, label: "TRANSMITTED"          },
};

// ── Shared style helpers ──────────────────────────────────────────────────────
function btnPrimary(disabled) {
  return {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    width: "100%", padding: "8px 0", borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer",
    border: `1px solid ${disabled ? C.border : C.yellowBd}`,
    background: disabled ? C.surf2 : C.yellowBg,
    color: disabled ? C.muted : C.yellow,
    fontFamily: C.fontTactical, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
    transition: "opacity 200ms cubic-bezier(0.2,0.7,0.2,1)",
  };
}
function btnGhost(color, bg, bd) {
  return {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", padding: "6px 0", borderRadius: 4, cursor: "pointer",
    border: `1px solid ${bd}`, background: bg, color,
    fontFamily: C.fontTactical, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
    transition: "opacity 200ms cubic-bezier(0.2,0.7,0.2,1)",
  };
}
const eyebrow = {
  fontFamily: C.fontTactical, fontSize: 10, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.16em", color: C.muted,
};
const panelCard = {
  background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px",
};
const sectionRule = {
  borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 12,
  display: "flex", justifyContent: "space-between", alignItems: "center",
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
  const [snapshots, setSnapshots]         = useState([]);
  const [transmittedBundles, setTransmittedBundles] = useState([]);
  const [expandedBundles, setExpandedBundles]       = useState(new Set());
  const [snapshotting, setSnapshotting]   = useState(false);
  const [mpcQueue, setMpcQueue]           = useState([]);
  const [signingPending, setSigningPending] = useState(new Set());
  const counterRef = useRef(0);

  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => {
      setEvents(prev => [genEvent(++counterRef.current), ...prev]);
    }, 1200);
    return () => clearInterval(t);
  }, [isRunning]);

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

  const tamperEvent  = id => { setEvents(p => p.map(e => e.id === id ? { ...e, tampered: true  } : e)); setTamperAlert(null); };
  const restoreEvent = id => { setEvents(p => p.map(e => e.id === id ? { ...e, tampered: false } : e)); setTamperAlert(null); };

  const createMpcBundle = () => {
    if (!events.length || !globalRoot) return;
    const bundle = {
      bundleId:        crypto.randomUUID(),
      capturedAt:      Date.now(),
      merkleRoot:      globalRoot,
      integrityStatus: events.some(e => e.tampered) ? "CONTAINS_VIOLATIONS" : "CLEAN",
      eventCount:      events.length,
      events: events.map((e, i) => ({
        id: e.id, timestamp: e.timestamp, endpoint: e.endpoint,
        base: e.base, region: e.region, eventType: e.type,
        file: e.file, user: e.user, payloadHash: eventHashes[i] || null, tampered: e.tampered,
      })),
      mpcStatus:         "AWAITING_SIGNATURES",
      mpcSigningLog:     [],
      combinedSignature: null,
      txid:              null,
    };
    setMpcQueue(prev => [bundle, ...prev]);
  };

  const handleNodeDecision = (bundleId, nodeId, decision) => {
    const key = `${bundleId}::${nodeId}`;
    setSigningPending(prev => { const s = new Set(prev); s.add(key); return s; });
    setTimeout(() => {
      const partialSig = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      setMpcQueue(prev => prev.map(b => {
        if (b.bundleId !== bundleId) return b;
        const newLog  = [...b.mpcSigningLog, { node: nodeId, decision, partialSig, timestamp: Date.now() }];
        const signed  = newLog.filter(e => e.decision === "SIGNED").length;
        const rejected= newLog.filter(e => e.decision === "REJECTED").length;
        const newStatus = signed >= 3 ? "THRESHOLD_MET" : rejected >= 3 ? "FAILED" : b.mpcStatus;
        return { ...b, mpcSigningLog: newLog, mpcStatus: newStatus };
      }));
      setSigningPending(prev => { const s = new Set(prev); s.delete(key); return s; });
    }, 800);
  };

  const handleCombineAndBroadcast = async (bundleId) => {
    const bundle = mpcQueue.find(b => b.bundleId === bundleId);
    if (!bundle) return;
    const sigs = bundle.mpcSigningLog.filter(e => e.decision === "SIGNED").map(e => e.partialSig);
    const combinedSignature = await sha256(sigs.join(""));
    const txid = genDemoTxid();
    setMpcQueue(prev => prev.map(b => b.bundleId === bundleId
      ? { ...b, mpcStatus: "BROADCAST", combinedSignature, txid }
      : b));
  };

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
    setEvents([]);
    setEventHashes([]);
    setSnapshotting(false);
  };

  const handleAnchorBundle = async (bundle) => {
    setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId ? { ...s, status: "anchoring" } : s));
    const result = await broadcastToTestnet(bundle.merkleRoot);
    if (result.success) {
      setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId
        ? { ...s, status: "pending_confirmation", txid: result.txid, txUrl: result.url, isDemo: false, anchoredAt: Date.now() }
        : s));
    } else {
      const demoTxid = genDemoTxid();
      setSnapshots(prev => prev.map(s => s.snapshotId === bundle.snapshotId
        ? { ...s, status: "pending_confirmation", txid: demoTxid,
            txUrl: `https://blockstream.info/testnet/tx/${demoTxid}`,
            isDemo: true, verifyNote: result.msg, anchoredAt: Date.now() }
        : s));
    }
  };

  // Auto-poll bundles waiting for ≥1 confirmation
  useEffect(() => {
    const hasPending = snapshots.some(s => s.status === "pending_confirmation");
    if (!hasPending) return;
    const interval = setInterval(async () => {
      setSnapshots(prev => {
        const toCheck = prev.filter(s => s.status === "pending_confirmation");
        if (!toCheck.length) return prev;
        toCheck.forEach(async bundle => {
          if (bundle.isDemo) {
            if (Date.now() - (bundle.anchoredAt || 0) >= 5000) {
              setSnapshots(p => p.map(s => s.snapshotId === bundle.snapshotId
                ? { ...s, status: "demo_confirmed", verifyNote: "Simulated — no real on-chain transaction." }
                : s));
            }
          } else {
            try {
              const res = await fetch(`https://blockstream.info/testnet/api/tx/${bundle.txid}/status`);
              if (res.ok) {
                const data = await res.json();
                if (data.confirmed) {
                  setSnapshots(p => p.map(s => s.snapshotId === bundle.snapshotId
                    ? { ...s, status: "blockchain_confirmed", verifyNote: null }
                    : s));
                }
              }
            } catch { /* retry next tick */ }
          }
        });
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [snapshots]);

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
  const confirmedCount = snapshots.filter(s => ["blockchain_confirmed","demo_confirmed","transmitted"].includes(s.status)).length;

  // ── Sub-renders ───────────────────────────────────────────────────────────

  function StatusBadge({ status }) {
    const m = STATUS_META[status] || STATUS_META.pending;
    return (
      <span style={{ fontFamily: C.fontTactical, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
        color: m.color, background: m.bg, border: `1px solid ${m.bd}`,
        padding: "2px 8px", borderRadius: 2 }}>
        {m.label}
      </span>
    );
  }

  function renderMerkleHierarchy() {
    return (
      <div style={{ ...panelCard, width: 230, flexShrink: 0 }}>
        <div style={{ ...sectionRule }}>
          <span style={eyebrow}>Merkle Hierarchy</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ ...eyebrow, marginBottom: 6 }}>Tier 4 — Global Anchor</div>
          <div style={{ background: globalRoot ? (hasTamper ? C.redBg : C.greenBg) : C.surf2,
            border: `1px solid ${globalRoot ? (hasTamper ? C.redBd : C.greenBd) : C.border}`,
            borderRadius: 4, padding: "8px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              {hasTamper
                ? <ShieldAlert size={13} color={C.red} />
                : <ShieldCheck size={13} color={C.green} />}
              <span style={{ fontFamily: C.fontTactical, fontSize: 11, fontWeight: 600,
                color: hasTamper ? C.red : C.green, letterSpacing: "0.05em" }}>
                {hasTamper ? "INTEGRITY FAIL" : "INTEGRITY OK"}
              </span>
            </div>
            <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: hasTamper ? C.red : C.green,
              wordBreak: "break-all", lineHeight: 1.6 }}>{globalRoot || "—"}</div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ ...eyebrow, marginBottom: 6 }}>Tier 3 — Regional</div>
          {REGIONS.map(reg => (
            <div key={reg} style={{ background: C.surf2, border: `1px solid ${C.border}`,
              borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
              <div style={{ fontFamily: C.fontTactical, fontSize: 11, color: C.yellow,
                fontWeight: 600, marginBottom: 2, letterSpacing: "0.04em" }}>{reg}</div>
              <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: C.muted,
                wordBreak: "break-all", lineHeight: 1.5 }}>{regionRoots[reg] || "—"}</div>
            </div>
          ))}
        </div>

        <div>
          <div style={{ ...eyebrow, marginBottom: 6 }}>Tier 2 — Installations</div>
          {BASES.map(base => (
            <div key={base} style={{ background: C.surf2, border: `1px solid ${C.border}`,
              borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
              <div style={{ fontFamily: C.fontCondensed, fontSize: 11, color: C.dim,
                fontWeight: 600, marginBottom: 2 }}>{base}</div>
              <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: C.muted,
                wordBreak: "break-all", lineHeight: 1.5 }}>{baseRoots[base] || "—"}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderLiveEvents() {
    return (
      <div style={{ ...panelCard, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ ...sectionRule }}>
          <span style={eyebrow}>Live Events Feed</span>
          <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.muted }}>{events.length} total</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
          {events.slice(0, 4).map((e, i) => (
            <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 8,
              padding: "7px 9px", borderRadius: 4,
              background: e.tampered ? C.redBg : C.surf2,
              border: `1px solid ${e.tampered ? C.redBd : C.border}` }}>
              <Activity size={12} color={e.tampered ? C.red : C.muted} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontFamily: C.fontTactical, fontSize: 11, color: C.yellow,
                    fontWeight: 600, letterSpacing: "0.04em" }}>{e.endpoint}</span>
                  <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, flexShrink: 0 }}>{fmtTime(e.timestamp)}</span>
                </div>
                <div style={{ fontFamily: C.fontBody, fontSize: 12, color: e.tampered ? C.red : C.text,
                  marginTop: 2, fontWeight: e.tampered ? 600 : 400 }}>
                  {e.label}{e.tampered && <span style={{ marginLeft: 6, fontFamily: C.fontTactical,
                    fontSize: 10, letterSpacing: "0.06em" }}>[TAMPERED]</span>}
                </div>
                <div style={{ fontFamily: C.fontCondensed, fontSize: 11, color: C.dim, marginTop: 1 }}>{e.file}</div>
                <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: C.muted, marginTop: 3,
                  wordBreak: "break-all", lineHeight: 1.4 }}>{eventHashes[i] || "hashing..."}</div>
              </div>
              {!e.tampered && (
                <button onClick={() => tamperEvent(e.id)} style={{ padding: "2px 8px", fontSize: 10,
                  borderRadius: 4, border: `1px solid ${C.redBd}`, background: C.redBg, color: C.red,
                  cursor: "pointer", flexShrink: 0, fontFamily: C.fontTactical, fontWeight: 600,
                  letterSpacing: "0.05em" }}>
                  TAMPER
                </button>
              )}
            </div>
          ))}
          {!events.length && (
            <div style={{ textAlign: "center", color: C.muted, fontSize: 12,
              fontFamily: C.fontBody, padding: "32px 0" }}>Waiting for events</div>
          )}
        </div>

        <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <button onClick={handleSnapshot} disabled={!events.length || !globalRoot || snapshotting}
            style={btnPrimary(!events.length || !globalRoot || snapshotting)}>
            <Camera size={14} />
            {snapshotting ? "CAPTURING" : "SNAPSHOT & QUEUE"}
          </button>
          <div style={{ fontFamily: C.fontBody, fontSize: 11, color: C.muted, marginTop: 6,
            textAlign: "center", lineHeight: 1.5 }}>
            Bundles all current events — then clears the feed
          </div>
        </div>
      </div>
    );
  }

  function renderPendingQueue() {
    return (
      <div style={{ ...panelCard, width: 310, flexShrink: 0 }}>
        <div style={{ ...sectionRule }}>
          <span style={eyebrow}>Pending Queue</span>
          <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.muted }}>{snapshots.length} bundles</span>
        </div>

        <div style={{ maxHeight: 540, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {snapshots.length === 0 && (
            <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontBody,
              fontSize: 12, padding: "48px 0", lineHeight: 1.7 }}>
              No bundles queued<br />
              <span style={{ fontSize: 11, color: C.muted, opacity: 0.6 }}>Use Snapshot to create one</span>
            </div>
          )}
          {snapshots.map(bundle => {
            const m = STATUS_META[bundle.status] || STATUS_META.pending;
            const canAnchor = bundle.status === "pending";
            const canVerify = bundle.status === "pending_confirmation";
            const canSend   = ["blockchain_confirmed","demo_confirmed"].includes(bundle.status);
            const isWorking = ["anchoring","verifying"].includes(bundle.status);
            return (
              <div key={bundle.snapshotId} style={{ background: C.surf2,
                border: `1px solid ${m.bd}`, borderRadius: 4, padding: "10px 12px" }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <StatusBadge status={bundle.status} />
                  <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted }}>
                    {fmtTime(new Date(bundle.capturedAt).getTime())}
                  </span>
                </div>

                <div style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, marginBottom: 5 }}>
                  {bundle.snapshotId.slice(0, 20)}...
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: C.fontCondensed, fontSize: 12, color: C.text }}>
                    {bundle.eventCount} events
                  </span>
                  <span style={{ fontFamily: C.fontTactical, fontSize: 9, fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: bundle.integrityStatus === "CLEAN" ? C.green : C.red,
                    background: bundle.integrityStatus === "CLEAN" ? C.greenBg : C.redBg,
                    border: `1px solid ${bundle.integrityStatus === "CLEAN" ? C.greenBd : C.redBd}`,
                    padding: "1px 6px", borderRadius: 2 }}>
                    {bundle.integrityStatus === "CLEAN" ? "CLEAN" : "VIOLATIONS"}
                  </span>
                </div>

                <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: C.muted,
                  wordBreak: "break-all", lineHeight: 1.5, marginBottom: 6 }}>
                  root: {bundle.merkleRoot}
                </div>

                {bundle.txid && (
                  <div style={{ fontFamily: C.fontMono, fontSize: 7.5,
                    color: bundle.isDemo ? C.teal : C.yellow,
                    wordBreak: "break-all", lineHeight: 1.5, marginBottom: 6 }}>
                    txid: {bundle.txid}{bundle.isDemo && " (demo)"}
                  </div>
                )}

                {bundle.verifyNote && (
                  <div style={{ fontFamily: C.fontBody, fontSize: 10, color: C.amber,
                    marginBottom: 6, lineHeight: 1.5 }}>{bundle.verifyNote}</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  {canAnchor && (
                    <button onClick={() => handleAnchorBundle(bundle)}
                      style={btnGhost(C.yellow, C.yellowBg, C.yellowBd)}>
                      <Anchor size={12} />Anchor to Testnet
                    </button>
                  )}
                  {canVerify && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                      <RefreshCw size={11} color={C.green} style={{ flexShrink: 0, animation: "spin 1.5s linear infinite" }} />
                      <span style={{ fontFamily: C.fontTactical, fontSize: 10, color: C.green, letterSpacing: "0.06em" }}>
                        POLLING FOR CONFIRMATION…
                      </span>
                    </div>
                  )}
                  {canSend && (
                    <button onClick={() => handleSendBundle(bundle)}
                      style={btnGhost(C.teal, C.tealBg, C.tealBd)}>
                      <Radio size={12} />Send to Cyber Command
                    </button>
                  )}
                  {isWorking && (
                    <div style={{ textAlign: "center", fontSize: 11, color: C.muted,
                      fontFamily: C.fontTactical, padding: "4px 0", letterSpacing: "0.06em" }}>
                      <RefreshCw size={11} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                      {bundle.status === "anchoring" ? "BROADCASTING" : "QUERYING"}
                    </div>
                  )}
                  <button onClick={() => downloadJson(bundle, `snapshot-${bundle.snapshotId.slice(0,8)}.json`)}
                    style={btnGhost(C.dim, C.surf3, C.borderHi)}>
                    <Download size={11} />Download JSON
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
      <div style={{ ...panelCard, width: 205, flexShrink: 0,
        border: `1px solid ${tamperedEvents.length ? C.redBd : C.border}` }}>
        <div style={{ ...sectionRule, borderBottomColor: tamperedEvents.length ? C.redBd : C.border }}>
          <span style={{ ...eyebrow, color: tamperedEvents.length ? C.red : C.muted }}>Tampered</span>
          {tamperedEvents.length > 0 && (
            <span style={{ fontFamily: C.fontMono, fontSize: 10, fontWeight: 600,
              color: C.red, background: C.redBg, border: `1px solid ${C.redBd}`,
              padding: "1px 6px", borderRadius: 2 }}>{tamperedEvents.length}</span>
          )}
        </div>
        {tamperedEvents.length === 0 ? (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 12,
            fontFamily: C.fontBody, padding: "48px 0" }}>
            <CheckCircle2 size={22} color={C.muted} style={{ marginBottom: 8, opacity: 0.4, display: "block", margin: "0 auto 8px" }} />
            No violations
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tamperedEvents.map(e => (
              <div key={e.id} style={{ background: C.redBg, border: `1px solid ${C.redBd}`,
                borderRadius: 4, padding: "8px 9px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontFamily: C.fontTactical, fontSize: 11, color: C.red,
                    fontWeight: 600, letterSpacing: "0.04em" }}>{e.endpoint}</span>
                  <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted }}>{fmtTime(e.timestamp)}</span>
                </div>
                <div style={{ fontFamily: C.fontCondensed, fontSize: 11, color: C.red, marginBottom: 2 }}>{e.label}</div>
                <div style={{ fontFamily: C.fontCondensed, fontSize: 10, color: C.muted, marginBottom: 8 }}>{e.file}</div>
                <button onClick={() => restoreEvent(e.id)}
                  style={{ ...btnGhost(C.green, C.greenBg, C.greenBd), padding: "4px 0" }}>
                  <RotateCcw size={11} />Restore
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
      <div style={panelCard}>
        <div style={sectionRule}>
          <span style={eyebrow}>Tier 1 — Endpoint Nodes</span>
          <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.muted }}>
            {Object.keys(endpointRoots).length} / {ENDPOINTS.length} active
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))", gap: 8 }}>
          {ENDPOINTS.map(ep => {
            const isTampered = tamperedEps.has(ep);
            const root = endpointRoots[ep];
            const epEvents = events.filter(e => e.endpoint === ep);
            const last = epEvents[0];
            return (
              <div key={ep} style={{ background: isTampered ? C.redBg : C.surf2,
                border: `1px solid ${isTampered ? C.redBd : C.border}`, borderRadius: 4, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontFamily: C.fontTactical, fontSize: 11, fontWeight: 600,
                    color: isTampered ? C.red : C.yellow, letterSpacing: "0.04em" }}>{ep}</span>
                  <span style={{ fontFamily: C.fontTactical, fontSize: 9, fontWeight: 600,
                    letterSpacing: "0.06em", padding: "1px 5px", borderRadius: 2,
                    background: isTampered ? C.redBd : root ? C.greenBg : C.surf3,
                    color: isTampered ? C.red : root ? C.green : C.muted,
                    border: `1px solid ${isTampered ? C.red : root ? C.greenBd : C.border}` }}>
                    {isTampered ? "TAMPERED" : root ? "CLEAN" : "IDLE"}
                  </span>
                </div>
                {last && (
                  <div style={{ fontFamily: C.fontCondensed, fontSize: 10, color: C.dim, marginBottom: 4 }}>
                    {last.label} — {fmtTime(last.timestamp)}
                  </div>
                )}
                <div style={{ fontFamily: C.fontMono, fontSize: 7.5,
                  color: isTampered ? C.redBd : C.muted, wordBreak: "break-all", lineHeight: 1.4 }}>
                  {root || "no data"}
                </div>
                <div style={{ fontFamily: C.fontCondensed, fontSize: 10, color: C.muted, marginTop: 4 }}>
                  {epEvents.length} events
                </div>
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
          ["Events Live",   events.length,                false],
          ["Endpoints",     Object.keys(endpointRoots).length, false],
          ["Tampered",      tamperedEvents.length,        tamperedEvents.length > 0],
          ["Bundles",       snapshots.length,             false],
          ["Confirmed",     confirmedCount,               false],
          ["Transmitted",   transmittedBundles.length,    false],
          ["Chain Cost",    "32 B / 5 MIN",               false],
        ].map(([label, val, alert]) => (
          <div key={label} style={{ flex: 1, minWidth: 80, background: C.surf,
            border: `1px solid ${alert ? C.redBd : C.border}`, borderRadius: 4, padding: "8px 12px" }}>
            <div style={{ ...eyebrow, marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: C.fontTactical, fontSize: 20, fontWeight: 600,
              color: alert ? C.red : C.text }}>{val}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderCyberCommand() {
    return (
      <div style={{ padding: "16px 20px" }}>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: C.fontTactical, fontSize: 15, fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase", color: C.yellow }}>
              Cyber Command — Situational Awareness
            </div>
            <div style={{ fontFamily: C.fontBody, fontSize: 12, color: C.muted, marginTop: 4 }}>
              Blockchain-confirmed, Hash Force-transmitted bundles only — {transmittedBundles.length} received
            </div>
          </div>
          <span style={{ ...eyebrow, border: `1px solid ${C.border}`, padding: "4px 10px", borderRadius: 4 }}>
            READ ONLY
          </span>
        </div>

        {transmittedBundles.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
            <Globe size={36} color={C.muted} style={{ opacity: 0.25, margin: "0 auto 16px", display: "block" }} />
            <div style={{ fontFamily: C.fontTactical, fontSize: 13, letterSpacing: "0.08em",
              textTransform: "uppercase" }}>No bundles received</div>
            <div style={{ fontFamily: C.fontBody, fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.8 }}>
              Hash Force: Snapshot — Anchor — Verify — Send to Cyber Command
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {transmittedBundles.map(bundle => {
              const isExpanded = expandedBundles.has(bundle.snapshotId);
              const violations = bundle.events.filter(e => e.tampered).length;
              return (
                <div key={bundle.snapshotId} style={{ background: C.surf,
                  border: `1px solid ${violations ? C.redBd : C.greenBd}`,
                  borderRadius: 6, overflow: "hidden" }}>

                  <div style={{ padding: "10px 16px", background: C.surf2,
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: C.fontTactical, fontSize: 9, fontWeight: 600,
                          letterSpacing: "0.08em",
                          color: violations ? C.red : C.green,
                          background: violations ? C.redBg : C.greenBg,
                          border: `1px solid ${violations ? C.redBd : C.greenBd}`,
                          padding: "2px 8px", borderRadius: 2 }}>
                          {violations ? `${violations} VIOLATION${violations !== 1 ? "S" : ""}` : "CLEAN"}
                        </span>
                        <span style={{ fontFamily: C.fontCondensed, fontSize: 11, color: C.dim }}>
                          {bundle.eventCount} events — {fmtTime(new Date(bundle.capturedAt).getTime())}
                        </span>
                      </div>
                      <div style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, marginBottom: 3 }}>
                        {bundle.snapshotId}
                      </div>
                      <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: C.muted,
                        wordBreak: "break-all", lineHeight: 1.5 }}>
                        root: {bundle.merkleRoot}
                      </div>
                      {bundle.txid && (
                        <a href={bundle.txUrl} target="_blank" rel="noopener noreferrer"
                          style={{ display: "block", fontFamily: C.fontMono, fontSize: 7.5,
                            color: bundle.isDemo ? C.teal : C.yellow,
                            wordBreak: "break-all", lineHeight: 1.5, marginTop: 3, textDecoration: "none" }}>
                          txid: {bundle.txid}{bundle.isDemo && " (demo)"}
                        </a>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => toggleBundle(bundle.snapshotId)}
                        style={{ ...btnGhost(C.yellow, C.yellowBg, C.yellowBd), width: "auto", padding: "5px 14px" }}>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? "Collapse" : "Expand"}
                      </button>
                      <button onClick={() => downloadJson(bundle, `bundle-${bundle.snapshotId.slice(0,8)}.json`)}
                        style={{ ...btnGhost(C.dim, C.surf3, C.borderHi), width: "auto", padding: "5px 12px" }}>
                        <Download size={11} />JSON
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: "12px 16px" }}>
                      {REGIONS.map(reg => {
                        const regEvs = bundle.events.filter(e => e.region === reg);
                        if (!regEvs.length) return null;
                        return (
                          <div key={reg} style={{ marginBottom: 12 }}>
                            <div style={{ fontFamily: C.fontTactical, fontSize: 11, fontWeight: 600,
                              letterSpacing: "0.08em", textTransform: "uppercase", color: C.yellow,
                              marginBottom: 6 }}>
                              {reg} <span style={{ fontFamily: C.fontCondensed, fontSize: 10,
                                fontWeight: 400, color: C.muted }}>({regEvs.length})</span>
                            </div>
                            {BASES.filter(b => BASE_REGION[b] === reg).map(base => {
                              const baseEvs = regEvs.filter(e => e.base === base);
                              if (!baseEvs.length) return null;
                              return (
                                <div key={base} style={{ marginLeft: 14, marginBottom: 8 }}>
                                  <div style={{ fontFamily: C.fontTactical, fontSize: 10, fontWeight: 600,
                                    color: C.dim, marginBottom: 5, letterSpacing: "0.04em" }}>
                                    {base} <span style={{ fontFamily: C.fontCondensed, fontWeight: 400,
                                      color: C.muted }}>({baseEvs.length})</span>
                                  </div>
                                  {ENDPOINTS.filter(ep => ENDPOINT_BASE[ep] === base).map(ep => {
                                    const epEvs = baseEvs.filter(e => e.endpoint === ep);
                                    if (!epEvs.length) return null;
                                    return (
                                      <div key={ep} style={{ marginLeft: 14, marginBottom: 6 }}>
                                        <div style={{ fontFamily: C.fontTactical, fontSize: 10, fontWeight: 600,
                                          color: C.yellow, marginBottom: 4, letterSpacing: "0.04em" }}>
                                          {ep}
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginLeft: 14 }}>
                                          {epEvs.map(ev => (
                                            <div key={ev.id} style={{ background: ev.tampered ? C.redBg : C.greenBg,
                                              border: `1px solid ${ev.tampered ? C.redBd : C.greenBd}`,
                                              borderRadius: 3, padding: "6px 10px" }}>
                                              {ev.tampered && (
                                                <div style={{ display: "flex", alignItems: "center", gap: 5,
                                                  marginBottom: 4 }}>
                                                  <AlertTriangle size={11} color={C.red} />
                                                  <span style={{ fontFamily: C.fontTactical, fontSize: 9,
                                                    fontWeight: 600, color: C.red, letterSpacing: "0.06em" }}>
                                                    INTEGRITY VIOLATION
                                                  </span>
                                                </div>
                                              )}
                                              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                                <span style={{ fontFamily: C.fontCondensed, fontSize: 12,
                                                  fontWeight: 600, color: ev.tampered ? C.red : C.text }}>
                                                  {ev.eventType}
                                                </span>
                                                <span style={{ fontFamily: C.fontCondensed, fontSize: 11,
                                                  color: C.dim }}>{ev.file}</span>
                                                <span style={{ fontFamily: C.fontMono, fontSize: 9,
                                                  color: C.muted }}>{ev.user}</span>
                                                <span style={{ fontFamily: C.fontMono, fontSize: 9,
                                                  color: C.muted }}>{fmtTime(ev.timestamp)}</span>
                                              </div>
                                              <div style={{ fontFamily: C.fontMono, fontSize: 7.5,
                                                color: ev.tampered ? C.red : C.greenBd,
                                                wordBreak: "break-all", lineHeight: 1.5, marginTop: 4 }}>
                                                {ev.payloadHash}
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

        {transmittedBundles.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {[
              ["Bundles Received",  transmittedBundles.length,                                                false],
              ["Total Events",      transmittedBundles.reduce((s, b) => s + b.eventCount, 0),                false],
              ["Clean",             transmittedBundles.filter(b => b.integrityStatus === "CLEAN").length,    false],
              ["Violations",        transmittedBundles.filter(b => b.integrityStatus !== "CLEAN").length,    transmittedBundles.some(b => b.integrityStatus !== "CLEAN")],
              ["On-Chain",          transmittedBundles.filter(b => !b.isDemo).length,                        false],
              ["Demo Mode",         transmittedBundles.filter(b => b.isDemo).length,                         false],
            ].map(([label, val, alert]) => (
              <div key={label} style={{ flex: 1, minWidth: 90, background: C.surf,
                border: `1px solid ${alert ? C.redBd : C.border}`, borderRadius: 4, padding: "8px 12px" }}>
                <div style={{ ...eyebrow, marginBottom: 5 }}>{label}</div>
                <div style={{ fontFamily: C.fontTactical, fontSize: 20, fontWeight: 600,
                  color: alert ? C.red : C.text }}>{val}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderPentagon(log) {
    const CX = 200, CY = 115;
    return (
      <svg viewBox="0 0 400 220" style={{ width: "100%", maxWidth: 400, display: "block", margin: "12px auto 0" }}>
        {MPC_NODE_POS.map((pos, i) => {
          const entry = log.find(e => e.node === MPC_NODES[i].id);
          const lineColor = entry?.decision === "SIGNED" ? C.green
                          : entry?.decision === "REJECTED" ? C.red : C.borderHi;
          return (
            <line key={i} x1={pos.x} y1={pos.y} x2={CX} y2={CY}
              stroke={lineColor} strokeWidth={1.5}
              strokeDasharray={entry ? "none" : "5 3"} />
          );
        })}
        <circle cx={CX} cy={CY} r={22} fill={C.surf2} stroke={C.yellowBd} strokeWidth={1.5} />
        <text x={CX} y={CY - 4} textAnchor="middle" fill={C.yellow}
          fontSize="7" fontFamily="Chakra Petch, monospace" fontWeight="600">GLOBAL</text>
        <text x={CX} y={CY + 7} textAnchor="middle" fill={C.yellow}
          fontSize="7" fontFamily="Chakra Petch, monospace" fontWeight="600">ANCHOR</text>
        {MPC_NODE_POS.map((pos, i) => {
          const entry     = log.find(e => e.node === MPC_NODES[i].id);
          const fill      = entry?.decision === "SIGNED" ? C.greenBg
                          : entry?.decision === "REJECTED" ? C.redBg : C.surf2;
          const stroke    = entry?.decision === "SIGNED" ? C.green
                          : entry?.decision === "REJECTED" ? C.red : C.borderHi;
          const textColor = entry?.decision === "SIGNED" ? C.green
                          : entry?.decision === "REJECTED" ? C.red : C.dim;
          return (
            <g key={i}>
              <circle cx={pos.x} cy={pos.y} r={20} fill={fill} stroke={stroke} strokeWidth={1.5} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill={textColor}
                fontSize="6.5" fontFamily="Chakra Petch, monospace" fontWeight="600">
                {pos.short}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  function renderMpcSigning() {
    const awaitingCount = mpcQueue.filter(b => b.mpcStatus === "AWAITING_SIGNATURES" || b.mpcStatus === "THRESHOLD_MET").length;
    return (
      <div style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: C.fontTactical, fontSize: 15, fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase", color: C.yellow }}>
              MPC Threshold Signing
            </div>
            <div style={{ fontFamily: C.fontBody, fontSize: 11, color: C.amber, fontStyle: "italic", marginTop: 4 }}>
              ⚠️ Simulated MPC — cryptographic threshold signatures for demonstration purposes only
            </div>
          </div>
          <button onClick={createMpcBundle} disabled={!events.length || !globalRoot}
            style={btnPrimary(!events.length || !globalRoot)}>
            <Camera size={13} />CAPTURE MPC BUNDLE
          </button>
        </div>

        {mpcQueue.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
            <div style={{ fontFamily: C.fontTactical, fontSize: 13, letterSpacing: "0.08em",
              textTransform: "uppercase", marginBottom: 10 }}>No bundles queued</div>
            <div style={{ fontFamily: C.fontBody, fontSize: 12, lineHeight: 1.8 }}>
              Capture a bundle from the live event feed to begin MPC signing
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mpcQueue.map(bundle => {
              const log       = bundle.mpcSigningLog;
              const signed    = log.filter(e => e.decision === "SIGNED").length;
              const rejected  = log.filter(e => e.decision === "REJECTED").length;
              const THRESHOLD = 3;
              const threshMet    = signed >= THRESHOLD;
              const threshFailed = rejected >= THRESHOLD;
              const canBroadcast = bundle.mpcStatus === "THRESHOLD_MET";
              const isBroadcast  = bundle.mpcStatus === "BROADCAST";
              const isFailed     = bundle.mpcStatus === "FAILED";

              const statusColors = {
                AWAITING_SIGNATURES: { c: C.amber,  bg: C.amberBg,  bd: C.amberBd  },
                THRESHOLD_MET:       { c: C.green,  bg: C.greenBg,  bd: C.greenBd  },
                BROADCAST:           { c: C.violet, bg: C.violetBg, bd: C.violetBd },
                FAILED:              { c: C.red,    bg: C.redBg,    bd: C.redBd    },
              };
              const sc = statusColors[bundle.mpcStatus] || { c: C.muted, bg: C.surf2, bd: C.border };

              return (
                <div key={bundle.bundleId} style={{ ...panelCard, border: `1px solid ${sc.bd}` }}>

                  {/* Header row */}
                  <div style={{ ...sectionRule, borderBottomColor: sc.bd }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: C.fontTactical, fontSize: 9, fontWeight: 600,
                        letterSpacing: "0.1em", color: sc.c, background: sc.bg,
                        border: `1px solid ${sc.bd}`, padding: "2px 8px", borderRadius: 2 }}>
                        {bundle.mpcStatus.replace(/_/g, " ")}
                      </span>
                      <span style={{ fontFamily: C.fontCondensed, fontSize: 12, color: C.dim }}>
                        {bundle.eventCount} events
                      </span>
                      <span style={{ fontFamily: C.fontTactical, fontSize: 9, fontWeight: 600,
                        letterSpacing: "0.06em",
                        color: bundle.integrityStatus === "CLEAN" ? C.green : C.red,
                        background: bundle.integrityStatus === "CLEAN" ? C.greenBg : C.redBg,
                        border: `1px solid ${bundle.integrityStatus === "CLEAN" ? C.greenBd : C.redBd}`,
                        padding: "1px 6px", borderRadius: 2 }}>
                        {bundle.integrityStatus === "CLEAN" ? "CLEAN" : "VIOLATIONS"}
                      </span>
                    </div>
                    <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted }}>
                      {fmtTime(bundle.capturedAt)}
                    </span>
                  </div>

                  <div style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, marginBottom: 3 }}>
                    {bundle.bundleId.slice(0, 22)}…
                  </div>
                  <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: C.muted,
                    wordBreak: "break-all", lineHeight: 1.5, marginBottom: 12 }}>
                    root: {bundle.merkleRoot}
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: C.fontTactical, fontSize: 10, color: C.text,
                      letterSpacing: "0.04em", marginBottom: 5 }}>
                      {signed}/{MPC_NODES.length} signed · {rejected}/{MPC_NODES.length} rejected · need {THRESHOLD} to broadcast
                    </div>
                    <div style={{ height: 6, background: C.surf2, borderRadius: 3,
                      border: `1px solid ${C.border}`, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, transition: "width 400ms ease",
                        width: `${(signed / MPC_NODES.length) * 100}%`,
                        background: threshMet ? C.green : threshFailed ? C.red : C.amber }} />
                    </div>
                  </div>

                  {/* Failure banner */}
                  {isFailed && (
                    <div style={{ background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 4,
                      padding: "8px 12px", marginBottom: 12,
                      display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertTriangle size={14} color={C.red} />
                      <span style={{ fontFamily: C.fontTactical, fontSize: 11, fontWeight: 600,
                        color: C.red, letterSpacing: "0.06em" }}>
                        SIGNING FAILED — THRESHOLD NOT MET
                      </span>
                    </div>
                  )}

                  {/* Node cards grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 4 }}>
                    {MPC_NODES.map(node => {
                      const entry      = log.find(e => e.node === node.id);
                      const isSigned   = entry?.decision === "SIGNED";
                      const isRejected = entry?.decision === "REJECTED";
                      const isPending  = signingPending.has(`${bundle.bundleId}::${node.id}`);
                      const disabled   = isPending || threshMet || threshFailed || !!entry;
                      const nodeBg     = isSigned ? C.greenBg : isRejected ? C.redBg : C.surf2;
                      const nodeBd     = isSigned ? C.greenBd : isRejected ? C.redBd : C.border;
                      const nodeCol    = isSigned ? C.green   : isRejected ? C.red   : C.muted;
                      return (
                        <div key={node.id} style={{ background: nodeBg, border: `1px solid ${nodeBd}`,
                          borderRadius: 4, padding: "8px 7px" }}>
                          <div style={{ fontFamily: C.fontTactical, fontSize: 8.5, fontWeight: 600,
                            letterSpacing: "0.04em", marginBottom: 2,
                            color: isSigned ? C.green : isRejected ? C.red : C.yellow }}>
                            {node.id}
                          </div>
                          <div style={{ fontFamily: C.fontBody, fontSize: 9, color: C.muted,
                            lineHeight: 1.4, marginBottom: 5 }}>
                            {node.cmd}
                          </div>
                          <div style={{ fontFamily: C.fontTactical, fontSize: 9, fontWeight: 600,
                            letterSpacing: "0.06em", color: nodeCol, marginBottom: isSigned ? 4 : 6 }}>
                            {isPending ? "PROCESSING…" : isSigned ? "SIGNED" : isRejected ? "REJECTED" : "WAITING"}
                          </div>
                          {isSigned && entry.partialSig && (
                            <div style={{ fontFamily: C.fontMono, fontSize: 7, color: C.green,
                              wordBreak: "break-all", lineHeight: 1.4, marginBottom: 5 }}>
                              {entry.partialSig.slice(0, 8)}…{entry.partialSig.slice(-8)}
                            </div>
                          )}
                          {!entry && !isBroadcast && (
                            <div style={{ display: "flex", gap: 3 }}>
                              <button disabled={disabled}
                                onClick={() => handleNodeDecision(bundle.bundleId, node.id, "SIGNED")}
                                style={{ flex: 1, padding: "3px 0", fontSize: 10, borderRadius: 3,
                                  border: `1px solid ${C.greenBd}`, background: C.greenBg, color: C.green,
                                  cursor: disabled ? "not-allowed" : "pointer",
                                  opacity: disabled ? 0.45 : 1, fontFamily: C.fontTactical }}>
                                {isPending ? "…" : "✅"}
                              </button>
                              <button disabled={disabled}
                                onClick={() => handleNodeDecision(bundle.bundleId, node.id, "REJECTED")}
                                style={{ flex: 1, padding: "3px 0", fontSize: 10, borderRadius: 3,
                                  border: `1px solid ${C.redBd}`, background: C.redBg, color: C.red,
                                  cursor: disabled ? "not-allowed" : "pointer",
                                  opacity: disabled ? 0.45 : 1, fontFamily: C.fontTactical }}>
                                {isPending ? "…" : "❌"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Pentagon topology diagram */}
                  {renderPentagon(log)}

                  {/* Combine & Broadcast */}
                  {canBroadcast && (
                    <button onClick={() => handleCombineAndBroadcast(bundle.bundleId)}
                      style={{ ...btnPrimary(false), marginTop: 14 }}>
                      🔐 Combine & Broadcast
                    </button>
                  )}

                  {/* Broadcast result */}
                  {isBroadcast && (
                    <div style={{ marginTop: 12, background: C.violetBg,
                      border: `1px solid ${C.violetBd}`, borderRadius: 4, padding: "10px 12px" }}>
                      <div style={{ fontFamily: C.fontTactical, fontSize: 11, fontWeight: 600,
                        color: C.violet, letterSpacing: "0.06em", marginBottom: 6 }}>
                        BROADCAST COMPLETE — DEMO TXID
                      </div>
                      <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: C.violet,
                        wordBreak: "break-all", lineHeight: 1.6, marginBottom: 4 }}>
                        txid: {bundle.txid}
                      </div>
                      <div style={{ fontFamily: C.fontMono, fontSize: 7.5, color: C.muted,
                        wordBreak: "break-all", lineHeight: 1.6 }}>
                        combined sig: {bundle.combinedSignature}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Root render ───────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: C.fontBody, background: C.bg, color: C.text, minHeight: "100vh", fontSize: 14 }}>

      {/* Header */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`,
        padding: "10px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ background: C.yellowBg, border: `1px solid ${C.yellowBd}`,
            color: C.yellow, fontFamily: C.fontTactical, fontSize: 10, fontWeight: 600,
            padding: "3px 10px", borderRadius: 2, letterSpacing: "0.12em" }}>
            UNCLASSIFIED // DEMO
          </div>
          <div>
            <div style={{ fontFamily: C.fontTactical, fontSize: 16, fontWeight: 600,
              letterSpacing: "0.04em", textTransform: "uppercase", color: C.text }}>
              Immutable DoDIN — Federated Merkle Audit
            </div>
            <div style={{ fontFamily: C.fontBody, fontSize: 12, color: C.muted, marginTop: 2 }}>
              Hierarchical Merkle Tree — Bitcoin Testnet Anchor
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[
            { id: "hashforce",    label: "HASH FORCE",    sub: "Operator View"                              },
            { id: "mpc",          label: "MPC SIGNING",   sub: `${mpcQueue.filter(b => ["AWAITING_SIGNATURES","THRESHOLD_MET"].includes(b.mpcStatus)).length} pending`, mpcBadge: true },
            { id: "cybercommand", label: "CYBER COMMAND", sub: `${transmittedBundles.length} bundles`       },
            { id: "both",         label: "BOTH",          sub: "Split View"                                  },
          ].map(tab => (
            <button key={tab.id} onClick={() => setPanel(tab.id)} style={{
              padding: "6px 14px", borderRadius: 4, cursor: "pointer", textAlign: "left", position: "relative",
              border:     `1px solid ${panel === tab.id ? (tab.mpcBadge ? C.amberBd : C.yellowBd) : C.border}`,
              background: panel === tab.id ? (tab.mpcBadge ? C.amberBg : C.yellowBg) : C.surf2,
              color:      panel === tab.id ? (tab.mpcBadge ? C.amber : C.yellow) : C.dim,
              transition: "border-color 200ms, background 200ms",
            }}>
              <div style={{ fontFamily: C.fontTactical, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.06em" }}>{tab.label}</div>
              <div style={{ fontFamily: C.fontBody, fontSize: 10, opacity: 0.7, marginTop: 1 }}>{tab.sub}</div>
            </button>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8,
            paddingLeft: 12, borderLeft: `1px solid ${C.border}` }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%",
              background: isRunning ? C.green : C.amber }} />
            <span style={{ fontFamily: C.fontTactical, fontSize: 11, fontWeight: 600,
              color: isRunning ? C.green : C.amber, letterSpacing: "0.08em" }}>
              {isRunning ? "LIVE" : "PAUSED"}
            </span>
            <button onClick={() => setIsRunning(r => !r)} style={{ display: "flex", alignItems: "center",
              gap: 5, padding: "5px 12px", borderRadius: 4, border: `1px solid ${C.borderHi}`,
              background: C.surf2, color: C.text, cursor: "pointer",
              fontFamily: C.fontTactical, fontSize: 11, letterSpacing: "0.04em" }}>
              {isRunning ? <><Pause size={12} />Pause</> : <><Play size={12} />Resume</>}
            </button>
          </div>
        </div>
      </div>

      {/* Integrity violation alert */}
      {tamperAlert && (
        <div style={{ background: C.redBg, borderBottom: `1px solid ${C.redBd}`,
          borderLeft: `2px solid ${C.red}`, padding: "10px 20px",
          display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AlertTriangle size={18} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: C.fontTactical, fontWeight: 600, color: C.red,
              fontSize: 13, letterSpacing: "0.06em" }}>
              INTEGRITY VIOLATION DETECTED — ENDPOINT QUARANTINED
            </div>
            <div style={{ fontFamily: C.fontBody, fontSize: 12, color: C.red, opacity: 0.85, marginTop: 3 }}>
              Endpoint: <strong>{tamperAlert.endpoint}</strong> — File: <span style={{ fontFamily: C.fontMono }}>{tamperAlert.file}</span>
            </div>
            <div style={{ fontFamily: C.fontMono, fontSize: 8, color: C.red, opacity: 0.6,
              marginTop: 4, lineHeight: 1.8 }}>
              PREV: {tamperAlert.oldRoot}<br />NOW:&nbsp; {tamperAlert.newRoot}
            </div>
          </div>
          <button onClick={() => setTamperAlert(null)} style={{ background: "transparent",
            border: `1px solid ${C.redBd}`, color: C.red, cursor: "pointer",
            padding: "3px 8px", borderRadius: 4, fontFamily: C.fontTactical, fontSize: 11 }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Hash Force */}
      {(panel === "hashforce" || panel === "both") && (
        <div style={{ padding: panel === "both" ? "12px 16px" : "14px 20px",
          display: "flex", flexDirection: "column", gap: 12,
          borderBottom: panel === "both" ? `2px solid ${C.borderHi}` : "none" }}>
          {panel === "both" && (
            <div style={{ ...eyebrow, color: C.yellow }}>Hash Force — Operator View</div>
          )}
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

      {/* MPC Signing */}
      {panel === "mpc" && renderMpcSigning()}

      {/* Cyber Command */}
      {(panel === "cybercommand" || panel === "both") && renderCyberCommand()}
    </div>
  );
}
