import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';

// Dynamically import Firebase modules
// These 'let' declarations are necessary because functions from dynamically imported modules need to be assigned to them.
let initializeApp: any;
let getAuth: any;
let signInAnonymously: any;
let signInWithCustomToken: any;
let onAuthStateChanged: any;
let getFirestore: any;
let doc: any;
let getDoc: any;
let addDoc: any;
let setDoc: any;
let updateDoc: any;
let deleteDoc: any;
let onSnapshot: any;
let collection: any;
let query: any;
let where: any;
let getDocs: any;
let serverTimestamp: any;
let orderBy: any; // Explicitly declare orderBy here


// Define the shape of the Firebase context
interface FirebaseContextType {
  db: any; // Keeping 'any' for DB instance as its internal type is complex
  auth: any; // Keeping 'any' for Auth instance as its internal type is complex
  userId: string | null;
  isAuthReady: boolean;
  isFirebaseServicesReady: boolean;
  // Export Firebase modules for direct use in consuming components
  firestoreModule: {
    collection: typeof collection;
    doc: typeof doc;
    getDoc: typeof getDoc;
    addDoc: typeof addDoc;
    setDoc: typeof setDoc;
    updateDoc: typeof updateDoc;
    deleteDoc: typeof deleteDoc;
    onSnapshot: typeof onSnapshot;
    query: typeof query;
    where: typeof where;
    getDocs: typeof getDocs;
    serverTimestamp: typeof serverTimestamp;
    orderBy: typeof orderBy; // Expose orderBy here
  } | null;
  authModule: {
    getAuth: typeof getAuth;
    signInAnonymously: typeof signInAnonymously;
    signInWithCustomToken: typeof signInWithCustomToken;
    onAuthStateChanged: typeof onAuthStateChanged;
  } | null;
}

// Create the context with a default null value
const FirebaseContext = createContext<FirebaseContextType | null>(null);

// FirebaseProvider component
export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<any>(null);
  const [auth, setAuth] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isFirebaseServicesReady, setIsFirebaseServicesReady] = useState<boolean>(false);
  const [firestoreModule, setFirestoreModule] = useState<FirebaseContextType['firestoreModule']>(null);
  const [authModule, setAuthModule] = useState<FirebaseContextType['authModule']>(null);

  // Load Firebase services dynamically within useEffect
  useEffect(() => {
    const loadFirebaseServiceModules = async () => {
      // Only proceed if running in a browser environment
      if (typeof window !== 'undefined') {
        console.log("DIAG: Loading Firebase dynamic imports...");

        try {
          // Dynamically import Firebase modules
          const firebaseAppModule = await import("firebase/app");
          const firebaseAuthModule = await import("firebase/auth");
          const firebaseFirestoreModule = await import("firebase/firestore");

          // Assign imported functions to our global variables
          initializeApp = firebaseAppModule.initializeApp;
          getAuth = firebaseAuthModule.getAuth;
          signInAnonymously = firebaseAuthModule.signInAnonymously;
          signInWithCustomToken = firebaseAuthModule.signInWithCustomToken;
          onAuthStateChanged = firebaseAuthModule.onAuthStateChanged;

          getFirestore = firebaseFirestoreModule.getFirestore;
          collection = firebaseFirestoreModule.collection;
          doc = firebaseFirestoreModule.doc;
          getDoc = firebaseFirestoreModule.getDoc;
          addDoc = firebaseFirestoreModule.addDoc;
          setDoc = firebaseFirestoreModule.setDoc;
          updateDoc = firebaseFirestoreModule.updateDoc;
          deleteDoc = firebaseFirestoreModule.deleteDoc;
          onSnapshot = firebaseFirestoreModule.onSnapshot;
          query = firebaseFirestoreModule.query;
          where = firebaseFirestoreModule.where;
          getDocs = firebaseFirestoreModule.getDocs;
          serverTimestamp = firebaseFirestoreModule.serverTimestamp;
          orderBy = firebaseFirestoreModule.orderBy; // Assign orderBy here


          // Construct Firebase config from environment variables
          const firebaseConfig = {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID, // Use NEXT_PUBLIC_FIREBASE_APP_ID here as well
            measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
          };

          const appInstance = initializeApp(firebaseConfig);
          const authInstance = getAuth(appInstance);
          const dbInstance = getFirestore(appInstance);

          // Update state with initialized instances and modules
          setAuth(authInstance);
          setDb(dbInstance);

          setFirestoreModule({
            collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, serverTimestamp, orderBy
          });
          setAuthModule({
            getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged
          });

          setIsFirebaseServicesReady(true);
          console.log("DIAG: Firebase services loaded and initialized.");
        } catch (error) {
          console.error("DIAG: Error loading Firebase modules or initializing:", error);
          setIsFirebaseServicesReady(false);
        }
      }
    };

    loadFirebaseServiceModules();
  }, []); // Empty dependency array means this runs once on mount

  // Authentication listener
  useEffect(() => {
    let unsubscribeAuth: () => void;

    if (auth && isFirebaseServicesReady && authModule) {
      console.log("DIAG: Setting up Firebase auth listener...");
      unsubscribeAuth = authModule.onAuthStateChanged(auth, async (user: any) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
          console.log("DIAG: User signed in:", user.uid);
        } else {
          const initialAuthToken = typeof (window as any).__initial_auth_token !== 'undefined' ? (window as any).__initial_auth_token : null;
          try {
            if (initialAuthToken) {
              await authModule.signInWithCustomToken(auth, initialAuthToken);
              console.log("DIAG: Signed in with custom token.");
            } else {
              await authModule.signInAnonymously(auth);
              console.log("DIAG: Signed in anonymously.");
            }
          } catch (error) {
            console.error("DIAG: Firebase anonymous sign-in failed:", error);
            // Fallback to random ID if anonymous sign-in fails, but still mark ready
            setUserId(crypto.randomUUID());
            setIsAuthReady(true);
            console.log("DIAG: Anonymous sign-in failed, using random userId.");
          }
        }
      });
    } else {
      console.log("DIAG: Auth listener not set up. auth:", !!auth, "isFirebaseServicesReady:", isFirebaseServicesReady, "authModule:", !!authModule);
      // If Firebase services aren't ready, and no userId is set, provide a temporary one to avoid crashes
      // and allow components to proceed with rendering, even if not fully authenticated yet.
      // This part ensures a userId is always present for Firestore paths even if auth isn't fully set up.
      if (!userId && !isAuthReady && !isFirebaseServicesReady) { // Check if not already set or ready
        setUserId(crypto.randomUUID());
        setIsAuthReady(true);
        console.log("DIAG: Firebase not ready, setting immediate random userId for initial render.");
      }
    }

    return () => {
      if (unsubscribeAuth) {
        console.log("DIAG: Cleaning up auth listener.");
        unsubscribeAuth();
      }
    };
    // **Corrected Dependencies:** Removed setUserId and setIsAuthReady because they are stable setters.
    // The effect only depends on the *values* of auth, isFirebaseServicesReady, and authModule.
  }, [auth, isFirebaseServicesReady, authModule, userId, isAuthReady]); // Kept userId, isAuthReady for conditional logic within the effect itself.

  const contextValue = {
    db,
    auth,
    userId,
    isAuthReady,
    isFirebaseServicesReady,
    firestoreModule,
    authModule,
  };

  return (
    <FirebaseContext.Provider value={contextValue}>
      {children}
    </FirebaseContext.Provider>
  );
};

// Custom hook to use Firebase context
export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};