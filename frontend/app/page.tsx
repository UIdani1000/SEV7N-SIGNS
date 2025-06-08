"use client"

import React, { useState, useEffect } from "react"
// Import only essential Lucide-React icons for this minimal version
import { Home, Bell, User, X, Bot, Menu } from "lucide-react"

// Import the new FirebaseProvider and useFirebase hook
import { FirebaseProvider, useFirebase } from '@/components/FirebaseProvider';

// --- START: Backend URL ---
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://127.0.0.1:10000";
console.log("DIAG: Initial BACKEND_BASE_URL (from env or fallback):", BACKEND_BASE_URL);
// --- END: Backend URL ---

// Global variables for Firebase configuration (using process.env for Vercel deployment)
const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
console.log("DIAG: Initial appId (from environment or fallback):", appId);


// Custom Alert/Message component (to replace window.alert)
const CustomAlert: React.FC<{ message: string; type: 'success' | 'error' | 'warning' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
  const bgColor = {
    'success': 'bg-emerald-600',
    'error': 'bg-red-600',
    'warning': 'bg-amber-600',
    'info': 'bg-blue-600'
  }[type];

  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg transform transition-transform duration-300 translate-x-0`}>
      <div className="flex items-center justify-between">
        <span>{message}</span>
        <button onClick={onClose} className="ml-3 text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};


// !!! THIS IS THE MAIN EXPORT FOR YOUR PAGE !!!
// It wraps the actual application logic (TradingDashboardContent) with the FirebaseProvider.
export default function TradingDashboardWrapper() {
  return (
    <FirebaseProvider>
      <TradingDashboardContent />
    </FirebaseProvider>
  );
}


// This component now contains the actual application logic and uses the useFirebase hook.
function TradingDashboardContent() {
  // We explicitly destructure only what's absolutely necessary for the minimal UI
  const { userId, isAuthReady, isFirebaseServicesReady } = useFirebase();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  // No other state variables or complex logic for this ultra-minimal test

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-800 bg-gray-900 transition-transform md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-6">
          <div className="flex items-center space-x-2">
            <Bot className="h-6 w-6 text-purple-400" />
            <span className="text-xl font-semibold">Aura Bot</span>
          </div>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-6 w-6" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-4">
          <a
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors bg-gray-800 text-purple-400`}
            href="#"
            onClick={() => { /* No-op for now */ }}
          >
            <Home className="h-5 w-5" />
            Dashboard
          </a>
          {/* Other navigation links are completely removed for this test */}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900 px-6">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-semibold">Aura Trading Dashboard</h1>
          <div className="flex items-center space-x-4">
            <Bell className="h-6 w-6 text-gray-400" />
            <span className="text-sm text-gray-400 mr-2">User ID: {isAuthReady && isFirebaseServicesReady ? (userId ? `${userId.substring(0, 8)}...` : 'N/A') : 'Loading...'}</span>
            <User className="h-6 w-6 text-gray-400" />
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <main className="flex-1 p-6">
            {currentAlert && <CustomAlert message={currentAlert.message} type={currentAlert.type} onClose={() => setCurrentAlert(null)} />}

                        <div className="flex flex-col space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">Application Shell</h2>
              <p className="text-gray-400">If this deploys, the core setup is working. We will then add more features back one by one.</p>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}