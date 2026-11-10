"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
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
} from "firebase/firestore";


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
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isFirebaseServicesReady, setIsFirebaseServicesReady] = useState(false);

  useEffect(() => {
    console.log("FP: useEffect for Firebase initialization triggered.");

    // Construct firebaseConfig from individual environment variables (best practice)
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    };

    // Fallback to Canvas's __firebase_config if NEXT_PUBLIC_FIREBASE_API_KEY is not set (for local Canvas runtime)
    // IMPORTANT: This fallback should ideally only be for development/local Canvas.
    // For Vercel deployments, the NEXT_PUBLIC_FIREBASE_API_KEY should always be provided.
    let canvasFirebaseConfigString = "";
    if (typeof window !== "undefined" && typeof (window as any).__firebase_config !== "undefined") {
      canvasFirebaseConfigString = (window as any).__firebase_config;
    }

    let finalFirebaseConfig = firebaseConfig;

    if (!firebaseConfig.apiKey && canvasFirebaseConfigString) {
      try {
        const parsedCanvasConfig = JSON.parse(canvasFirebaseConfigString);
        finalFirebaseConfig = { ...firebaseConfig, ...parsedCanvasConfig }; // Merge with higher priority for environment variables
        console.log("FP: Falling back to Canvas's __firebase_config due to missing NEXT_PUBLIC_FIREBASE_API_KEY.");
      } catch (e) {
        console.error("FP: Error parsing __firebase_config from Canvas:", e);
      }
    }


    // Check for essential Firebase config properties
    if (!finalFirebaseConfig.apiKey || !finalFirebaseConfig.projectId || !finalFirebaseConfig.appId) {
      console.error("FP: Final Firebase config is incomplete. Missing essential properties.", finalFirebaseConfig);
      setIsFirebaseServicesReady(false);
      return; // Exit early if config is invalid
    }

    console.log("FP: Using final Firebase Config:", finalFirebaseConfig);

    let app: FirebaseApp;
    try {
      if (getApps().length === 0) {
        app = initializeApp(finalFirebaseConfig as any); // Type assertion as initializeApp expects specific config structure
        console.log("FP: Firebase app initialized.");
      } else {
        app = getApps()[0];
        console.log("FP: Firebase app already initialized.");
      }

      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);
      setIsFirebaseServicesReady(true);
      console.log("FP: Firestore and Auth services initialized.");

      // Initial auth token still comes from Canvas environment if available
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
            setIsAuthReady(false);
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
  }, []);

  const contextValue = {
    db,
    auth,
    userId,
    isAuthReady,
    isFirebaseServicesReady,
    firestoreModule: isFirebaseServicesReady ? firestoreModule : null,
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