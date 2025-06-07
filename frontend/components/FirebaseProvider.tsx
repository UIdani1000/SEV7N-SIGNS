"use client"; // This component MUST run on the client

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

// Import all necessary Firebase App, Auth, and Firestore functions
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
// We will dynamically import specific auth/firestore functions later to avoid bundling issues
import type { Auth } from 'firebase/auth'; // Import types directly
import type { Firestore } from 'firebase/firestore'; // Import types directly


// Define the shape of the Firebase context
interface FirebaseContextType {
  db: Firestore | null;
  auth: Auth | null;
  userId: string | null;
  isAuthReady: boolean;
  isFirebaseServicesReady: boolean;
  firestoreModule: typeof import('firebase/firestore') | null; // Provide the module itself
  authModule: typeof import('firebase/auth') | null; // Provide the module itself
}

// Create the context
const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

// Define props for the provider
interface FirebaseProviderProps {
  children: ReactNode;
}

// Get appId from environment (same as in page.tsx)
const appId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'default-app-id';

export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({ children }) => {
  const [db, setDb] = useState<Firestore | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isFirebaseServicesReady, useStateIsFirebaseServicesReady] = useState(false);

  // Store the dynamically imported modules
  const [authModule, setAuthModule] = useState<typeof import('firebase/auth') | null>(null);
  const [firestoreModule, setFirestoreModule] = useState<typeof import('firebase/firestore') | null>(null);

  // Internal state for error alerts
  const [internalAlert, setInternalAlert] = useState<{ message: string; type: 'error' } | null>(null);

  // Effect to initialize Firebase app, get Auth and Firestore instances, and set up auth listener
  useEffect(() => {
    let firebaseAppInstance: FirebaseApp | null = null;

    console.log("DIAG: FirebaseProvider: Primary Firebase useEffect triggered.");

    if (typeof window !== 'undefined') {
      console.log("DIAG: FirebaseProvider: Running on client-side. Checking existing app instances...");

      if (!getApps().length) {
        console.log("DIAG: FirebaseProvider: No existing Firebase app found. Attempting to initialize.");
        let firebaseConfig = null;
        let configParseError = null;

        // In a new project, we'll ensure environment variables are clearly handled.
        // You'll need to set NEXT_PUBLIC_FIREBASE_CONFIG in your .env.local file
        // e.g., NEXT_PUBLIC_FIREBASE_CONFIG='{"apiKey":"...", "authDomain":"...", ...}'
        if (process.env.NEXT_PUBLIC_FIREBASE_CONFIG) {
          const trimmedConfig = process.env.NEXT_PUBLIC_FIREBASE_CONFIG.trim();
          try {
            const parsedConfig = JSON.parse(trimmedConfig);
            if (typeof parsedConfig === 'object' && parsedConfig !== null && parsedConfig.apiKey && parsedConfig.projectId) {
              firebaseConfig = parsedConfig;
              console.log("DIAG: FirebaseProvider: Successfully parsed NEXT_PUBLIC_FIREBASE_CONFIG.");
            } else {
              configParseError = "Config missing essential fields (apiKey or projectId) or is not an object.";
              console.error("DIAG: FirebaseProvider: " + configParseError, parsedConfig);
            }
          } catch (e: any) {
            configParseError = `Error parsing NEXT_PUBLIC_FIREBASE_CONFIG JSON: ${e.message}`;
            console.error("DIAG: FirebaseProvider: " + configParseError, e);
          }
        } else {
          configParseError = "NEXT_PUBLIC_FIREBASE_CONFIG environment variable is NOT set. Firebase will not initialize.";
          console.error("DIAG: FirebaseProvider: " + configParseError);
        }

        if (firebaseConfig) {
          try {
            firebaseAppInstance = initializeApp(firebaseConfig);
            console.log("DIAG: FirebaseProvider: New Firebase app initialized successfully.");
          } catch (e) {
            console.error("DIAG: FirebaseProvider: Error during initializeApp call:", e);
            setInternalAlert({ message: `Firebase Init Error: ${e instanceof Error ? e.message : String(e)}`, type: 'error' });
            firebaseAppInstance = null;
          }
        } else {
          console.error("DIAG: FirebaseProvider: Skipping Firebase app initialization due to invalid or missing config: " + configParseError);
          setInternalAlert({ message: `Firebase Config Error: ${configParseError}`, type: 'error' });
        }
      } else {
        firebaseAppInstance = getApp();
        console.log("DIAG: FirebaseProvider: Using existing Firebase app instance.");
      }

      if (firebaseAppInstance) {
        const loadFirebaseServiceModules = async (app: FirebaseApp) => {
          try {
            console.log("DIAG: FirebaseProvider: Dynamically importing Firebase auth and firestore modules...");
            const auth_module = await import('firebase/auth');
            const firestore_module = await import('firebase/firestore');

            setAuthModule(auth_module);
            setFirestoreModule(firestore_module);
            console.log("DIAG: FirebaseProvider: Auth and firestore modules loaded.");

            const authInstance = auth_module.getAuth(app);
            const firestoreInstance = firestore_module.getFirestore(app);

            setAuth(authInstance);
            setDb(firestoreInstance);
            useStateIsFirebaseServicesReady(true);
            console.log("DIAG: FirebaseProvider: Auth and Firestore instances obtained.");

            const unsubscribeAuth = auth_module.onAuthStateChanged(authInstance, async (user) => {
              console.log("DIAG: FirebaseProvider: onAuthStateChanged callback triggered.");
              if (user) {
                setUserId(user.uid);
                console.log("DIAG: FirebaseProvider: User authenticated. UID:", user.uid);
              } else {
                try {
                  console.log("DIAG: FirebaseProvider: No user, attempting anonymous sign-in...");
                  const initialAuthToken = (window as any).__initial_auth_token;
                  if (initialAuthToken) {
                    await auth_module.signInWithCustomToken(authInstance, initialAuthToken);
                    console.log("DIAG: FirebaseProvider: Signed in with custom token.");
                  } else {
                    await auth_module.signInAnonymously(authInstance);
                    console.log("DIAG: FirebaseProvider: Signed in anonymously.");
                  }
                  const currentUid = authInstance.currentUser?.uid || crypto.randomUUID();
                  setUserId(currentUid);
                  console.log("DIAG: FirebaseProvider: Sign-in successful. UID:", currentUid);
                } catch (anonError: any) {
                  const authErrorMessage = `Firebase Auth failed: ${anonError.message}`;
                  console.error("DIAG: FirebaseProvider: " + authErrorMessage, anonError);
                  setInternalAlert({ message: authErrorMessage, type: 'error' });
                  setUserId(crypto.randomUUID());
                }
              }
              setIsAuthReady(true);
              console.log("DIAG: FirebaseProvider: isAuthReady set to true.");
            });

            return () => {
              console.log("DIAG: FirebaseProvider: Cleaning up Firebase auth listener.");
              unsubscribeAuth();
            };

          } catch (error: any) {
            const servicesError = `Error loading/getting Firebase services: ${error.message}`;
            console.error("DIAG: FirebaseProvider: " + servicesError, error);
            setInternalAlert({ message: servicesError, type: 'error' });
            setIsAuthReady(true);
            setUserId(crypto.randomUUID());
          }
        };
        loadFirebaseServiceModules(firebaseAppInstance);
      }
    } else {
      console.log("DIAG: FirebaseProvider: Not running on client-side. Skipping Firebase initialization.");
    }
  }, []); // Empty dependency array means this effect runs once on mount

  // This internal useFirebase is for consistency but the exported one is what page.tsx uses
  const useFirebase = () => {
    const context = useContext(FirebaseContext);
    if (context === undefined) {
      throw new Error('useFirebase must be used within a FirebaseProvider');
    }
    return context;
  };

  return (
    <FirebaseContext.Provider value={{ db, auth, userId, isAuthReady, isFirebaseServicesReady, firestoreModule, authModule }}>
      {children}
      {internalAlert && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 p-3 bg-red-700 text-white rounded-md shadow-lg z-50">
          {internalAlert.message}
          <button onClick={() => setInternalAlert(null)} className="ml-2 text-white/80 hover:text-white">X</button>
        </div>
      )}
    </FirebaseContext.Provider>
  );
};

// Export the useFirebase hook for consuming components
export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
