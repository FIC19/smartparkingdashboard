/**
 * IUIU Smart Parking — Root Application
 * Handles routing, role-based guards, and the login screen.
 */
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminDashboard             from './views/AdminDashboard';
import ParkingAttendantDashboard  from './views/ParkingAttendantDashboard';
import EntranceAttendantDashboard from './views/EntranceAttendantDashboard';
import ExitAttendantDashboard     from './views/ExitAttendantDashboard';
import EntrancePanel              from './views/EntrancePanel';
import ExitDisplay                from './views/ExitDisplay';

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_HINTS = [
  { role: 'admin', label: 'Administrator', icon: '🛡️', color: '#14532d' },
  { role: 'entrance_attendant', label: 'Entrance Attendant', icon: '🚗', color: '#1d4ed8' },
  { role: 'exit_attendant', label: 'Exit Attendant', icon: '🚪', color: '#7c3aed' },
  { role: 'attendant', label: 'Parking Attendant', icon: '🅿️', color: '#b45309' },
];

function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      await login(username.trim(), password);
    } catch {
      setError('Invalid credentials. Please check your username and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.bg}>
      {/* Animated background blobs */}
      <div style={S.blob1} />
      <div style={S.blob2} />

      <div style={S.card}>
        {/* Logo */}
        <div style={S.logoWrap}>
          <div style={S.logoCircle}>
            <span style={{ fontSize: 36, lineHeight: 1 }}>🅿</span>
          </div>
          <div>
            <h1 style={S.title}>IUIU Smart Parking</h1>
            <p style={S.subtitle}>Kampala Campus · Access Control System</p>
          </div>
        </div>

        {/* Divider */}
        <div style={S.divider} />

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={S.fieldGroup}>
            <label style={S.label}>Username</label>
            <div style={S.inputWrap}>
              <span style={S.inputIcon}>👤</span>
              <input
                style={S.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoFocus
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div style={S.fieldGroup}>
            <label style={S.label}>Password</label>
            <div style={S.inputWrap}>
              <span style={S.inputIcon}>🔒</span>
              <input
                style={{ ...S.input, paddingRight: 44 }}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                style={S.eyeBtn}
                tabIndex={-1}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div style={S.errorBox}>
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            style={{ ...S.submitBtn, opacity: loading ? 0.75 : 1 }}
            disabled={loading}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <span style={S.spinner} /> Signing in…
              </span>
            ) : 'Sign In →'}
          </button>
        </form>

        {/* Role info */}
        <div style={{ marginTop: 28 }}>
          <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 12 }}>
            SYSTEM ROLES
          </p>
          <div style={S.rolesGrid}>
            {ROLE_HINTS.map(r => (
              <div key={r.role} style={{ ...S.roleChip, borderColor: r.color + '40', background: r.color + '0a' }}>
                <span style={{ fontSize: 14 }}>{r.icon}</span>
                <span style={{ fontSize: 10, color: r.color, fontWeight: 600 }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={S.footer}>
          Islamic University in Uganda · Parking Management System v2.0
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE ROUTER
// ─────────────────────────────────────────────────────────────────────────────

function RoleRouter() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Inter', system-ui, sans-serif", background: '#f0fdf4' }}>
        <div style={{ width: 48, height: 48, border: '4px solid #d1fae5',
                      borderTopColor: '#16a34a', borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#16a34a', marginTop: 16, fontWeight: 600 }}>Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginScreen />;

  switch (user!.role) {
    case 'admin':
      return <AdminDashboard onLogout={logout} />;
    case 'attendant':
      return <ParkingAttendantDashboard onLogout={logout} />;
    case 'entrance_attendant':
      return <EntranceAttendantDashboard onLogout={logout} />;
    case 'exit_attendant':
      return <ExitAttendantDashboard onLogout={logout} />;
    case 'entrance_display':
      return <EntrancePanel />;
    case 'exit_display':
      return <ExitDisplay />;
    default:
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Inter', system-ui, sans-serif" }}>
          <p style={{ color: '#6b7280', marginBottom: 16 }}>Unrecognised role. Contact administrator.</p>
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blob { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-50px) scale(1.1)} 66%{transform:translate(-20px,20px) scale(0.9)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        input:focus { outline: none; border-color: #16a34a !important; box-shadow: 0 0 0 3px #dcfce7 !important; }
        button:hover:not(:disabled) { filter: brightness(1.06); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
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
  bg: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #052e16 0%, #14532d 40%, #166534 70%, #15803d 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    fontFamily: "'Inter', system-ui, sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },
  blob1: {
    position: 'absolute',
    top: '-10%',
    right: '-5%',
    width: 400,
    height: 400,
    borderRadius: '50%',
    background: 'rgba(22,163,74,0.15)',
    animation: 'blob 8s ease-in-out infinite',
    filter: 'blur(40px)',
  },
  blob2: {
    position: 'absolute',
    bottom: '-10%',
    left: '-5%',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'rgba(20,83,45,0.2)',
    animation: 'blob 10s ease-in-out infinite reverse',
    filter: 'blur(40px)',
  },
  card: {
    background: 'rgba(255,255,255,0.98)',
    backdropFilter: 'blur(20px)',
    borderRadius: 24,
    padding: '44px 40px',
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)',
    animation: 'fadeIn 0.4s ease',
    position: 'relative',
    zIndex: 1,
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'linear-gradient(135deg, #16a34a, #052e16)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 8px 24px rgba(22,163,74,0.4)',
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: '#14532d',
    letterSpacing: -0.3,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  divider: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, #d1fae5, transparent)',
    marginBottom: 28,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    fontSize: 16,
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 14px 12px 40px',
    border: '1.5px solid #e5e7eb',
    borderRadius: 10,
    fontSize: 15,
    color: '#111827',
    transition: 'all 0.2s',
    background: '#fafafa',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: 4,
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  submitBtn: {
    padding: '14px',
    background: 'linear-gradient(135deg, #16a34a, #052e16)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 0.3,
    transition: 'all 0.2s',
    boxShadow: '0 4px 16px rgba(22,163,74,0.4)',
  },
  spinner: {
    display: 'inline-block',
    width: 16,
    height: 16,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  rolesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  roleChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid',
  },
  footer: {
    textAlign: 'center',
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 24,
  },
};
