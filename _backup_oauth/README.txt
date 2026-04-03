============================================================
 네이버 / 카카오 OAuth 백업 (2026-04-02)
============================================================

향후 네이버/카카오 로그인 재개발 시 아래 파일과 코드 조각을 복원하세요.

1. naver-user.ts
   - 원래 경로: functions/api/naver-user.ts
   - 역할: Naver OpenAPI CORS 프록시 (서버사이드)
   - 복원: functions/api/ 폴더에 다시 배치

2. App.tsx handleLogout 에서 제거된 코드:

   // Kakao 세션 정리
   try {
     const K = (window as any).Kakao;
     if (K?.Auth?.getAccessToken()) K.Auth.logout(() => {});
   } catch { /* Kakao 미로드 시 무시 */ }
   // Naver 토큰 정리
   try { sessionStorage.removeItem('naver_access_token'); } catch {}

3. types.ts UserInfo.provider:
   - 현재: 'google' | 'local' | 'demo'
   - 복원 시: 'google' | 'kakao' | 'naver' | 'local' | 'demo'

4. 네이버 로그인 구현 시 필요한 것:
   - Naver Developer Console에서 앱 등록
   - Callback URL: https://scm.seastar.work/
   - Client ID + Client Secret
   - Implicit Grant Flow 또는 Authorization Code Flow

5. 카카오 로그인 구현 시 필요한 것:
   - Kakao Developers에서 앱 등록
   - JavaScript 키 → VITE_KAKAO_APP_KEY 환경변수
   - Kakao SDK 로드 (<script src="https://t1.kakaocdn.net/kakao_js_sdk/...">)
   - 허용 도메인: scm.seastar.work

============================================================
