# 네이버/구글 소셜 인증 실패 원인 진단 보고서

**진단일**: 2026-01-29
**프로젝트**: SCMS_V1
**버전**: 3.1.0

---

## 📋 Executive Summary

본 프로젝트의 소셜 인증 시스템(네이버, 구글, 카카오)에서 발생하는 인증 실패 문제를 분석한 결과, **네이버 인증의 CORS 제한**, **구글 인증의 Firebase 설정**, **환경변수 누락**이 주요 원인으로 확인되었습니다.

---

## 🔍 인증 구현 아키텍처

### 1. 네이버 인증 (Naver OAuth)

**구현 방식**: Implicit Grant Flow (클라이언트 사이드 전용)
**SDK**: `naverLogin_implicit-1.0.3.js`
**코드 위치**: `components/LoginScreen.tsx`

#### 인증 흐름
```
1. 사용자 → 네이버 로그인 버튼 클릭
2. 네이버 OAuth 페이지로 리다이렉트
3. 콜백 URL에서 access_token 추출 (hash 파싱)
4. 토큰 사용하여 사용자 정보 API 호출
5. 로그인 완료
```

#### 설정값
```typescript
// 하드코딩된 Client ID (취약점)
const NAVER_CLIENT_ID = 'Sc7hFrtTJvFG2vfxWzM';
const NAVER_CALLBACK = window.location.origin; // 동적으로 설정
```

### 2. 구글 인증 (Google OAuth)

**구현 방식**: Firebase SDK (Popup 방식)
**프로젝트**: `seastar-cable-auth-99`
**코드 위치**: `services/firebase.ts`

#### 인증 흐름
```
1. 사용자 → 구글 로그인 버튼 클릭
2. Firebase signInWithPopup 실행
3. 팝업 창에서 구글 인증
4. Firebase가 토큰 처리 및 사용자 정보 반환
5. 로그인 완료
```

#### 설정값
```typescript
const firebaseConfig = {
  apiKey: 'AIzaSyCjajL5P62Vk6Fn-Q_cyRPNdaPsmNJJcg4',
  authDomain: 'seastar-cable-auth-99.firebaseapp.com',
  projectId: 'seastar-cable-auth-99',
  // ...
};
```

### 3. 카카오 인증 (Kakao OAuth)

**구현 방식**: Kakao SDK
**SDK**: `kakao.min.js`
**환경변수**: `VITE_KAKAO_APP_KEY`

---

## ⚠️ 발견된 문제점

### 🔴 심각 (Critical)

#### 1. 네이버 인증 CORS 문제
**위치**: `components/LoginScreen.tsx:82-98`

```typescript
fetch('https://openapi.naver.com/v1/nid/me', {
  headers: { Authorization: `Bearer ${token}` },
})
  .then(r => r.json())
  .then(data => { /* 사용자 정보 처리 */ })
  .catch(() => {
    // CORS 제한으로 클라이언트에서 직접 호출 불가
    onLogin({ name: '네이버 사용자', email: '', provider: 'naver' });
  })
```

**문제점**:
- 브라우저에서 직접 Naver API 호출 시 **CORS 제한** 발생
- catch 블록에서 사용자 정보 없이 로그인 처리 (이메일 누락)
- 콘솔에 CORS 에러 로그가 계속 노출됨

**영향**:
- 사용자 이메일을 가져올 수 없음
- 사용자 경험 저하
- 로그 분석에 어려움

#### 2. 구글 인증 Firebase 설정 미확인
**위치**: `services/firebase.ts:5-12`

**문제점**:
- Firebase Console에서 **Google Provider 활성화 여부 미검증**
- **Authorized Domains** 설정 확인 필요
- API Key의 제한 설정 확인 필요

**영향**:
- 팝업 로그인 실패 가능성
- 다른 도메인에서 인증 제한

#### 3. 네이버 Client ID 하드코딩
**위치**: `components/LoginScreen.tsx:11`

```typescript
const NAVER_CLIENT_ID = (import.meta as any).env?.VITE_NAVER_CLIENT_ID
  || 'Sc7hFrtTJvFG2vfxWzM';
```

**문제점**:
- Client ID가 코드에 하드코딩됨 (보안 취약)
- 운영/개발 환경 분리 불가
- Client ID가 노출되어 있음 (보안상 일반적이지만 환경별 관리 불가)

**영향**:
- 보안 리스크
- 환경별 유연성 부족

### 🟡 중간 (Medium)

#### 4. 네이버 Redirect URI 동적 설정
**위치**: `components/LoginScreen.tsx:12`

