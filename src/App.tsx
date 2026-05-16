// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
// ─────────────────────────────────────────────
// FIREBASE CONFIGURATION
// Replace these placeholder values with your own Firebase project credentials.
// Steps: console.firebase.google.com → New Project → Add Web App → Copy config below
// ─────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDHv3C4tCYbxdh68HZJrDgi3SUGN7qL1hU',
  authDomain: 'outreachledger.firebaseapp.com',
  databaseURL: 'https://outreachledger-default-rtdb.firebaseio.com',
  projectId: 'outreachledger',
  storageBucket: 'outreachledger.firebasestorage.app',
  messagingSenderId: '687250523909',
  appId: '1:687250523909:web:8ca55a48e62b4fc8fe996c',
};

const ADMIN_PIN = '2123'; // Change to your preferred PIN before deploying

// ─────────────────────────────────────────────
// FIREBASE SDK loaded dynamically
// ─────────────────────────────────────────────
let db = null;
let fbReady = false;
const fbQueue = [];

function onFbReady(cb) {
  if (fbReady) {
    cb(db);
    return;
  }
  fbQueue.push(cb);
}

function initFirebase() {
  const s1 = document.createElement('script');
  s1.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src =
      'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js';
    s2.onload = () => {
      try {
        if (!window.firebase.apps.length)
          window.firebase.initializeApp(FIREBASE_CONFIG);
        db = window.firebase.database();
        fbReady = true;
        fbQueue.forEach((cb) => cb(db));
      } catch (e) {
        console.error('Firebase init failed:', e);
      }
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

function loadJsPDF(cb) {
  if (window.jspdf) {
    cb(window.jspdf.jsPDF);
    return;
  }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  s.onload = () => cb(window.jspdf.jsPDF);
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(n || 0);
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const INFLOW_CATS = [
  'Donation',
  'Church / Organisation',
  'Individual Gift',
  'Grant',
  'Tithe / Offering',
  'Other',
];
const OUTFLOW_CATS = [
  'Food & Refreshment',
  'Transport',
  'Venue / Hall',
  'Materials / Stationery',
  'Welfare / Gifts',
  'Admin & Logistics',
  'Other',
];

const DEMO_MODE = FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY';

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const C = {
  bg: '#ffffff',
  surface: '#f4f6f9',
  surfaceHigh: '#e8edf4',
  border: '#d0dae8',
  textPrimary: '#050f1a',
  textSecondary: '#1e3a52',
  textMuted: '#4a6a84',
  green: '#0a9e62',
  greenDim: '#e6f7f0',
  red: '#d63b3b',
  redDim: '#fdf0f0',
  blue: '#2a7fd4',
  blueDim: '#eaf3fd',
  gold: '#b07d10',
};

const inp = {
  width: '100%',
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  padding: '10px 13px',
  color: C.textPrimary,
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const mkBtn = (bg, fg, border) => ({
  background: bg,
  border: `1px solid ${border || fg + '44'}`,
  borderRadius: 7,
  padding: '8px 16px',
  color: fg,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  letterSpacing: 0.3,
});

function blankForm(type) {
  return {
    type,
    description: '',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    receipt: null,
    receiptPreview: null,
    note: '',
  };
}

// ─────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────
export default function OutreachLedger() {
  const [transactions, setTransactions] = useState([]);
  const [outreachName, setOutreachName] = useState('Outreach Fund Ledger');
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [view, setView] = useState('public');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [modal, setModal] = useState(null);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(blankForm('inflow'));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [fbStatus, setFbStatus] = useState('connecting');
  const [exportLoading, setExportLoading] = useState(false);
  const [search, setSearch] = useState('');
  const fileRef = useRef();
  const dbRef = useRef(null);

  // ── Firebase / demo init ──
  useEffect(() => {
    if (DEMO_MODE) {
      setFbStatus('demo');
      try {
        const stored = JSON.parse(
          localStorage.getItem('outreach-demo') || '{}'
        );
        if (stored.transactions) setTransactions(stored.transactions);
        if (stored.outreachName) setOutreachName(stored.outreachName);
      } catch {}
      return;
    }
    initFirebase();
    onFbReady((database) => {
      dbRef.current = database;
      setFbStatus('live');
      database.ref('ledger/transactions').on('value', (snap) => {
        const val = snap.val();
        if (val) {
          const list = Object.entries(val).map(([id, tx]) => ({ id, ...tx }));
          list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          setTransactions(list);
        } else setTransactions([]);
      });
      database.ref('ledger/settings/outreachName').on('value', (snap) => {
        if (snap.val()) setOutreachName(snap.val());
      });
    });
    return () => {
      if (dbRef.current) {
        dbRef.current.ref('ledger/transactions').off();
        dbRef.current.ref('ledger/settings/outreachName').off();
      }
    };
  }, []);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const demoSave = useCallback((txs, name) => {
    localStorage.setItem(
      'outreach-demo',
      JSON.stringify({ transactions: txs, outreachName: name })
    );
  }, []);

  // ── Auth ──
  const handlePin = () => {
    if (pin === ADMIN_PIN) {
      setView('admin');
      setPinError(false);
      setPin('');
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 2000);
    }
  };

  // ── Edit outreach name ──
  const saveName = async () => {
    const name = tempName.trim();
    if (!name) return;
    if (DEMO_MODE) {
      setOutreachName(name);
      demoSave(transactions, name);
    } else if (dbRef.current)
      await dbRef.current.ref('ledger/settings/outreachName').set(name);
    setEditingName(false);
    showToast('Outreach name updated');
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (
      !form.description.trim() ||
      !form.amount ||
      isNaN(Number(form.amount)) ||
      Number(form.amount) <= 0
    ) {
      showToast('Please enter a description and valid amount', 'error');
      return;
    }
    setSaving(true);
    const tx = {
      type: form.type,
      description: form.description.trim(),
      amount: Number(form.amount),
      category: form.category,
      date: form.date,
      receipt: form.receipt || null,
      note: form.note.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      if (DEMO_MODE) {
        const id = Date.now().toString();
        const newTxs = [{ id, ...tx }, ...transactions];
        setTransactions(newTxs);
        demoSave(newTxs, outreachName);
      } else {
        await dbRef.current.ref('ledger/transactions').push(tx);
      }
      setModal(null);
      setForm(blankForm('inflow'));
      showToast('Transaction recorded');
    } catch {
      showToast('Save failed — check Firebase config', 'error');
    }
    setSaving(false);
  };

  // ── Delete ──
  const handleDelete = async (tx) => {
    if (!window.confirm(`Delete "${tx.description}"?`)) return;
    if (DEMO_MODE) {
      const newTxs = transactions.filter((t) => t.id !== tx.id);
      setTransactions(newTxs);
      demoSave(newTxs, outreachName);
    } else {
      await dbRef.current.ref(`ledger/transactions/${tx.id}`).remove();
    }
    showToast('Deleted');
  };

  // ── File ──
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Max file size is 2MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) =>
      setForm((f) => ({
        ...f,
        receipt: ev.target.result,
        receiptPreview: ev.target.result,
      }));
    reader.readAsDataURL(file);
  };

  // ── PDF Export ──
  const exportPDF = () => {
    setExportLoading(true);
    loadJsPDF((JsPDF) => {
      const doc = new JsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const W = 210,
        M = 15;
      let y = M;

      // Header band
      doc.setFillColor(7, 9, 15);
      doc.rect(0, 0, W, 42, 'F');
      doc.setFillColor(13, 214, 134, 0.15);
      doc.rect(0, 40, W, 2, 'F');
      doc.setTextColor(220, 235, 245);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(outreachName, M, 22);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(92, 122, 150);
      doc.text(
        `Public Transparency Ledger  ·  Exported ${new Date().toLocaleDateString(
          'en-NG',
          { day: '2-digit', month: 'long', year: 'numeric' }
        )}`,
        M,
        33
      );
      y = 54;

      // Summary boxes
      const sumItems = [
        { label: 'Total Inflows', val: fmt(totalIn), r: 13, g: 214, b: 134 },
        { label: 'Total Expenses', val: fmt(totalOut), r: 240, g: 79, b: 79 },
        { label: 'Net Balance', val: fmt(balance), r: 77, g: 166, b: 255 },
      ];
      const boxW = (W - M * 2 - 8) / 3;
      sumItems.forEach((s, i) => {
        const bx = M + i * (boxW + 4);
        doc.setFillColor(13, 18, 32);
        doc.roundedRect(bx, y, boxW, 22, 2, 2, 'F');
        doc.setFontSize(7.5);
        doc.setTextColor(92, 122, 150);
        doc.text(s.label.toUpperCase(), bx + 5, y + 8);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(s.r, s.g, s.b);
        doc.text(s.val, bx + 5, y + 17);
        doc.setFont('helvetica', 'normal');
      });
      y += 30;

      // Column headers
      doc.setFontSize(7.5);
      doc.setTextColor(45, 69, 96);
      const cols = [M, M + 22, M + 80, M + 118, M + 143];
      ['DATE', 'DESCRIPTION', 'CATEGORY', 'TYPE', 'AMOUNT'].forEach((h, i) => {
        if (i === 4) doc.text(h, W - M, y, { align: 'right' });
        else doc.text(h, cols[i], y);
      });
      y += 3;
      doc.setDrawColor(26, 39, 64);
      doc.line(M, y, W - M, y);
      y += 6;

      // Rows
      const exportRows = txs.length > 0 ? txs : transactions;
      exportRows.forEach((tx, i) => {
        if (y > 272) {
          doc.addPage();
          y = M + 10;
        }
        if (i % 2 === 0) {
          doc.setFillColor(11, 17, 28);
          doc.rect(M - 2, y - 4, W - M * 2 + 4, 9, 'F');
        }
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180, 205, 225);
        doc.text(fmtDate(tx.date), cols[0], y);
        const desc =
          tx.description.length > 30
            ? tx.description.slice(0, 28) + '…'
            : tx.description;
        doc.text(desc, cols[1], y);
        doc.text(tx.category || '—', cols[2], y);
        const isIn = tx.type === 'inflow';
        doc.setTextColor(isIn ? 13 : 220, isIn ? 214 : 60, isIn ? 134 : 60);
        doc.text(isIn ? 'Inflow' : 'Expense', cols[3], y);
        doc.setFont('helvetica', 'bold');
        doc.text(
          `${isIn ? '+' : '−'}${tx.amount.toLocaleString('en-NG')}`,
          W - M,
          y,
          { align: 'right' }
        );
        doc.setFont('helvetica', 'normal');
        y += 9;
      });

      // Footer
      y += 8;
      doc.setFontSize(8);
      doc.setTextColor(45, 69, 96);
      doc.text(
        `${transactions.length} total transactions  ·  Generated by Outreach Ledger`,
        M,
        y
      );

      doc.save(`${outreachName.replace(/\s+/g, '_')}_Ledger.pdf`);
      setExportLoading(false);
      showToast('PDF downloaded');
    });
  };

  // ── Derived ──
  const totalIn = transactions
    .filter((t) => t.type === 'inflow')
    .reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions
    .filter((t) => t.type === 'outflow')
    .reduce((s, t) => s + t.amount, 0);
  const balance = totalIn - totalOut;

  const txs = transactions.filter((t) => {
    const mf = filter === 'all' || t.type === filter;
    const ms =
      !search ||
      [t.description, t.category, t.note]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());
    return mf && ms;
  });

  // Running balance map
  const balMap = (() => {
    let run = 0;
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    const m = {};
    sorted.forEach((t) => {
      run += t.type === 'inflow' ? t.amount : -t.amount;
      m[t.id] = run;
    });
    return m;
  })();

  // ─────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
        color: C.textPrimary,
      }}
    >
      {/* Demo banner */}
      {DEMO_MODE && (
        <div
          style={{
            background: '#fffbea',
            borderBottom: `1px solid ${C.gold}55`,
            padding: '8px 28px',
            fontSize: 12,
            color: C.gold,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <span>⚠</span>
          <span>
            <strong>Demo mode — local storage only.</strong> To enable real-time
            Firebase sync, replace the placeholder config at the top of the code
            with your Firebase project credentials.
          </span>
        </div>
      )}

      {/* Header */}
      <header
        style={{
          background: `linear-gradient(180deg, #eaf1f8 0%, ${C.surface} 100%)`,
          borderBottom: `1px solid ${C.border}`,
          padding: '18px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: `linear-gradient(135deg, ${C.green}18, ${C.blue}18)`,
            border: `1px solid ${C.green}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          🕊
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          {editingName && view === 'admin' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                autoFocus
                style={{
                  ...inp,
                  fontSize: 17,
                  fontWeight: 700,
                  padding: '5px 10px',
                  maxWidth: 300,
                }}
              />
              <button onClick={saveName} style={mkBtn(C.greenDim, C.green)}>
                Save
              </button>
              <button
                onClick={() => setEditingName(false)}
                style={mkBtn('transparent', C.textSecondary, C.border)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 19,
                  fontWeight: 700,
                  color: C.textPrimary,
                  letterSpacing: -0.3,
                }}
              >
                {outreachName}
              </h1>
              {view === 'admin' && (
                <button
                  onClick={() => {
                    setTempName(outreachName);
                    setEditingName(true);
                  }}
                  title="Edit name"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: C.textMuted,
                    cursor: 'pointer',
                    fontSize: 15,
                    padding: 3,
                  }}
                >
                  ✎
                </button>
              )}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background:
                  fbStatus === 'live'
                    ? C.green
                    : fbStatus === 'demo'
                    ? C.gold
                    : C.textMuted,
                boxShadow: fbStatus === 'live' ? `0 0 7px ${C.green}` : 'none',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: C.textSecondary,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              {fbStatus === 'live'
                ? 'Live · Firebase Synced'
                : fbStatus === 'demo'
                ? 'Demo · Local Only'
                : 'Connecting…'}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {view === 'admin' ? (
            <>
              <button
                onClick={() => {
                  setForm(blankForm('inflow'));
                  setModal('form');
                }}
                style={mkBtn(C.greenDim, C.green)}
              >
                + Inflow
              </button>
              <button
                onClick={() => {
                  setForm(blankForm('outflow'));
                  setModal('form');
                }}
                style={mkBtn(C.redDim, C.red)}
              >
                + Expense
              </button>
              <button
                onClick={exportPDF}
                disabled={exportLoading}
                style={mkBtn(C.blueDim, C.blue)}
              >
                {exportLoading ? 'Exporting…' : '↓ PDF'}
              </button>
              <button
                onClick={() => setView('public')}
                style={mkBtn(C.surfaceHigh, C.textSecondary, C.border)}
              >
                Exit Admin
              </button>
            </>
          ) : (
            <>
              <button
                onClick={exportPDF}
                disabled={exportLoading}
                style={mkBtn(C.blueDim, C.blue)}
              >
                {exportLoading ? '…' : '↓ PDF'}
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePin()}
                  type="password"
                  placeholder="Admin PIN"
                  style={{
                    ...inp,
                    width: 110,
                    padding: '7px 11px',
                    fontSize: 13,
                    border: `1px solid ${pinError ? C.red : C.border}`,
                  }}
                />
                <button onClick={handlePin} style={mkBtn(C.blueDim, C.blue)}>
                  Enter
                </button>
              </div>
              {pinError && (
                <span
                  style={{
                    color: C.red,
                    fontSize: 12,
                    animation: 'shake 0.3s',
                  }}
                >
                  Wrong PIN
                </span>
              )}
            </>
          )}
        </div>
      </header>

      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: 14,
          padding: '24px 28px 0',
        }}
      >
        {[
          {
            label: 'Total Inflows',
            value: fmt(totalIn),
            color: C.green,
            icon: '↑',
            sub: `${
              transactions.filter((t) => t.type === 'inflow').length
            } transactions`,
          },
          {
            label: 'Total Expenses',
            value: fmt(totalOut),
            color: C.red,
            icon: '↓',
            sub: `${
              transactions.filter((t) => t.type === 'outflow').length
            } transactions`,
          },
          {
            label: 'Net Balance',
            value: fmt(balance),
            color: balance >= 0 ? C.blue : C.gold,
            icon: '≡',
            sub: balance >= 0 ? 'Surplus' : 'Deficit',
            large: true,
          },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              background: C.surface,
              border: `1px solid ${c.color}18`,
              borderTop: `2px solid ${c.color}`,
              borderRadius: 10,
              padding: '18px 20px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: 14,
                top: 14,
                fontSize: 30,
                color: c.color + '14',
                fontWeight: 900,
                userSelect: 'none',
              }}
            >
              {c.icon}
            </div>
            <div
              style={{
                fontSize: 10,
                color: C.textSecondary,
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 8,
                fontWeight: 700,
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: c.large ? 24 : 20,
                fontWeight: 700,
                color: c.color,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {c.value}
            </div>
            <div style={{ fontSize: 11, color: c.color + '88', marginTop: 5 }}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div
        style={{
          padding: '20px 28px 0',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {[
          ['all', 'All'],
          ['inflow', 'Inflows'],
          ['outflow', 'Expenses'],
        ].map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 15px',
              borderRadius: 20,
              border: '1px solid',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: 0.5,
              transition: 'all 0.15s',
              background:
                filter === f
                  ? f === 'inflow'
                    ? C.greenDim
                    : f === 'outflow'
                    ? C.redDim
                    : C.blueDim
                  : 'transparent',
              color:
                filter === f
                  ? f === 'inflow'
                    ? C.green
                    : f === 'outflow'
                    ? C.red
                    : C.blue
                  : C.textSecondary,
              borderColor: filter === f ? 'currentColor' : C.border,
            }}
          >
            {label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            ...inp,
            maxWidth: 230,
            padding: '6px 12px',
            fontSize: 13,
            marginLeft: 'auto',
          }}
        />
        <span
          style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}
        >
          {txs.length} record{txs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Transaction list */}
      <div style={{ padding: '16px 28px 70px' }}>
        {txs.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '96px 1fr 120px 84px 120px 120px 72px',
              gap: 8,
              padding: '7px 14px',
              borderBottom: `1px solid ${C.border}`,
              marginBottom: 4,
            }}
          >
            {[
              'Date',
              'Description',
              'Category',
              'Type',
              'Amount',
              'Balance',
              '',
            ].map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: 9.5,
                  color: C.textMuted,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  textAlign: i >= 4 ? 'right' : 'left',
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}

        {txs.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '100px 0',
              color: C.textSecondary,
            }}
          >
            <div style={{ fontSize: 46, marginBottom: 14 }}>📋</div>
            <div style={{ fontSize: 17, color: C.textPrimary }}>
              No transactions recorded
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              {view === 'admin'
                ? 'Use the buttons above to log inflows and expenses.'
                : 'The admin will record transactions here for public viewing.'}
            </div>
          </div>
        ) : (
          txs.map((tx, i) => (
            <div
              key={tx.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '96px 1fr 120px 84px 120px 120px 72px',
                gap: 8,
                padding: '11px 14px',
                borderBottom: `1px solid ${C.border}18`,
                borderLeft: `3px solid ${
                  tx.type === 'inflow' ? C.green : C.red
                }`,
                background: i % 2 === 0 ? C.surface : 'transparent',
                borderRadius: 6,
                marginBottom: 3,
                alignItems: 'center',
                animation: `fadeUp 0.25s ease ${Math.min(
                  i * 0.025,
                  0.4
                )}s both`,
              }}
            >
              <div style={{ fontSize: 11.5, color: C.textSecondary }}>
                {fmtDate(tx.date)}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 13.5,
                    color: C.textPrimary,
                    fontWeight: 600,
                  }}
                >
                  {tx.description}
                </div>
                {tx.note && (
                  <div
                    style={{
                      fontSize: 11,
                      color: C.textMuted,
                      marginTop: 2,
                      fontStyle: 'italic',
                    }}
                  >
                    {tx.note}
                  </div>
                )}
              </div>
              <div>
                {tx.category ? (
                  <span
                    style={{
                      background: C.surfaceHigh,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      padding: '2px 7px',
                      fontSize: 11,
                      color: C.textSecondary,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tx.category}
                  </span>
                ) : (
                  <span style={{ color: C.textMuted, fontSize: 11 }}>—</span>
                )}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    color: tx.type === 'inflow' ? C.green : C.red,
                    background: tx.type === 'inflow' ? C.greenDim : C.redDim,
                    border: `1px solid ${
                      tx.type === 'inflow' ? C.green : C.red
                    }28`,
                    borderRadius: 4,
                    padding: '2px 7px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tx.type === 'inflow' ? 'IN' : 'OUT'}
                </span>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 14,
                  fontWeight: 700,
                  color: tx.type === 'inflow' ? C.green : C.red,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {tx.type === 'inflow' ? '+' : '−'}
                {tx.amount.toLocaleString('en-NG')}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 12,
                  color: (balMap[tx.id] || 0) >= 0 ? C.blue : C.gold,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmt(balMap[tx.id])}
              </div>
              <div
                style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}
              >
                {tx.receipt && (
                  <button
                    onClick={() => {
                      setActiveReceipt(tx.receipt);
                      setModal('receipt');
                    }}
                    title="View receipt"
                    style={{
                      background: C.blueDim,
                      border: `1px solid ${C.blue}28`,
                      borderRadius: 5,
                      padding: '4px 8px',
                      color: C.blue,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    📎
                  </button>
                )}
                {view === 'admin' && (
                  <button
                    onClick={() => handleDelete(tx)}
                    title="Delete"
                    style={{
                      background: 'transparent',
                      border: `1px solid ${C.redDim}`,
                      borderRadius: 5,
                      padding: '4px 8px',
                      color: C.red + '77',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Form modal */}
      {modal === 'form' && (
        <Overlay onClose={() => setModal(null)}>
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: 28,
              width: '100%',
              maxWidth: 490,
              maxHeight: '92vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 17, color: C.textPrimary }}>
                Record {form.type === 'inflow' ? 'Inflow' : 'Expense'}
              </h2>
              <div style={{ display: 'flex', gap: 6 }}>
                {['inflow', 'outflow'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    style={{
                      ...mkBtn(
                        form.type === t
                          ? t === 'inflow'
                            ? C.greenDim
                            : C.redDim
                          : 'transparent',
                        form.type === t
                          ? t === 'inflow'
                            ? C.green
                            : C.red
                          : C.textSecondary,
                        C.border
                      ),
                      padding: '5px 12px',
                      fontSize: 12,
                    }}
                  >
                    {t === 'inflow' ? 'Inflow' : 'Expense'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <FF label="Description *">
                <input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder={
                    form.type === 'inflow'
                      ? 'e.g. Donation from Bro. Emeka'
                      : 'e.g. 10 bags of rice for beneficiaries'
                  }
                  style={inp}
                />
              </FF>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <FF label="Amount (₦) *">
                  <input
                    value={form.amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    type="number"
                    min="0"
                    placeholder="0"
                    style={inp}
                  />
                </FF>
                <FF label="Date">
                  <input
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                    type="date"
                    style={inp}
                  />
                </FF>
              </div>
              <FF label="Category">
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  style={inp}
                >
                  <option value="">Select category</option>
                  {(form.type === 'inflow' ? INFLOW_CATS : OUTFLOW_CATS).map(
                    (c) => (
                      <option key={c}>{c}</option>
                    )
                  )}
                </select>
              </FF>
              <FF label="Note (optional)">
                <input
                  value={form.note}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, note: e.target.value }))
                  }
                  placeholder="Additional detail…"
                  style={inp}
                />
              </FF>

              {form.type === 'outflow' && (
                <FF label="Receipt / Evidence">
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: `2px dashed ${C.border}`,
                      borderRadius: 8,
                      padding: 18,
                      textAlign: 'center',
                      cursor: 'pointer',
                      color: C.textSecondary,
                      fontSize: 13,
                      background: C.bg,
                    }}
                  >
                    {form.receiptPreview ? (
                      <img
                        src={form.receiptPreview}
                        alt="receipt"
                        style={{
                          maxHeight: 130,
                          maxWidth: '100%',
                          borderRadius: 6,
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <>
                        <div style={{ fontSize: 26, marginBottom: 6 }}>📎</div>
                        <div>Click to attach receipt photo</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: C.textMuted,
                            marginTop: 3,
                          }}
                        >
                          JPG · PNG · WEBP — max 2MB
                        </div>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFile}
                  />
                  {form.receiptPreview && (
                    <button
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          receipt: null,
                          receiptPreview: null,
                        }))
                      }
                      style={{
                        marginTop: 5,
                        background: 'none',
                        border: 'none',
                        color: C.red,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontFamily: 'inherit',
                      }}
                    >
                      Remove receipt
                    </button>
                  )}
                </FF>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  ...mkBtn(
                    form.type === 'inflow' ? C.greenDim : C.redDim,
                    form.type === 'inflow' ? C.green : C.red
                  ),
                  flex: 1,
                  padding: '11px 0',
                  fontSize: 15,
                }}
              >
                {saving ? 'Saving…' : 'Save Transaction'}
              </button>
              <button
                onClick={() => setModal(null)}
                style={{
                  ...mkBtn(C.surfaceHigh, C.textSecondary, C.border),
                  padding: '11px 18px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Receipt viewer */}
      {modal === 'receipt' && activeReceipt && (
        <Overlay
          onClose={() => {
            setModal(null);
            setActiveReceipt(null);
          }}
        >
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              overflow: 'hidden',
              maxWidth: 580,
              width: '100%',
              maxHeight: '90vh',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: C.textSecondary,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}
              >
                Expense Receipt
              </span>
              <button
                onClick={() => {
                  setModal(null);
                  setActiveReceipt(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: C.textSecondary,
                  cursor: 'pointer',
                  fontSize: 22,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                padding: 16,
                overflowY: 'auto',
                maxHeight: 'calc(90vh - 54px)',
                textAlign: 'center',
              }}
            >
              <img
                src={activeReceipt}
                alt="Receipt"
                style={{ maxWidth: '100%', borderRadius: 8 }}
              />
            </div>
          </div>
        </Overlay>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: toast.type === 'error' ? C.redDim : C.greenDim,
            border: `1px solid ${toast.type === 'error' ? C.red : C.green}`,
            borderRadius: 8,
            padding: '10px 18px',
            color: toast.type === 'error' ? C.red : C.green,
            fontSize: 14,
            zIndex: 500,
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            animation: 'fadeUp 0.2s ease',
          }}
        >
          {toast.type === 'error' ? '⚠ ' : '✓ '}
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #c0cfe0; border-radius: 3px; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: none; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        select option { background: #ffffff; color: #0f1e30; }
      `}</style>
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.84)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
        padding: 20,
        backdropFilter: 'blur(5px)',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

function FF({ label, children }) {
  return (
    <div>
      <label
        style={{
          fontSize: 10.5,
          color: '#5c7a96',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: 7,
          fontFamily: 'inherit',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
