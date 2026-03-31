import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';

// 기존 seastar-cable-auth-99 Firebase 프로젝트 재사용
const firebaseConfig = {
  apiKey: 'AIzaSyCjajL5P62Vk6Fn-Q_cyRPNdaPsmNJJcg4',
  authDomain: 'seastar-cable-auth-99.firebaseapp.com',
  projectId: 'seastar-cable-auth-99',
  storageBucket: 'seastar-cable-auth-99.firebasestorage.app',
  messagingSenderId: '578939358147',
  appId: '1:578939358147:web:233691a31fbc3a47b54b76',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/** Google 팝업 로그인 → { uid, name, email } */
export async function signInWithGoogle(): Promise<{ uid: string; name: string; email: string }> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  return {
    uid: user.uid,
    name: user.displayName || '사용자',
    email: user.email || '',
  };
}

/** 로그아웃 */
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/** 현재 Firebase 유저 → ID 토큰 (D1 API 인증용) */
export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/** 인증 상태 변경 구독 */
export function onAuthChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export type { User };
