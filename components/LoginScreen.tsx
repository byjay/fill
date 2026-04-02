import React, { useState, useEffect, useRef } from 'react';
import { signInWithGoogle } from '../services/firebase';

interface LoginScreenProps {
  onLogin: (userInfo?: { name: string; email: string; provider: string; uid?: string }) => void;
}

// ── OAuth 환경변수 (Cloudflare Pages 환경변수에서 설정) ──────────────
const KAKAO_APP_KEY   = (import.meta as any).env?.VITE_KAKAO_APP_KEY   || '';
// Naver Client ID는 공개값 (OAuth redirect URL에 노출됨) — 직접 하드코딩
const NAVER_CLIENT_ID = (import.meta as any).env?.VITE_NAVER_CLIENT_ID  || 'Sc7hFrtTJvFG2vfxWzM';
// Callback URL: 배포 도메인 고정 (window.location.origin 사용 시 Naver 앱 등록 URI와 일치 불가 문제 해결)
const NAVER_CALLBACK  = (import.meta as any).env?.VITE_NAVER_CALLBACK
  || (typeof window !== 'undefined' ? window.location.origin : '');
const BUILD_VERSION   = '3.3.0';
const ADMIN_EMAIL     = 'designssir@gmail.com';
const ADMIN_CONTACT   = 'designsir@naver.com';

