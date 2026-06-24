/**
 * IUIU Smart Parking — Root Application
 * Split-panel enterprise login + role-based routing
 */
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminDashboard             from './views/AdminDashboard';
import ParkingAttendantDashboard  from './views/ParkingAttendantDashboard';
import EntranceAttendantDashboard from './views/EntranceAttendantDashboard';
import ExitAttendantDashboard     from './views/ExitAttendantDashboard';
import EntrancePanel              from './views/EntrancePanel';
import ExitDisplay                from './views/ExitDisplay';
import { C, GLOBAL_CSS, F, R, SH } from './theme';

// ─────────────────────────────────────────────────────────────────────────────
// STATIC DATA
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = [
  { label: 'Administrator',       icon: '⚙️',  color: C.green,  sub: 'Full system access'       },
  { label: 'Entrance Attendant',  icon: '🚗',  color: C.blue,   sub: 'Vehicle check-in'         },
  { label: 'Exit Attendant',      icon: '💳',  color: C.purple, sub: 'Payment & checkout'       },
  { label: 'Parking Attendant',   icon: '🅿️',  color: C.amber,  sub: 'Floor-level assistance'  },
];

const STATS = [
  { label: 'Total Slots',    value: '120', icon: '🏢' },
  { label: 'Available',      value: '47',  icon: '🟢' },
  { label: 'Occupied',       value: '73',  icon: '🔴' },
  { label: 'Today Revenue',  value: 'UGX 284K', icon: '💰' },
];

// ─────────────────────────────────────────────────────────────────────────────
// LEFT PANEL — branding + live stats
// ─────────────────────────────────────────────────────────────────────────────

