import React, { useState, useEffect } from 'react';
import { signInWithGoogle } from '../services/firebase';

interface LoginScreenProps {
  onLogin: (userInfo?: { name: string; email: string; provider: string; uid?: string }) => void;
}

const BUILD_VERSION = '3.4.0';
const ADMIN_EMAIL   = 'designssir@gmail.com';
const ADMIN_CONTACT = 'designsir@naver.com';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // 비관리자 구글 계정 → 승인 요청 폼
  const [pendingUser, setPendingUser] = useState<{ name: string; email: string; uid: string } | null>(null);
  const [approvalName, setApprovalName]       = useState('');
  const [approvalCompany, setApprovalCompany] = useState('');
  const [approvalPhone, setApprovalPhone]     = useState('');
  const [approvalSent, setApprovalSent]       = useState(false);

  // 초대코드 폼
  const [showInvite, setShowInvite] = useState(false);
  const [guestName, setGuestName]   = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteError, setInviteError] = useState('');
  const INVITE_CODE = '0953';

  /* ── Google 로그인 ─────────────────────────────── */
  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const userInfo = await signInWithGoogle();
      if (userInfo.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        // 관리자 → 바로 진입
        onLogin({ name: userInfo.name, email: userInfo.email, provider: 'google', uid: userInfo.uid });
      } else {
        // 비관리자 → 승인 요청 폼
        setPendingUser({ name: userInfo.name, email: userInfo.email, uid: userInfo.uid });
        setApprovalName(userInfo.name);
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('로그인 창이 닫혔습니다. 다시 시도해 주세요.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError(`이 도메인은 구글 로그인이 허용되지 않았습니다.\nFirebase Console → Authorized domains에 ${window.location.hostname} 추가 필요.`);
      } else if (err?.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해 주세요.');
      } else {
        setError('구글 로그인 실패: ' + (err?.message || '다시 시도해 주세요.'));
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── 초대코드 로그인 ─────────────────────────────── */
  const handleInvite = () => {
    if (!guestName.trim()) { setInviteError('이름을 입력해 주세요.'); return; }
    if (inviteCode.trim() !== INVITE_CODE) { setInviteError('초대코드가 올바르지 않습니다.'); return; }
    const uid = `guest_${guestName.trim().replace(/\s+/g, '_').toLowerCase()}`;
    onLogin({ name: guestName.trim(), email: `${uid}@scm.local`, provider: 'local', uid });
  };

  /* ── 승인 요청 ─────────────────────────────────── */
  const handleSendApproval = () => {
    const subject = encodeURIComponent('[SCM] 사용 승인 요청');
    const body = encodeURIComponent(
      `[SCM 사용 승인 요청]\n\n실명: ${approvalName}\n회사명: ${approvalCompany}\n전화번호: ${approvalPhone}\n이메일: ${pendingUser?.email}\nUID: ${pendingUser?.uid}\n\n---\nSCM v${BUILD_VERSION}`
    );
    window.open(`mailto:${ADMIN_CONTACT}?subject=${subject}&body=${body}`, '_blank');
    setApprovalSent(true);
  };

  /* ── 관리자 문의 ─────────────────────────────────── */
  const handleContact = () => {
    window.open(`mailto:${ADMIN_CONTACT}?subject=${encodeURIComponent('[SCM] 문의')}`, '_blank');
  };

  /* ── 비관리자 승인 요청 화면 ─────────────────────── */
  if (pendingUser) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-slate-900 overflow-hidden">
      <div className="h-full w-full max-w-[430px] flex flex-col bg-slate-900 overflow-hidden mx-auto border-x border-slate-800/50">
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div className="text-center">
            <div className="text-3xl mb-2">🔐</div>
            <h2 className="text-base font-black text-white">사용 승인 요청</h2>
            <p className="text-xs text-slate-400 mt-1">
              <span className="text-blue-400 font-bold">{pendingUser.email}</span> 계정은<br />
              관리자 승인 후 이용 가능합니다.
            </p>
          </div>

          {approvalSent ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-4xl">✅</div>
              <p className="text-xs text-emerald-400 text-center font-bold">
                승인 요청이 전송되었습니다.<br />관리자 확인 후 안내드리겠습니다.
              </p>
              <button
                onClick={() => { setPendingUser(null); setApprovalSent(false); }}
                className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded-xl px-5 py-2 transition-colors"
              >돌아가기</button>
            </div>
          ) : (
            <div className="w-full max-w-xs flex flex-col gap-3">
              <input type="text" placeholder="실명 *" value={approvalName}
                onChange={e => setApprovalName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500" />
              <input type="text" placeholder="회사명 *" value={approvalCompany}
                onChange={e => setApprovalCompany(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500" />
              <input type="tel" placeholder="전화번호 *" value={approvalPhone}
                onChange={e => setApprovalPhone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500" />
              <div className="text-[11px] text-slate-500 bg-slate-800/50 rounded-xl px-4 py-2">
                📧 {pendingUser.email}
              </div>
              <button
                onClick={handleSendApproval}
                disabled={!approvalName.trim() || !approvalCompany.trim() || !approvalPhone.trim()}
                className="w-full py-3.5 rounded-xl text-white text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >📨 관리자에게 사용승인 요청</button>
              <button onClick={() => setPendingUser(null)}
                className="text-xs text-slate-500 hover:text-slate-300 text-center transition-colors">
                취소 (다른 계정으로 로그인)
              </button>
            </div>
          )}
        </div>
        <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
      </div>
      </div>
    );
  }

  /* ── 메인 로그인 화면 ─────────────────────────────── */
  return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-[#0f1829] overflow-hidden">
    <div className="h-full w-full max-w-[430px] flex flex-col bg-[#0f1829] overflow-hidden mx-auto border-x border-slate-800/50" style={{ animation: 'fadeInUp 0.3s ease' }}>

      {/* 상단: 로고 */}
      <div className="shrink-0 flex items-center justify-center gap-3 px-6 pt-8 pb-5">
        <div className="flex-1 flex items-center justify-center py-3 px-3 rounded-2xl bg-white/5 border border-white/8">
          <img src="/logo.jpg" alt="SEASTAR" className="h-12 object-contain" />
        </div>
        <div className="flex-1 flex items-center justify-center py-3 px-3 rounded-2xl bg-white/5 border border-white/8">
          <img src="/scms_logo.png" alt="SCM" className="h-12 object-contain" />
        </div>
      </div>

      {/* 로그인 버튼 영역 */}
      <div className="shrink-0 px-6 flex flex-col gap-3">

        {/* 에러 */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs whitespace-pre-line">
            ⚠ {error}
          </div>
        )}

        {/* Google 로그인 */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold py-4 px-4 rounded-2xl transition-all disabled:opacity-50 text-sm shadow-lg"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          Sign in with Google
        </button>

        {/* OR */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-700/60" />
          <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold">or</span>
          <div className="flex-1 h-px bg-slate-700/60" />
        </div>

        {/* 초대코드 입장 */}
        {!showInvite ? (
          <button
            onClick={() => setShowInvite(true)}
            className="w-full py-3.5 rounded-2xl text-slate-300 hover:text-white text-sm font-semibold border border-slate-700/60 hover:border-slate-500 bg-slate-800/40 hover:bg-slate-700/40 transition-all"
          >🔑 초대코드로 입장</button>
        ) : (
          <div className="flex flex-col gap-2.5 bg-slate-800/50 rounded-2xl p-4 border border-slate-700/40">
            {inviteError && <p className="text-[11px] text-red-400">⚠ {inviteError}</p>}
            <input type="text" placeholder="이름" value={guestName}
              onChange={e => { setGuestName(e.target.value); setInviteError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              className="w-full bg-slate-900/60 border border-slate-700 text-white text-sm px-4 py-2.5 rounded-xl focus:outline-none focus:border-blue-500" autoFocus />
            <input type="text" placeholder="초대코드" value={inviteCode}
              onChange={e => { setInviteCode(e.target.value); setInviteError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              className="w-full bg-slate-900/60 border border-slate-700 text-white text-sm px-4 py-2.5 rounded-xl focus:outline-none focus:border-blue-500 tracking-widest" />
            <div className="flex gap-2">
              <button onClick={() => { setShowInvite(false); setGuestName(''); setInviteCode(''); setInviteError(''); }}
                className="flex-1 py-2.5 text-xs text-slate-400 border border-slate-700 rounded-xl hover:bg-slate-700/30 transition-colors">취소</button>
              <button onClick={handleInvite}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">입장</button>
            </div>
          </div>
        )}

        {/* 관리자 문의 */}
        <button onClick={handleContact}
          className="w-full py-3 text-[12px] text-slate-500 hover:text-blue-400 transition-colors">
          📩 Contact Admin (designsir@naver.com)
        </button>
      </div>

      {/* 하단: 동영상 — 나머지 공간 전부 채움 */}
      <div className="flex-1 relative overflow-hidden mt-2">
        <video autoPlay loop muted playsInline
          className="w-full h-full object-cover opacity-70">
          <source src="/scms.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1829] via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 pointer-events-none">
          <span className="text-[9px] font-black text-white/40 tracking-[0.35em] uppercase">Securing Network Integrity</span>
          <div className="w-8 h-0.5 bg-blue-400/50" />
        </div>
      </div>

      {/* 최하단 footer */}
      <div className="shrink-0 py-3 text-center">
        <p className="text-[9px] text-slate-600 font-mono tracking-wider">SECURE CONNECTION ESTABLISHED</p>
        <p className="text-[9px] text-slate-700">© 2025 SEASTAR Corp. All rights reserved.</p>
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
      `}</style>
    </div>
    </div>
  );
};

export default LoginScreen;