```typescript
const NAVER_CALLBACK = (import.meta as any).env?.VITE_NAVER_CALLBACK
  || (typeof window !== 'undefined' ? window.location.origin : '');
```

**문제점**:
- Redirect URI가 `window.location.origin`으로 동적 설정됨
- Naver 앱에 등록된 Redirect URI와 불일치 가능성
- 로컬 개발(`localhost:3000`)과 배포 환경(`yourdomain.com`)에서 URI 상이

**영향**:
- OAuth callback 실패
- 개발 환경에서 인증 오류

#### 5. 환경변수 누락 가능성
**위치**: `components/LoginScreen.tsx:9-12`, `vite.config.ts`

**확인 필요 환경변수**:
```bash
# Cloudflare Pages 환경변수
VITE_NAVER_CLIENT_ID=
VITE_NAVER_CALLBACK=
VITE_KAKAO_APP_KEY=
```

**문제점**:
- 환경변수 미설정 시 하드코딩된 기본값 사용
- 배포 환경에서 환경변수 누락 가능성
- 카카오는 환경변수가 없으면 Demo 모드로 동작

**영향**:
- 의도치 않은 Demo 모드 실행
- OAuth 설정 오작동

### 🟢 낮음 (Low)

#### 6. 에러 로깅 부족
**위치**: `components/LoginScreen.tsx:111-119`

```typescript
catch (err: any) {
  if (err?.code === 'auth/popup-closed-by-user') {
    setError('로그인 창이 닫혔습니다. 다시 시도해 주세요.');
  } else {
    setError('구글 로그인에 실패했습니다: ' + (err?.message || ''));
  }
}
```

**문제점**:
- Firebase 에러 코드 일부만 처리
- 네이버 CORS 에러에 대한 상세 로깅 없음
- 서버 로그가 아닌 화면에만 에러 표시

**영향**:
- 디버깅 어려움
- 에러 원인 파악 지연

#### 7. SDK 로딩 타이밍 문제
**위치**: `components/LoginScreen.tsx:59-73, 45-56`

**문제점**:
- 네이버/카카오 SDK가 useEffect로 로드됨
- 사용자가 로그인 버튼 클릭 전에 SDK 로딩 완료 보장 없음
- `SDK 로딩 중입니다` 에러 가능성

**영향**:
- 사용자 불편
- 로그인 실패 사례 발생

---

## 💡 해결 방안

### 우선순위 1: 네이버 CORS 문제 해결 (Critical)

#### 옵션 A: 백엔드 프록시 구현 (권장)
```typescript
// Cloudflare Functions 또는 API 라우트 추가
// functions/api/naver-user-info.ts
export async function GET(request: Request) {
  const accessToken = new URL(request.url).searchParams.get('token');
  const response = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  return Response.json(data);
}
```

#### 옵션 B: Authorization Code Flow 전환
- 백엔드에서 Authorization Code Flow 구현
- 클라이언트는 인증 코드만 전달
- 백엔드에서 토큰 교환 및 사용자 정보 조회

### 우선순위 2: Firebase 설정 확인 (Critical)

1. **Firebase Console 접속**
2. **Authentication > Sign-in method** 확인
3. **Google** 제공자 활성화 확인
4. **Authorized domains**에 배포 도메인 추가
5. **API Key 제한 설정** 확인

### 우선순위 3: 환경변수 정리 (Medium)

```bash
# .env.local (로컬 개발)
VITE_NAVER_CLIENT_ID=Sc7hFrtTJvFG2vfxWzM
VITE_NAVER_CALLBACK=http://localhost:5173
VITE_KAKAO_APP_KEY=your_kakao_app_key

# Cloudflare Pages Settings (배포)
VITE_NAVER_CLIENT_ID=production_client_id
VITE_NAVER_CALLBACK=https://yourdomain.com
VITE_KAKAO_APP_KEY=production_kakao_key
```

### 우선순위 4: 네이버 Redirect URI 등록 (Medium)

1. **NAVER Developers Console** 접속
2. **내 애플리케이션** 선택
3. **설정 > Callback URL**에 다음 추가:
   - `http://localhost:5173` (개발)
   - `https://yourdomain.com` (운영)
   - `https://pages.dev/*` (Cloudflare Pages)

### 우선순위 5: 에러 로깅 개선 (Low)

```typescript
// 서버 로깅 추가
const logAuthError = (provider: string, error: any) => {
  console.error(`[Auth Error] ${provider}:`, {
    code: error?.code,
    message: error?.message,
    timestamp: new Date().toISOString(),
  });
  // 또는 서버 로그 API로 전송
};
```