function LeftPanel() {
  return (
    <div style={S.left}>
      {/* Decorative circles */}
      <div style={S.deco1} />
      <div style={S.deco2} />
      <div style={S.deco3} />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {/* Logo */}
        <div>
          <div style={S.logo}>
            <span style={{ fontSize: 28 }}>🅿</span>
          </div>
          <h1 style={S.leftTitle}>IUIU Smart<br />Parking System</h1>
          <p style={S.leftSub}>Kampala Campus · Intelligent Access Control</p>
        </div>

        {/* Live stats grid */}
        <div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: F.xs, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
            Live System Status
          </p>
          <div style={S.statsGrid}>
            {STATS.map(s => (
              <div key={s.label} style={S.statCard}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <div style={{ fontSize: F['2xl'], fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: F.xs, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Role legend */}
        <div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: F.xs, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
            System Roles
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ROLES.map(r => (
              <div key={r.label} style={S.roleRow}>
                <span style={{ fontSize: 16 }}>{r.icon}</span>
                <div>
                  <div style={{ fontSize: F.base, color: '#fff', fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: F.xs, color: 'rgba(255,255,255,0.5)' }}>{r.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: F.xs, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
          Islamic University in Uganda · IT Department · v2.0
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RIGHT PANEL — login form
// ─────────────────────────────────────────────────────────────────────────────

function LoginForm() {
  const { login, signup } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role,     setRole]     = useState<any>('admin');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await signup(username.trim(), password, role);
      } else {
        await login(username.trim(), password);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.right}>
      <div style={S.formWrap}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: F['3xl'], fontWeight: 800, color: C.text, letterSpacing: -0.5, lineHeight: 1.2 }}>
            {isSignUp ? 'Create Account' : 'Welcome back'}
          </h2>
          <p style={{ color: C.textMid, marginTop: 6, fontSize: F.base }}>
            {isSignUp ? 'Register a new parking management account' : 'Sign in to your parking management account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Role (SignUp Only) */}
          {isSignUp && (
            <div style={S.field}>
              <label style={S.label}>Role</label>
              <div style={S.inputWrap}>
                <select 
                  style={S.input} 
                  value={role} 
                  onChange={e => setRole(e.target.value)}
                >
                  <option value="admin">Administrator</option>
                  <option value="entrance_attendant">Entrance Attendant</option>
                  <option value="exit_attendant">Exit Attendant</option>
                  <option value="attendant">Parking Attendant</option>
                  <option value="entrance_display">Entrance Display</option>
                  <option value="exit_display">Exit Display</option>
                </select>
              </div>
            </div>
          )}

          {/* Username */}
          <div style={S.field}>
            <label style={S.label}>Username</label>
            <div style={S.inputWrap}>
              <svg style={S.fieldIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              <input
                style={S.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          {/* Password */}
          <div style={S.field}>
            <label style={S.label}>Password</label>
            <div style={S.inputWrap}>
              <svg style={S.fieldIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                style={{ ...S.input, paddingRight: 44 }}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPw(p => !p)} style={S.eyeBtn} tabIndex={-1}>
                {showPw
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textLight} strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textLight} strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={S.errorBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{ ...S.submitBtn, opacity: loading ? 0.8 : 1 }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <span style={S.spinner} /> {isSignUp ? 'Creating...' : 'Authenticating…'}
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                {isSignUp ? 'Sign Up' : 'Sign In'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </span>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: F.sm }}>
          {isSignUp ? 'Already have an account? ' : 'Need an account? '}
          <button 
            type="button" 
            onClick={() => setIsSignUp(!isSignUp)} 
            style={{ background: 'none', border: 'none', color: C.green, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >
            {isSignUp ? 'Sign In' : 'Create one'}
          </button>
        </p>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <span style={{ fontSize: F.xs, color: C.textLight, whiteSpace: 'nowrap' }}>ACCESS LEVELS</span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>

        {/* Role chips */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ROLES.map(r => (
            <div key={r.label} style={{ ...S.chip, borderColor: r.color + '30', background: r.color + '08' }}>
              <span style={{ fontSize: 14 }}>{r.icon}</span>
              <span style={{ fontSize: F.xs, color: r.color, fontWeight: 700 }}>{r.label}</span>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: F.xs, color: C.textFaint, marginTop: 28 }}>
          Secured by IUIU IT Infrastructure · 2024
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ width: 44, height: 44, border: `3px solid ${C.greenLight}`,
                    borderTopColor: C.green, borderRadius: '50%',
                    animation: 'spin 0.75s linear infinite' }} />
      <p style={{ color: C.green, marginTop: 16, fontWeight: 600, fontSize: F.base }}>Loading…</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE ROUTER
// ─────────────────────────────────────────────────────────────────────────────

function RoleRouter() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated) {
    return (
      <div style={S.loginRoot}>
        <LeftPanel />
        <LoginForm />
      </div>
    );
  }

  switch (user!.role) {
    case 'admin':            return <AdminDashboard onLogout={logout} />;
    case 'attendant':        return <ParkingAttendantDashboard onLogout={logout} />;
    case 'entrance_attendant': return <EntranceAttendantDashboard onLogout={logout} />;
    case 'exit_attendant':   return <ExitAttendantDashboard onLogout={logout} />;
    case 'entrance_display': return <EntrancePanel />;
    case 'exit_display':     return <ExitDisplay />;
    default:
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', background: C.bg }}>
          <p style={{ color: C.textMid, marginBottom: 16 }}>Unrecognised role: {user!.role}</p>
          <button onClick={logout} style={S.submitBtn}>Sign Out</button>
        </div>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <AuthProvider>
        <RoleRouter />
      </AuthProvider>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  /* Login root — horizontal split */
  loginRoot: {
    minHeight: '100vh',
    display: 'flex',
    fontFamily: "'Inter', system-ui, sans-serif",
  },

  /* ── Left panel ── */
  left: {
    width: '42%',
    minWidth: 340,
    background: `linear-gradient(160deg, ${C.navyDark} 0%, ${C.navyLight} 60%, #1a3a2a 100%)`,
    padding: '48px 40px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  deco1: {
    position: 'absolute', top: -80, right: -80, width: 320, height: 320,
    borderRadius: '50%', background: 'rgba(16,185,129,0.08)', filter: 'blur(40px)',
  },
  deco2: {
    position: 'absolute', bottom: 60, left: -100, width: 400, height: 400,
    borderRadius: '50%', background: 'rgba(59,130,246,0.06)', filter: 'blur(60px)',
  },
  deco3: {
    position: 'absolute', top: '40%', left: '30%', width: 200, height: 200,
    borderRadius: '50%', background: 'rgba(16,185,129,0.05)', filter: 'blur(30px)',
  },
  logo: {
    width: 60, height: 60, borderRadius: R.lg,
    background: `linear-gradient(135deg, ${C.green}, ${C.greenDark})`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: SH.green, marginBottom: 20,
  },
  leftTitle: {
    fontSize: 32, fontWeight: 900, color: '#fff',
    letterSpacing: -0.8, lineHeight: 1.2, marginBottom: 8,
  },
  leftSub: {
    fontSize: F.sm, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.2,
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 32,
  },
  statCard: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: R.md, padding: '14px 16px',
    backdropFilter: 'blur(10px)',
  },
  roleRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: R.md,
    border: '1px solid rgba(255,255,255,0.06)',
  },

  /* ── Right panel ── */
  right: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: C.bg, padding: '40px 24px',
  },
  formWrap: {
    width: '100%', maxWidth: 420,
    animation: 'fadeUp 0.4s ease',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: F.xs, fontWeight: 700, color: C.textMid,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  inputWrap: { position: 'relative' },
  fieldIcon: {
    position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
    width: 18, height: 18, color: C.textLight, pointerEvents: 'none',
  } as React.CSSProperties,
  input: {
    width: '100%', padding: '12px 14px 12px 42px',
    border: `1.5px solid ${C.border}`, borderRadius: R.md,
    fontSize: F.base, background: C.surface, color: C.text,
    transition: 'all 0.15s',
  },
  eyeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
    display: 'flex', alignItems: 'center',
  },
  errorBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: C.redFaint, border: `1px solid ${C.redLight}`,
    borderRadius: R.md, padding: '10px 14px',
    fontSize: F.sm, color: C.red,
  },
  submitBtn: {
    width: '100%', padding: '14px',
    background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenDark} 100%)`,
    color: '#fff', border: 'none', borderRadius: R.md,
    fontSize: F.md, fontWeight: 700, cursor: 'pointer',
    boxShadow: SH.green, transition: 'all 0.15s',
  },
  spinner: {
    display: 'inline-block', width: 16, height: 16,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff', borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  chip: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '8px 12px', borderRadius: R.md, border: '1px solid',
  },
};