/* ─── Naver OAuth redirect handler (페이지 로드 시 hash/query 파싱) ─── */
function parseNaverCallback(): { name: string; email: string; error?: string } | null {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;
  const params = new URLSearchParams(hash.replace('#', '?'));

  // Naver OAuth 에러 응답 감지
  const error = params.get('error');
  if (error) {
    const desc = params.get('error_description') || '네이버 인증이 거부되었습니다.';
    history.replaceState(null, '', window.location.pathname);
    return { name: '', email: '', error: decodeURIComponent(desc) };
  }

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

  // 구글 비관리자 승인 요청 상태
  const [pendingGoogleUser, setPendingGoogleUser] = useState<{ name: string; email: string; uid: string } | null>(null);
  const [approvalName, setApprovalName] = useState('');
  const [approvalCompany, setApprovalCompany] = useState('');
  const [approvalPhone, setApprovalPhone] = useState('');
  const [approvalSent, setApprovalSent] = useState(false);

  /* ── 모바일 감지 ── */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  /* ── Naver Login SDK 로드 (폴백: 수동 리다이렉트) ── */
  useEffect(() => {
    if (!NAVER_CLIENT_ID) return;

    const initNaver = () => {
      try {
        const NaverLogin = (window as any).naver_id_login;
        if (!NaverLogin) return;
        const callbackUrl = NAVER_CALLBACK || window.location.origin;
        if (typeof NaverLogin === 'function') {
          try {
            const instance = new NaverLogin(NAVER_CLIENT_ID, callbackUrl);
            (window as any)._naverLoginInstance = instance;
          } catch {
            NaverLogin.set_client_id(NAVER_CLIENT_ID);
            NaverLogin.set_redirect_uri(callbackUrl);
            NaverLogin.set_state(Math.random().toString(36).substring(7));
            (window as any)._naverLoginInstance = NaverLogin;
          }
        }
      } catch (e) {
        console.error('[Naver SDK] init failed:', e);
      }
    };

    if (document.getElementById('naver-sdk')) {
      initNaver();
      return;
    }
    const s = document.createElement('script');
    s.id = 'naver-sdk';
    s.src = 'https://static.nid.naver.com/js/naverLogin_implicit-1.0.3.js';
    s.onload = initNaver;
    s.onerror = () => console.warn('[Naver SDK] 스크립트 로드 실패 — 수동 리다이렉트 모드 사용');
    document.head.appendChild(s);
  }, []);

  /* ── Naver 콜백 토큰 처리 (CORS 프록시 경유) ── */
  useEffect(() => {
    const result = parseNaverCallback();
    if (!result) return;
    if (result.error) {
      setError(`네이버 로그인 실패: ${result.error}`);
      return;
    }
    const token = sessionStorage.getItem('naver_access_token');
    if (!token) return;
    setLoading('naver');
    fetch('/api/naver-user', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        sessionStorage.removeItem('naver_access_token');
        if (data.response?.name) {
          const naverId = data.response.id || data.response.email || `naver_${Date.now()}`;
          onLogin({
            name: data.response.name,
            email: data.response.email || '',
            provider: 'naver',
            uid: `naver_${naverId}`,
          });
        } else {
          setError(`네이버 사용자 정보를 가져오지 못했습니다. 관리자: ${ADMIN_CONTACT}`);
        }
      })
      .catch(() => {
        sessionStorage.removeItem('naver_access_token');
        setError(`네이버 사용자 정보 조회 실패. 관리자: ${ADMIN_CONTACT}`);
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
      // 관리자 계정만 바로 로그인
      if (userInfo.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        onLogin({ name: userInfo.name, email: userInfo.email, provider: 'google', uid: userInfo.uid });
      } else {
        // 비관리자 → 승인 요청 폼 표시
        setPendingGoogleUser({ name: userInfo.name, email: userInfo.email, uid: userInfo.uid });
        setApprovalName(userInfo.name);
      }
    } catch (err: any) {
      console.error('[Google Auth]', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('로그인 창이 닫혔습니다. 다시 시도해 주세요.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError(`이 도메인은 구글 로그인이 허용되지 않았습니다. 관리자: ${ADMIN_CONTACT}`);
      } else if (err?.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해 주세요.');
      } else if (err?.code === 'auth/network-request-failed') {
        setError('네트워크 연결을 확인해 주세요.');
      } else {
        setError('구글 로그인 실패: ' + (err?.message || `관리자 문의: ${ADMIN_CONTACT}`));
      }
    } finally {
      setLoading(null);
    }
  };

  const handleKakao = () => {
    if (!KAKAO_APP_KEY) {
      setError(`카카오 로그인을 현재 이용할 수 없습니다. 관리자: ${ADMIN_CONTACT}`);
      return;
    }
    setLoading('kakao');
    setError(null);
    const K = (window as any).Kakao;
    if (!K) {
      setError('카카오 SDK를 로드할 수 없습니다. 광고 차단기를 해제하거나 다른 로그인 방법을 이용해 주세요.');
      setLoading(null);
      return;
    }
    if (!K.isInitialized()) {
      try {
        K.init(KAKAO_APP_KEY);
      } catch (e: any) {
        setError('카카오 SDK 초기화 실패: ' + (e?.message || '앱 키를 확인해 주세요.'));
        setLoading(null);
        return;
      }
    }
    K.Auth.login({
      success: () => {
        K.API.request({
          url: '/v2/user/me',
          success: (res: any) => {
            const kakaoId = res.id || res.kakao_account?.email || `kakao_${Date.now()}`;
            onLogin({
              name: res.kakao_account?.profile?.nickname || '카카오 사용자',
              email: res.kakao_account?.email || '',
              provider: 'kakao',
              uid: `kakao_${kakaoId}`,
            });
            setLoading(null);
          },
          fail: (apiErr: any) => {
            console.error('[Kakao API]', apiErr);
            setError(`카카오 사용자 정보 조회 실패. 관리자: ${ADMIN_CONTACT}`);
            setLoading(null);
          },
        });
      },
      fail: (authErr: any) => {
        console.error('[Kakao Auth]', authErr);
        const errDesc = authErr?.error_description || '';
        if (authErr?.error === 'access_denied' || errDesc.includes('cancel')) {
          setError('카카오 로그인을 취소했습니다.');
        } else {
          setError('카카오 로그인에 실패했습니다. 다시 시도해 주세요.');
        }
        setLoading(null);
      },
    });
  };

  const handleNaver = () => {
    if (!NAVER_CLIENT_ID) {
      setError(`네이버 로그인을 현재 이용할 수 없습니다. 관리자: ${ADMIN_CONTACT}`);
      return;
    }
    setError(null);
    const callbackUrl = NAVER_CALLBACK || window.location.origin;
    const state = Math.random().toString(36).substring(7);

    const tryLogin = (attempt = 0) => {
      const instance = (window as any)._naverLoginInstance;
      if (instance && typeof instance.go_login === 'function') {
        try {
          instance.go_login();
          return;
        } catch (e) {
          console.warn('[Naver] SDK go_login 실패, 수동 리다이렉트로 전환:', e);
        }
      }
      if (!instance && attempt < 3) {
        setTimeout(() => tryLogin(attempt + 1), 500);
        return;
      }
      const oauthUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
      window.location.href = oauthUrl;
    };
    tryLogin();
  };

  // 승인 요청 이메일 전송 (mailto)
  const handleSendApproval = () => {
    if (!approvalName.trim() || !approvalCompany.trim() || !approvalPhone.trim()) return;
    const subject = encodeURIComponent('[SCMS] 사용 승인 요청');
    const body = encodeURIComponent(
      `[SCMS 사용 승인 요청]\n\n` +
      `실명: ${approvalName.trim()}\n` +
      `회사명: ${approvalCompany.trim()}\n` +
      `전화번호: ${approvalPhone.trim()}\n` +
      `이메일: ${pendingGoogleUser?.email || ''}\n` +
      `구글 UID: ${pendingGoogleUser?.uid || ''}\n\n` +
      `---\nSCMS v${BUILD_VERSION}`
    );
    window.open(`mailto:${ADMIN_CONTACT}?subject=${subject}&body=${body}`, '_blank');
    setApprovalSent(true);
  };

  // 관리자 문의 이메일
  const handleContactAdmin = () => {
    const subject = encodeURIComponent('[SCMS] 문의');
    window.open(`mailto:${ADMIN_CONTACT}?subject=${subject}`, '_blank');
  };

  // ── 게스트 로그인 폼 (초대코드) ──────────────────────────────────
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [guestError, setGuestError] = useState('');

  const GUEST_INVITE_CODE = '0953';

  const handleGuestLogin = () => {
    if (!guestName.trim()) {
      setGuestError('이름을 입력해 주세요.');
      return;
    }
    if (inviteCode.trim() !== GUEST_INVITE_CODE) {
      setGuestError('초대코드가 올바르지 않습니다.');
      return;
    }
    setGuestError('');
    const uid = `guest_${guestName.trim().replace(/\s+/g, '_').toLowerCase()}`;
    onLogin({ name: guestName.trim(), email: `${uid}@scms.local`, provider: 'local', uid });
  };

  // ── 구글 비관리자 승인 요청 화면 ─────────────────────────────────
  if (pendingGoogleUser) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-slate-900 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950/20 pointer-events-none" />
        <div className="w-full max-w-[360px] mx-4 bg-[#1e293b]/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/5 relative z-20 p-6 flex flex-col gap-4"
          style={{ animation: 'fadeInUp 0.35s ease' }}>
          <div className="text-center">
            <div className="text-2xl mb-1">🔐</div>
            <h2 className="text-sm font-black text-white">사용 승인 요청</h2>
            <p className="text-xs text-slate-400 mt-1">
              <span className="text-blue-400 font-bold">{pendingGoogleUser.email}</span> 계정은<br />
              관리자 승인 후 사용 가능합니다.
            </p>
          </div>

          {approvalSent ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="text-3xl">✅</div>
              <p className="text-xs text-emerald-400 text-center font-bold">
                승인 요청이 전송되었습니다.<br />
                관리자 승인 후 안내드리겠습니다.
              </p>
              <button
                onClick={() => { setPendingGoogleUser(null); setApprovalSent(false); }}
                className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-4 py-2 transition-colors"
              >
                돌아가기
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="실명 *"
                  value={approvalName}
                  onChange={e => setApprovalName(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 text-white text-xs px-3 py-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="회사명 *"
                  value={approvalCompany}
                  onChange={e => setApprovalCompany(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 text-white text-xs px-3 py-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <input
                  type="tel"
                  placeholder="전화번호 *"
                  value={approvalPhone}
                  onChange={e => setApprovalPhone(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 text-white text-xs px-3 py-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <div className="text-[10px] text-slate-500 bg-slate-800/50 rounded-lg px-3 py-2">
                  📧 인증 이메일: <span className="text-blue-400">{pendingGoogleUser.email}</span>
                </div>
              </div>

              <button
                onClick={handleSendApproval}
                disabled={!approvalName.trim() || !approvalCompany.trim() || !approvalPhone.trim()}
                className="w-full py-3 rounded-xl text-white text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                📨 관리자에게 사용승인 요청
              </button>

              <button
                onClick={() => setPendingGoogleUser(null)}
                className="text-xs text-slate-500 hover:text-slate-300 text-center transition-colors"
              >
                취소 (다른 계정으로 로그인)
              </button>
            </>
          )}
        </div>
        <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateY(20px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
      </div>
    );
  }

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
      <div className="w-full max-w-[360px] mx-4 bg-[#1e293b]/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/5 relative z-20 flex flex-col overflow-hidden"
        style={{ animation: 'fadeInUp 0.35s ease' }}>

        {/* ── HEADER: LOGO ── */}
        <div className="w-full py-4 text-center relative bg-slate-900/60 flex flex-col items-center gap-1">
          <div className="w-full px-5 flex items-center justify-center gap-3">
            {/* SEASTAR 로고 */}
            <div className="flex-1 flex items-center justify-center py-2">
              <img src="/logo.jpg" alt="SEASTAR" className="h-12 object-contain drop-shadow-lg" />
            </div>
            {/* SCMS 로고 */}
            <div className="flex-1 flex items-center justify-center py-2">
              <img src="/scms_logo.png" alt="SCMS" className="h-12 object-contain drop-shadow-lg" />
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="px-7 pt-5 pb-0 flex flex-col gap-3">
          {/* Divider */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-600/60 to-transparent" />

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
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold py-3 px-4 rounded-xl border border-slate-200 transition-all disabled:opacity-50 shadow-sm text-sm"
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
            Sign in with Google
          </button>

          {/* OR divider */}
          <div className="flex items-center gap-3 my-0.5">
            <div className="flex-1 h-px bg-slate-700/60" />
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">or</span>
            <div className="flex-1 h-px bg-slate-700/60" />
          </div>

          {/* ── 게스트 / 관리자 로그인 ── */}
          {!showGuestForm ? (
            <button
              onClick={() => setShowGuestForm(true)}
              disabled={loading !== null}
              className="w-full py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-semibold border border-slate-700/50 hover:border-slate-500 bg-transparent hover:bg-slate-700/30 transition-all disabled:opacity-50"
            >
              🔑 초대코드로 입장
            </button>
          ) : (
            <div className="rounded-xl border border-slate-600/50 bg-slate-800/50 p-4 flex flex-col gap-2">
              {guestError && (
                <p className="text-[10px] text-red-400 font-medium">⚠ {guestError}</p>
              )}
              <input
                type="text"
                placeholder="이름"
                value={guestName}
                onChange={e => { setGuestName(e.target.value); setGuestError(''); }}
                className="w-full bg-slate-900/60 border border-slate-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
                onKeyDown={e => e.key === 'Enter' && handleGuestLogin()}
                autoFocus
              />
              <input
                type="text"
                placeholder="초대코드"
                value={inviteCode}
                onChange={e => { setInviteCode(e.target.value); setGuestError(''); }}
                className="w-full bg-slate-900/60 border border-slate-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 tracking-widest"
                onKeyDown={e => e.key === 'Enter' && handleGuestLogin()}
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => { setShowGuestForm(false); setGuestName(''); setInviteCode(''); setGuestError(''); }}
                  className="flex-1 py-2 text-xs text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/30 transition-colors"
                >취소</button>
                <button
                  onClick={handleGuestLogin}
                  className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >입장</button>
              </div>
            </div>
          )}

          {/* 관리자 문의 */}
          <button
            onClick={handleContactAdmin}
            className="w-full py-2 rounded-xl text-slate-500 hover:text-blue-400 text-[11px] font-medium border border-slate-800 hover:border-slate-600 bg-transparent hover:bg-slate-800/30 transition-all"
          >
            📩 Contact Admin (designsir@naver.com)
          </button>

          {/* ── VIDEO (카드 하단 embedded) ── */}
          <div className="-mx-7 h-[160px] relative overflow-hidden group flex-shrink-0">
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
        <p className="text-[10px] text-slate-600">© 2023 SEASTAR Corp. All rights reserved.</p>
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
