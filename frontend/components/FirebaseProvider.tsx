"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
// Import all necessary Firebase modules
import { initializeApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  Auth,
  User as FirebaseAuthUser,
} from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// Dynamically import firestore methods within a module to avoid circular dependencies
// and ensure they are only available when Firebase is ready.
// This approach helps with tree-shaking and client-side only imports if needed,
// though for this app, it's always client-side.
const firestoreModule = {
  collection: (await import("firebase/firestore")).collection,
  doc: (await import("firebase/firestore")).doc,
  addDoc: (await import("firebase/firestore")).addDoc,
  setDoc: (await import("firebase/firestore")).setDoc,
  updateDoc: (await import("firebase/firestore")).updateDoc,
  deleteDoc: (await import("firebase/firestore")).deleteDoc,
  onSnapshot: (await import("firebase/firestore")).onSnapshot,
  query: (await import("firebase/firestore")).query,
  where: (await import("firebase/firestore")).where,
  orderBy: (await import("firebase/firestore")).orderBy,
  serverTimestamp: (await import("firebase/firestore")).serverTimestamp,
};


interface FirebaseContextType {
  db: Firestore | null;
  auth: Auth | null;
  userId: string | null;
  isAuthReady: boolean;
  isFirebaseServicesReady: boolean;
  firestoreModule: typeof firestoreModule | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  db: null,
  auth: null,
  userId: null,
  isAuthReady: false,
  isFirebaseServicesReady: false,
  firestoreModule: null,
});

export const FirebaseProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [db, setDb] = useState<Firestore | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false); // Authentication state (user logged in/out)
  const [isFirebaseServicesReady, setIsFirebaseServicesReady] = useState(false); // Firebase app and services initialized

  useEffect(() => {
    console.log("FP: useEffect for Firebase initialization triggered.");

    // IMPORTANT: Access global variables provided by Canvas environment
    const firebaseConfigString =
      typeof window !== "undefined" && typeof (window as any).__firebase_config !== "undefined"
        ? (window as any).__firebase_config
        : "{}"; // Default to empty object string if not provided

    const initialAuthToken =
      typeof window !== "undefined" && typeof (window as any).__initial_auth_token !== "undefined"
        ? (window as any).__initial_auth_token
        : null;

    let firebaseConfig;
    try {
      firebaseConfig = JSON.parse(firebaseConfigString);
      console.log("FP: Parsed Firebase Config:", firebaseConfig);
    } catch (e) {
      console.error("FP: Error parsing Firebase config:", e);
      // Fallback to a minimal config if parsing fails to prevent app crash
      firebaseConfig = { apiKey: "mock-api-key", projectId: "mock-project", appId: "mock-app-id" };
      setIsFirebaseServicesReady(false); // Indicate failure in config parsing
      return; // Exit if config is invalid
    }

    if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
        console.error("FP: Firebase config is incomplete or invalid:", firebaseConfig);
        setIsFirebaseServicesReady(false);
        return;
    }

    let app: FirebaseApp;
    try {
      // Check if an app is already initialized to prevent re-initialization warnings
      if (!FirebaseApp.apps || FirebaseApp.apps.length === 0) {
        app = initializeApp(firebaseConfig);
        console.log("FP: Firebase app initialized.");
      } else {
        app = FirebaseApp.apps[0];
        console.log("FP: Firebase app already initialized.");
      }

      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);
      setIsFirebaseServicesReady(true);
      console.log("FP: Firestore and Auth services initialized.");

      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        console.log("FP: Auth state changed. User:", user ? user.uid : "null");
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
          console.log("FP: User authenticated. UID:", user.uid);
        } else {
          setUserId(null);
          setIsAuthReady(false);
          console.log("FP: User not authenticated. Attempting anonymous sign-in or custom token.");
          try {
            if (initialAuthToken) {
                console.log("FP: Attempting sign-in with custom token...");
                await signInWithCustomToken(firebaseAuth, initialAuthToken);
                console.log("FP: Signed in with custom token.");
            } else {
                console.log("FP: No custom token. Attempting anonymous sign-in...");
                await signInAnonymously(firebaseAuth);
                console.log("FP: Signed in anonymously.");
            }
          } catch (error: any) {
            console.error("FP: Firebase sign-in failed:", error);
            // Optionally, handle error state for UI
            setIsAuthReady(false); // Authentication failed
            setUserId(null);
          }
        }
      });

      return () => {
        console.log("FP: Cleaning up Firebase auth listener.");
        unsubscribeAuth();
      };
    } catch (e) {
      console.error("FP: Failed to initialize Firebase services:", e);
      setIsFirebaseServicesReady(false);
    }
  }, []); // Empty dependency array means this runs once on mount

  // Provide the context value including the dynamic firestoreModule
  const contextValue = {
    db,
    auth,
    userId,
    isAuthReady,
    isFirebaseServicesReady,
    firestoreModule: isFirebaseServicesReady ? firestoreModule : null, // Only expose if services are ready
  };

  console.log("FP: FirebaseContext current value:", contextValue);

  return (
    <FirebaseContext.Provider value={contextValue}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return context;
};