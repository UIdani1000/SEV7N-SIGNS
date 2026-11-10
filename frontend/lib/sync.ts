// Cross-device sync: email sign-in (Firebase Auth) + one Firestore document per user.
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { Store, PaperTrade } from "./signs";

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
let app: FirebaseApp | null = null;
function fb() {
  if (!cfg.apiKey) throw new Error("Sync isn't configured on this deployment.");
  app = app || getApps().find(a => a.name === "signs") || initializeApp(cfg, "signs");
  return { auth: getAuth(app), db: getFirestore(app) };
}
const ref = (uid: string) => doc(fb().db, "artifacts", "sev7n-signs", "users", uid, "signs", "state");

export function friendly(e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  if (code.includes("operation-not-allowed")) return "Email sign-in is switched off. In Firebase, open Authentication, then Sign-in method, and enable Email/Password.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "That email and password don't match. Check them, or create an account.";
  if (code.includes("email-already-in-use")) return "An account with this email exists. Sign in instead.";
  if (code.includes("weak-password")) return "Use a password of at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address doesn't look right.";
  if (code.includes("permission-denied")) return "The database refused the save. Check the Firestore rules.";
  return (e as Error)?.message || "Sync failed.";
}
export const watchUser = (cb: (u: User | null) => void) => { try { return onAuthStateChanged(fb().auth, cb); } catch { cb(null); return () => {}; } };
export const signIn = (email: string, pw: string) => signInWithEmailAndPassword(fb().auth, email, pw);
export const signUp = (email: string, pw: string) => createUserWithEmailAndPassword(fb().auth, email, pw);
export const logOut = () => signOut(fb().auth);

export function merge(local: Store, remote: Store | null): Store {
  if (!remote) return local;
  const newer = (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  const byId = new Map<string, PaperTrade>();
  for (const t of [...remote.paper, ...local.paper]) {
    const prev = byId.get(t.id);
    const closed = (x?: PaperTrade) => x?.result && !["open", "unknown"].includes(x.result.status);
    if (!prev || (closed(t) && !closed(prev))) byId.set(t.id, t);
  }
  return { ...newer, paper: [...byId.values()].sort((a, b) => a.opened_at.localeCompare(b.opened_at)), updatedAt: Math.max(remote.updatedAt || 0, local.updatedAt || 0) };
}
export async function pull(uid: string): Promise<Store | null> { const s = await getDoc(ref(uid)); return s.exists() ? JSON.parse(s.data().data) : null; }
export async function push(uid: string, st: Store) { await setDoc(ref(uid), { data: JSON.stringify(st), updatedAt: st.updatedAt || Date.now() }); }
export const listen = (uid: string, cb: (s: Store) => void) => onSnapshot(ref(uid), snap => { if (snap.exists()) cb(JSON.parse(snap.data().data)); });
