import React, { useState, useEffect, useRef } from 'react';
import { signInWithGoogle } from '../services/firebase';

interface LoginScreenProps {
  onLogin: (userInfo?: { name: string; email: string; provider: string; uid?: string }) => void;
}

// ── OAuth 환경변수 (Cloudflare Pages 환경변수에서 설정) ──────────────
const KAKAO_APP_KEY   = (import.meta as any).env?.VITE_KAKAO_APP_KEY   || '';
// Naver Client ID는 공개값 (OAuth redirect URL에 노출됨) — 직접 하드코딩
const NAVER_CLIENT_ID = (import.meta as any).env?.VITE_NAVER_CLIENT_ID  || 'Sc7hFrtTJvFG2vfxWzM';
const NAVER_CALLBACK  = (import.meta as any).env?.VITE_NAVER_CALLBACK   || (typeof window !== 'undefined' ? window.location.origin : '');
const BUILD_VERSION   = '3.1.0';

/* ─── Naver OAuth redirect handler (페이지 로드 시 hash/query 파싱) ─── */
function parseNaverCallback(): { name: string; email: string } | null {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace('#', '?'));
  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  // access_token을 sessionStorage에 임시 저장
  sessionStorage.setItem('naver_access_token', accessToken);
  // URL 클린업
  history.replaceState(null, '', window.location.pathname);
  return { name: '', email: '' }; // 실제 이름은 API 호출 후 채움
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const naverBtnRef = useRef<HTMLDivElement>(null);

  /* ── 모바일 감지 ── */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Google은 Firebase SDK로 처리하므로 별도 GSI 스크립트 불필요

  /* ── Kakao SDK 로드 ── */
  useEffect(() => {
    if (!KAKAO_APP_KEY) return;
    if (document.getElementById('kakao-sdk')) return;
    const s = document.createElement('script');
    s.id = 'kakao-sdk';
    s.src = 'https://developers.kakao.com/sdk/js/kakao.min.js';
    s.onload = () => {
      const K = (window as any).Kakao;
      if (K && !K.isInitialized()) K.init(KAKAO_APP_KEY);
    };
    document.head.appendChild(s);
  }, []);

  /* ── Naver Login SDK 로드 + 버튼 렌더 ── */
  useEffect(() => {
    if (!NAVER_CLIENT_ID) return;
    if (document.getElementById('naver-sdk')) return;
    const s = document.createElement('script');
    s.id = 'naver-sdk';
    s.src = 'https://static.nid.naver.com/js/naverLogin_implicit-1.0.3.js';
    s.onload = () => {
      const naver = (window as any).naver_id_login;
      if (!naver) return;
      naver.set_client_id(NAVER_CLIENT_ID);
      naver.set_redirect_uri(NAVER_CALLBACK);
      naver.set_state(Math.random().toString(36).substring(7));
    };
    document.head.appendChild(s);
  }, []);

  /* ── Naver 콜백 토큰 처리 ── */
  useEffect(() => {
    const result = parseNaverCallback();
    if (!result) return;
    const token = sessionStorage.getItem('naver_access_token');
    if (!token) return;
    setLoading('naver');
    fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        sessionStorage.removeItem('naver_access_token');
        onLogin({
          name: data.response?.name || '네이버 사용자',
          email: data.response?.email || '',
          provider: 'naver',
        });
      })
      .catch(() => {
        sessionStorage.removeItem('naver_access_token');
        // CORS 제한으로 클라이언트에서 직접 호출 불가 → 이름 없이 로그인
        onLogin({ name: '네이버 사용자', email: '', provider: 'naver' });
      })
      .finally(() => setLoading(null));
  }, []);

  /* ════════════════════════════════════
     LOGIN HANDLERS
  ════════════════════════════════════ */
  const handleGoogle = async () => {
    setLoading('google');
    setError(null);
    try {
      const userInfo = await signInWithGoogle();
      onLogin({ name: userInfo.name, email: userInfo.email, provider: 'google', uid: userInfo.uid });
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('로그인 창이 닫혔습니다. 다시 시도해 주세요.');
      } else {
        setError('구글 로그인에 실패했습니다: ' + (err?.message || ''));
      }
    } finally {
      setLoading(null);
    }
  };

  const handleKakao = () => {
    if (!KAKAO_APP_KEY) {
      onLogin({ name: 'Demo User', email: 'demo@seastar.com', provider: 'kakao' });
      return;
    }
    setLoading('kakao');
    setError(null);
    const K = (window as any).Kakao;
    if (!K?.isInitialized()) {
      setError('카카오 SDK 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
      setLoading(null);
      return;
    }
    K.Auth.login({
      success: () => {
        K.API.request({
          url: '/v2/user/me',
          success: (res: any) => {
            onLogin({
              name: res.kakao_account?.profile?.nickname || '카카오 사용자',
              email: res.kakao_account?.email || '',
              provider: 'kakao',
            });
            setLoading(null);
          },
          fail: () => {
            setError('카카오 사용자 정보 조회 실패');
            setLoading(null);
          },
        });
      },
      fail: () => {
        setError('카카오 로그인을 취소했습니다.');
        setLoading(null);
      },
    });
  };

  const handleNaver = () => {
    if (!NAVER_CLIENT_ID) {
      onLogin({ name: 'Demo User', email: 'demo@seastar.com', provider: 'naver' });
      return;
    }
    const naver = (window as any).naver_id_login;
    if (!naver) {
      setError('네이버 SDK 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    naver.set_state(Math.random().toString(36).substring(7));
    naver.go_login(); // Naver OAuth 페이지로 리다이렉트
  };

  // ── 게스트 / 관리자 로그인 ──────────────────────────────
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestId, setGuestId] = useState('');
  const [guestPw, setGuestPw] = useState('');
  const [guestError, setGuestError] = useState('');

  const GUEST_ACCOUNTS: Record<string, { pw: string; name: string; uid: string }> = {
    'guest':  { pw: 'guest',  name: '게스트',    uid: 'guest_user' },
    'admin':  { pw: '2239',   name: '관리자',    uid: 'admin_user' },
  };

  const handleGuestLogin = () => {
    const acc = GUEST_ACCOUNTS[guestId.toLowerCase()];
    if (!acc) {
      setGuestError('존재하지 않는 계정입니다.');
      return;
    }
    if (acc.pw !== guestPw) {
      setGuestError('비밀번호가 틀렸습니다.');
      return;
    }
    setGuestError('');
    onLogin({ name: acc.name, email: `${guestId}@scms.local`, provider: 'local', uid: acc.uid });
  };

  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center bg-slate-900 overflow-hidden relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950/20 pointer-events-none" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(0,180,216,.5) 39px,rgba(0,180,216,.5) 40px),
                            repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(0,180,216,.5) 39px,rgba(0,180,216,.5) 40px)`,
        }}
      />

      {/* ── LOGIN CARD ── */}
      <div className="w-full max-w-[420px] mx-4 bg-[#1e293b]/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/5 relative z-20 flex flex-col overflow-hidden"
        style={{ animation: 'fadeInUp 0.35s ease' }}>

        {/* ── HEADER: LOGO ── */}
        <div className="w-full py-6 text-center relative bg-slate-900/60 flex flex-col items-center gap-2">
          <div className="w-full px-6 flex items-center justify-center gap-4">
            <img
              src="/logo.jpg"
              alt="SEASTAR"
              className="h-16 object-contain drop-shadow-lg"
            />
            <div className="w-px h-10 bg-slate-600/60" />
            <img
              src="/scms_logo.png"
              alt="SCMS"
              className="h-16 object-contain drop-shadow-lg"
            />
          </div>
          <div className="text-[9px] text-slate-600 font-mono">v{BUILD_VERSION}</div>
        </div>

        {/* ── BODY ── */}
        <div className="px-10 pt-6 pb-0 flex flex-col gap-3">
          {/* Divider */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-600/60 to-transparent mb-1" />

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              ⚠ {error}
            </div>
          )}

          {/* ── GOOGLE ── */}
          <button
            onClick={handleGoogle}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold py-3.5 px-4 rounded-xl border border-slate-200 transition-all disabled:opacity-50 shadow-sm text-sm"
          >
            {loading === 'google' ? (
              <span className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            )}
            Google로 로그인
          </button>

          {/* ── KAKAO ── */}
          <button
            onClick={handleKakao}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 font-bold py-3.5 px-4 rounded-xl transition-all disabled:opacity-50 text-sm"
            style={{ backgroundColor: '#FEE500', color: '#191919' }}
          >
            {loading === 'kakao' ? (
              <span className="w-5 h-5 border-2 border-yellow-700 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#191919" d="M24 4C12.95 4 4 11.16 4 20c0 5.48 3.44 10.31 8.7 13.15l-2.22 8.15c-.18.66.56 1.18 1.14.8l9.62-6.38c.9.1 1.82.15 2.76.15 11.05 0 20-7.16 20-16S35.05 4 24 4z"/>
              </svg>
            )}
            카카오 로그인
          </button>

          {/* ── NAVER ── */}
          <button
            onClick={handleNaver}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 text-white font-bold py-3.5 px-4 rounded-xl transition-all disabled:opacity-50 text-sm"
            style={{ backgroundColor: '#03C75A' }}
          >
            {loading === 'naver' ? (
              <span className="w-5 h-5 border-2 border-green-200 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="white" d="M32.66 25.92L14.67 4H4v40h11.34V22.08L33.33 44H44V4H32.66z"/>
              </svg>
            )}
            네이버 로그인
          </button>

          {/* OR divider */}
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-slate-700/60" />
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">or</span>
            <div className="flex-1 h-px bg-slate-700/60" />
          </div>

          {/* ── 게스트 / 관리자 로그인 ── */}
          {!showGuestForm ? (
            <button
              onClick={() => setShowGuestForm(true)}
              disabled={loading !== null}
              className="w-full py-3 rounded-xl text-slate-400 hover:text-white text-xs font-semibold border border-slate-700/50 hover:border-slate-500 bg-transparent hover:bg-slate-700/30 transition-all disabled:opacity-50"
            >
              🔑 게스트 / 관리자 로그인
            </button>
          ) : (
            <div className="rounded-xl border border-slate-600/50 bg-slate-800/50 p-4 flex flex-col gap-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">ID / Password 입력</p>
              {guestError && (
                <p className="text-[10px] text-red-400 font-medium">⚠ {guestError}</p>
              )}
              <input
                type="text"
                placeholder="ID  (guest / admin)"
                value={guestId}
                onChange={e => { setGuestId(e.target.value); setGuestError(''); }}
                className="w-full bg-slate-900/60 border border-slate-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
                onKeyDown={e => e.key === 'Enter' && handleGuestLogin()}
                autoFocus
              />
              <input
                type="password"
                placeholder="Password"
                value={guestPw}
                onChange={e => { setGuestPw(e.target.value); setGuestError(''); }}
                className="w-full bg-slate-900/60 border border-slate-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
                onKeyDown={e => e.key === 'Enter' && handleGuestLogin()}
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => { setShowGuestForm(false); setGuestId(''); setGuestPw(''); setGuestError(''); }}
                  className="flex-1 py-2 text-xs text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/30 transition-colors"
                >취소</button>
                <button
                  onClick={handleGuestLogin}
                  className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >입장</button>
              </div>
              <p className="text-[9px] text-slate-600 text-center mt-0.5">
                guest / guest &nbsp;·&nbsp; admin / ****
              </p>
            </div>
          )}
          <div className="mb-2" />

          {/* ── VIDEO (카드 하단 embedded) ── */}
          <div className="-mx-10 h-[120px] relative overflow-hidden group flex-shrink-0">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover opacity-60 transition-opacity duration-700 group-hover:opacity-80"
            >
              <source src="/scms.mp4" type="video/mp4" />
            </video>
            {/* 그라디언트 오버레이 */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#1e293b] via-transparent to-transparent" />
            <div className="absolute inset-x-0 bottom-3 flex flex-col items-center opacity-40 pointer-events-none">
              <span className="text-[8px] font-black text-white tracking-[0.4em] uppercase">
                Securing Network Integrity
              </span>
              <div className="w-8 h-0.5 bg-blue-400 mt-1" />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-5 w-full text-center z-20 space-y-1 pointer-events-none">
        <p className="text-[10px] text-slate-500 font-mono tracking-wider">SECURE CONNECTION ESTABLISHED</p>
        <p className="text-[10px] text-slate-600">© 2025 SEASTAR Corp. All rights reserved.</p>
        {!NAVER_CLIENT_ID && !KAKAO_APP_KEY && (
          <p className="text-[9px] text-amber-600/70 mt-1">
            ⚙ OAuth 미설정 — Cloudflare Pages 환경변수에 VITE_NAVER_CLIENT_ID 등을 설정하세요
          </p>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
      `}</style>
    </div>
  );
};

export default LoginScreen;
