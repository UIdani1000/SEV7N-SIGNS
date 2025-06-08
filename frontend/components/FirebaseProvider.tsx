import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';

// Dynamically import Firebase modules to avoid bundling them if not needed or
// to allow them to be loaded on demand. This also helps with Next.js SSR.
// These 'let' declarations remain because functions from dynamically imported modules need to be assigned to them.
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
  } | null;
  authModule: {
    getAuth: typeof getAuth;
    isAuthReady: typeof isAuthReady; // Added isAuthReady
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
          initializeApp = firebaseAppModule.initializeApp; // Correct assignment
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


          // Construct Firebase config from environment variables
          const firebaseConfig = {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
            measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
          };

          const appInstance = initializeApp(firebaseConfig); // Use initializeApp here
          const authInstance = getAuth(appInstance);
          const dbInstance = getFirestore(appInstance);

          // Update state with initialized instances and modules
          setAuth(authInstance);
          setDb(dbInstance);

          setFirestoreModule({
            collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, serverTimestamp
          });
          setAuthModule({
            getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, isAuthReady // Added isAuthReady to authModule
          });

          setIsFirebaseServicesReady(true);
          console.log("DIAG: Firebase services loaded and initialized.");
        } catch (error) {
          console.error("DIAG: Error loading Firebase modules or initializing:", error);
          // Set services ready to false to indicate failure
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
      unsubscribeAuth = authModule.onAuthStateChanged(auth, async (user: any) => { // Keeping 'any' for user for now.
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
          console.log("DIAG: User signed in:", user.uid);
        } else {
          // If no user, try to sign in anonymously using the initial token if available
          // Otherwise, sign in anonymously to ensure a userId for Firestore rules
          const initialAuthToken = typeof (window as any).__initial_auth_token !== 'undefined' ? (window as any).__initial_auth_token : null; // Access __initial_auth_token from window
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
            // Fallback: If anonymous sign-in fails, generate a random ID
            setUserId(crypto.randomUUID());
            setIsAuthReady(true); // Still ready, just not authenticated by Firebase
            console.log("DIAG: Anonymous sign-in failed, using random userId.");
          }
        }
      });
    } else {
      console.log("DIAG: Auth listener not set up. auth:", !!auth, "isFirebaseServicesReady:", isFirebaseServicesReady, "authModule:", !!authModule);
      // Fallback for when Firebase services are not ready or auth module is not loaded
      if (!userId && !isAuthReady) {
        setUserId(crypto.randomUUID());
        setIsAuthReady(true);
        console.log("DIAG: Firebase not ready, setting immediate random userId for initial render.");
      }
    }

    // Fixed: Added all necessary dependencies to the useEffect array
    return () => {
      if (unsubscribeAuth) {
        console.log("DIAG: Cleaning up auth listener.");
        unsubscribeAuth();
      }
    };
  }, [auth, isFirebaseServicesReady, authModule, userId, isAuthReady]); // Added userId, isAuthReady to dependencies

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