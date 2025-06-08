"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
// Import all necessary Firebase modules
import { initializeApp, getApps, FirebaseApp } from "firebase/app"; // Added getApps
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  Auth,
  User as FirebaseAuthUser,
} from "firebase/auth";
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore"; // Imported all firestore methods directly


// Create a simple object with directly imported firestore functions
const firestoreModule = {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
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

    let firebaseConfigString = "";

    // Prioritize NEXT_PUBLIC_FIREBASE_CONFIG from Vercel environment variables
    if (process.env.NEXT_PUBLIC_FIREBASE_CONFIG) {
      firebaseConfigString = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
      console.log("FP: Using Firebase config from NEXT_PUBLIC_FIREBASE_CONFIG environment variable.");
    }
    // Fallback to Canvas's __firebase_config if NEXT_PUBLIC_FIREBASE_CONFIG is not set
    else if (typeof window !== "undefined" && typeof (window as any).__firebase_config !== "undefined") {
      firebaseConfigString = (window as any).__firebase_config;
      console.log("FP: Using Firebase config from __firebase_config global variable.");
    } else {
      console.warn("FP: No Firebase config found in NEXT_PUBLIC_FIREBASE_CONFIG or __firebase_config. Firebase will not initialize.");
      setIsFirebaseServicesReady(false);
      return; // Exit early if no config is available
    }

    let firebaseConfig;
    try {
      firebaseConfig = JSON.parse(firebaseConfigString);
      console.log("FP: Parsed Firebase Config:", firebaseConfig);
    } catch (e) {
      console.error("FP: Error parsing Firebase config string:", e);
      // Removed alert, as we cannot use `setCurrentAlert` directly in provider
      setIsFirebaseServicesReady(false);
      return; // Exit if config is invalid
    }

    if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
        console.error("FP: Firebase config is incomplete or invalid after parsing:", firebaseConfig);
        setIsFirebaseServicesReady(false);
        return;
    }

    let app: FirebaseApp;
    try {
      // FIX: Use getApps().length to check for initialized apps
      if (getApps().length === 0) {
        app = initializeApp(firebaseConfig);
        console.log("FP: Firebase app initialized.");
      } else {
        app = getApps()[0]; // Get the default app if already initialized
        console.log("FP: Firebase app already initialized.");
      }

      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);
      setIsFirebaseServicesReady(true);
      console.log("FP: Firestore and Auth services initialized.");

      const initialAuthToken =
        typeof window !== "undefined" && typeof (window as any).__initial_auth_token !== "undefined"
          ? (window as any).__initial_auth_token
          : null;

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