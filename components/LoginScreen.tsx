import React, { useState } from 'react';

interface LoginScreenProps {
  onLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState<string | null>(null);

  const handleLogin = (provider: string) => {
    setLoading(provider);
    // TODO: 실제 OAuth 연동 시 signIn(provider) 호출
    setTimeout(() => {
      setLoading(null);
      onLogin();
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* 최상단 로고 */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-center">
        <img src="/logo.jpg" alt="SEASTAR" className="h-10 object-contain" />
      </header>

      {/* 로그인 영역 */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-white mb-2">환영합니다</h1>
            <p className="text-sm text-slate-400">서비스 이용을 위해 로그인이 필요합니다</p>
          </div>

          <div className="flex flex-col gap-3">
            {/* Google */}
            <button
              onClick={() => handleLogin('google')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-lg border border-gray-300 transition-all disabled:opacity-60"
            >
              {loading === 'google' ? (
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              )}
              Google로 로그인
            </button>

            {/* Kakao */}
            <button
              onClick={() => handleLogin('kakao')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-60"
              style={{ backgroundColor: '#FEE500', color: '#191919' }}
            >
              {loading === 'kakao' ? (
                <div className="w-5 h-5 border-2 border-yellow-700 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#191919" d="M24 4C12.95 4 4 11.16 4 20c0 5.48 3.44 10.31 8.7 13.15l-2.22 8.15c-.18.66.56 1.18 1.14.8l9.62-6.38c.9.1 1.82.15 2.76.15 11.05 0 20-7.16 20-16S35.05 4 24 4z"/></svg>
              )}
              카카오 로그인
            </button>

            {/* Naver */}
            <button
              onClick={() => handleLogin('naver')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-60"
              style={{ backgroundColor: '#03C75A' }}
            >
              {loading === 'naver' ? (
                <div className="w-5 h-5 border-2 border-green-200 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="white" d="M32.66 25.92L14.67 4H4v40h11.34V22.08L33.33 44H44V4H32.66z"/></svg>
              )}
              네이버 로그인
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 mb-2">또는</p>
            <button
              onClick={() => onLogin()}
              className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              이메일로 계속하기
            </button>
          </div>
        </div>
      </div>

      {/* 하단 scms.mp4 동영상 */}
      <div className="w-full bg-black">
        <video
          src="/scms.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full max-h-[200px] object-cover opacity-60"
        />
      </div>
    </div>
  );
};

export default LoginScreen;