---

## 📊 문제 영향도 분석

| 문제점 | 심각도 | 영향 | 사용자 경험 | 우선순위 |
|--------|--------|------|-------------|----------|
| 네이버 CORS | 🔴 Critical | 이메일 수집 불가 | ⭐⭐⭐ | 1 |
| Firebase 설정 | 🔴 Critical | 로그인 실패 | ⭐⭐⭐⭐ | 1 |
| Client ID 하드코딩 | 🔴 Critical | 보안/환경분리 | ⭐ | 2 |
| Redirect URI 불일치 | 🟡 Medium | 인증 실패 | ⭐⭐⭐ | 3 |
| 환경변수 누락 | 🟡 Medium | Demo 모드 실행 | ⭐⭐ | 3 |
| 에러 로깅 부족 | 🟢 Low | 디버깅 어려움 | - | 4 |
| SDK 로딩 타이밍 | 🟢 Low | 로그인 실패 사례 | ⭐ | 4 |

---

## ✅ 검증 체크리스트

### 네이버 인증
- [ ] NAVER Developers Console에서 Client ID 확인
- [ ] Callback URL 등록 (`localhost`, 배포 도메인)
- [ ] Client Secret 보관 확인 (Authorization Code Flow 사용 시)
- [ ] 백엔드 프록시 구현 완료
- [ ] CORS 에러 해결 확인
- [ ] 사용자 정보(이메일) 정상 수신 확인

### 구글 인증
- [ ] Firebase Console 접속
- [ ] Google Provider 활성화
- [ ] Authorized domains 추가
- [ ] API Key 제한 확인
- [ ] 로컬/운영 환경에서 테스트 완료
- [ ] 팝업 차단 문제 확인

### 카카오 인증
- [ ] KAKAO Developers Console 접속
- [ ] 앱 키 확인
- [ ] 플랫폼 등록 (Web)
- [ ] Redirect URI 등록
- [ ] 환경변수 설정 완료

### 공통
- [ ] 환경변수 `.env.local` 설정
- [ ] Cloudflare Pages 환경변수 설정
- [ ] 배포 후 인증 테스트 완료
- [ ] 에러 로깅 서버 연동
- [ ] 사용자 경험 개선 확인

---

## 🔧 기술 스택 및 의존성

```json
{
  "firebase": "^10.x",
  "@react-oauth/google": "^0.x", // 사용되지 않음 (Firebase SDK 사용)
  "react": "^18.x",
  "vite": "^5.x"
}
```

---

## 📝 참고 사항

### OAuth Flow 비교

| Flow | 장점 | 단점 | 추천 |
|------|------|------|------|
| Implicit Grant | 구현 간단, 백엔드 불필요 | 보안 취약, 토큰 노출, CORS 문제 | ❌ 사용 안 함 |
| Authorization Code | 보안 우수, 토큰 관리 용이 | 백엔드 필요, 구현 복잡 | ✅ 권장 |

### CORS란?

**Cross-Origin Resource Sharing**은 보안상의 이유로 브라우저가 다른 도메인의 API를 직접 호출하는 것을 제한하는 메커니즘입니다.

- 네이버 API(`openapi.naver.com`)는 웹브라우저에서 직접 호출을 허용하지 않음
- 백엔드를 통한 프록시 또는 Authorization Code Flow로 해결 필요

### Firebase Configuration Best Practices

```typescript
// ✅ 권장: 환경별 설정 파일 분리
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // ...
};

// ❌ 비권장: 하드코딩
const firebaseConfig = {
  apiKey: 'AIzaSyCjajL5P62Vk6Fn-Q_cyRPNdaPsmNJJcg4',
  // ...
};
```

---

## 🎯 결론

**주요 발견**:
1. **네이버 인증**: CORS 제한으로 인해 사용자 정보를 직접 가져올 수 없음
2. **구글 인증**: Firebase Console 설정 확인 필요
3. **환경변수**: 누락 및 관리 체계 부족

**즉시 조치 필요**:
1. 네이버 사용자 정보 API를 백엔드 프록시로 이동
2. Firebase Google Provider 활성화 및 도메인 등록
3. 환경별 환경변수 파일 정리

**장기 개선**:
1. Authorization Code Flow로 전환
2. 중앙화된 인증 미들웨어 구현
3. 에러 로깅 및 모니터링 시스템 구축

---

**진단자**: KBJ Supreme Commander
**문서 버전**: 1.0
**마지막 업데이트**: 2026-01-29
