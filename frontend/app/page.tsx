"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
// Import only essential Lucide-React icons for this minimal version + chat icons
import {
  Home,
  MessageCircle,
  Menu,
  X,
  Bell,
  Bot,
  User,
  Send,
  Plus,
  History,
  SquarePen,
  Mic,
  Volume2
} from "lucide-react"

// Import the new FirebaseProvider and useFirebase hook
import { FirebaseProvider, useFirebase } from '@/components/FirebaseProvider';

// --- START: Backend URL ---
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://127.0.0.1:10000";
console.log("DIAG: Initial BACKEND_BASE_URL (from env or fallback):", BACKEND_BASE_URL);
// --- END: Backend URL ---

// Global variables for Firebase configuration (using process.env for Vercel deployment)
const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
console.log("DIAG: Initial appId (from environment or fallback):", appId);


// Define interfaces for a chat session (needed for chat functionality)
interface ChatSession {
  id: string;
  name: string;
  createdAt: any;
  lastMessageText: string;
  lastMessageTimestamp?: any;
}

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
  const { db, userId, isAuthReady, isFirebaseServicesReady, firestoreModule } = useFirebase();

  // --- STATE VARIABLES ---
  const [activeView, setActiveView] = useState("dashboard") // Default to dashboard for now
  const [sidebarOpen, setSidebarOpen] = useState(false) // Left sidebar toggle
  const [currentAlert, setCurrentAlert] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const [isChatHistoryMobileOpen, setIsChatHistoryMobileOpen] = useState(false); // Right overlay sidebar toggle

  // Chat states (reintroduced)
  const [messageInput, setMessageInput] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const [chatMessages, setChatMessages] = useState<
    { id: string; sender: string; text: string; timestamp?: any }[]
  >([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Simple hardcoded for now, will reintroduce settings loading later
  const [aiAssistantName] = useState("Aura");


  // --- HANDLERS ---

  // Handle creating a new conversation (reintroduced)
  const handleNewConversation = useCallback(async () => {
    if (!db || !userId || !isAuthReady || !isFirebaseServicesReady || !firestoreModule) {
      setCurrentAlert({ message: "Firebase not ready. Cannot create new conversation.", type: "warning" });
      console.warn("DIAG: Attempted to create new conversation, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule);
      return;
    }
    console.log("DIAG: Creating new chat session...");
    try {
      const sessionsCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/chatSessions`);
      const newSessionRef = await firestoreModule.addDoc(sessionsCollectionRef, {
        name: "New Chat " + new Date().toLocaleString().split(',')[0],
        createdAt: firestoreModule.serverTimestamp(),
        lastMessageText: "No messages yet.",
      });
      setCurrentChatSessionId(newSessionRef.id);
      setMessageInput('');
      setChatMessages([]);
      setIsChatHistoryMobileOpen(false);
      setCurrentAlert({ message: "New conversation started! Type your first message.", type: "success" });
      console.log("DIAG: New chat session created with ID:", newSessionRef.id);

      const messagesCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${newSessionRef.id}/messages`);
      const initialGreeting = {
        id: crypto.randomUUID(),
        sender: 'ai',
        text: `Hello! I&apos;m ${aiAssistantName}, your AI trading assistant. How can I help you today?`, // FIXED APOSTROPHE HERE
        timestamp: firestoreModule.serverTimestamp()
      };
      await firestoreModule.addDoc(messagesCollectionRef, initialGreeting);
      console.log("DIAG: Initial greeting added to new chat session.");

    } catch (error: any) {
      console.error("DIAG: Error creating new conversation:", error);
      setCurrentAlert({ message: `Failed to start new conversation: ${error.message}`, type: "error" });
    }
  }, [db, userId, aiAssistantName, isAuthReady, isFirebaseServicesReady, firestoreModule, appId]);

  // Handle switching active conversation (reintroduced)
  const handleSwitchConversation = (sessionId: string) => {
    setCurrentChatSessionId(sessionId);
    setIsChatHistoryMobileOpen(false);
    setMessageInput('');
    setCurrentAlert({ message: "Switched to selected conversation.", type: "info" });
    console.log("DIAG: Switched to conversation ID:", sessionId);
  };


  // Helper function to fetch from backend (reintroduced)
  const fetchBackendChatResponse = useCallback(async (requestBody: any) => {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: response.statusText}));
        throw new Error(`Backend error! Status: ${response.status}. Message: ${errorData.error || "Unknown response"}`);
      }

      const data = await response.json();
      const aiResponseText = data.response || "No response from AI.";
      const aiMessage = { id: crypto.randomUUID(), sender: "ai", text: aiResponseText, timestamp: firestoreModule?.serverTimestamp() };

      console.log("DIAG: AI response received:", data);
      if (db && userId && currentChatSessionId && firestoreModule) {
        const messagesCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`);
        await firestoreModule.addDoc(messagesCollectionRef, aiMessage);
        console.log("DIAG: AI response added to Firestore.");

        // Update chat session again with AI's last message
        const sessionDocRef = firestoreModule.doc(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}`);
        await firestoreModule.setDoc(sessionDocRef, {
          lastMessageText: aiMessage.text,
          lastMessageTimestamp: aiMessage.timestamp,
        }, { merge: true });
      }

    } catch (error: any) {
      console.error("DIAG: Error communicating with backend:", error);
      setCurrentAlert({ message: `Failed to get AI response. Check backend deployment and URL: ${error.message || "Unknown error"}`, type: "error" });
      const errorMessage = { id: crypto.randomUUID(), sender: "ai", text: `Oops! I encountered an error getting a response from the backend: ${error.message || "Unknown error"}. Please check your backend's status and its URL configuration in Vercel. 😅`, timestamp: firestoreModule ? firestoreModule.serverTimestamp() : null };
      if (db && userId && currentChatSessionId && firestoreModule) {
        const messagesCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`);
        await firestoreModule.addDoc(messagesCollectionRef, errorMessage);
      } else {
        setChatMessages((prevMessages) => [...prevMessages, errorMessage]);
      }
    } finally {
      setIsSendingMessage(false);
      console.log("DIAG: Backend fetch finished.");
    }
  }, [db, userId, currentChatSessionId, firestoreModule, appId, setChatMessages]);


  // Handle sending chat message - NOW PERSISTENT WITH FIRESTORE (reintroduced)
  const handleSendMessage = useCallback(async (isVoice = false, audioBlob?: Blob) => {
    if (!messageInput.trim() && !isVoice) return;
    if (!db || !userId || !currentChatSessionId || !isAuthReady || !isFirebaseServicesReady || !firestoreModule) {
      setCurrentAlert({ message: "Chat not ready. Please wait a moment or start a new conversation.", type: "warning" });
      console.warn("DIAG: Attempted to send message, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "currentChatSessionId:", !!currentChatSessionId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule);
      return;
    }

    const messageContent = messageInput.trim();
    const messageType = isVoice ? 'audio' : 'text';

    setIsSendingMessage(true);
    setMessageInput(""); // Clear input immediately

    try {
      const userMessage = { id: crypto.randomUUID(), sender: "user", text: messageContent, timestamp: firestoreModule.serverTimestamp(), type: messageType };
      console.log("DIAG: User message prepared:", userMessage);

      console.log("DIAG: Adding user message to Firestore for session:", currentChatSessionId);
      const messagesCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`);
      await firestoreModule.addDoc(messagesCollectionRef, userMessage);
      console.log("DIAG: User message added to Firestore.");

      // Update the chat session's last message text and timestamp
      const sessionDocRef = firestoreModule.doc(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}`);
      await firestoreModule.setDoc(sessionDocRef, {
        lastMessageText: userMessage.text,
        lastMessageTimestamp: userMessage.timestamp,
        name: chatMessages.length === 0 ? userMessage.text.substring(0, 30) + (userMessage.text.length > 30 ? '&hellip;' : '') : (chatSessions.find((s: ChatSession) => s.id === currentChatSessionId)?.name || "Untitled Chat"),
      }, { merge: true });

      // Prepare chat history to send to backend (all messages in the current session)
      const payloadHistory = chatMessages
        .filter(msg => msg.id !== 'initial-greeting')
        .map(msg => ({ role: msg.sender === "user" ? "user" : "model", text: msg.text }));
      payloadHistory.push({ role: 'user', text: userMessage.text });


      const requestBody: any = {
        session_id: currentChatSessionId,
        user_id: userId,
        message: userMessage.text,
        message_type: messageType,
        chatHistory: payloadHistory
      };

      if (isVoice && audioBlob) {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          requestBody.audio_data = base64Audio;
          await fetchBackendChatResponse(requestBody);
        };
      } else {
        await fetchBackendChatResponse(requestBody);
      }

    } catch (error: any) {
      console.error("DIAG: Error in handleSendMessage (pre-backend-fetch):", error);
      setCurrentAlert({ message: `Error sending message: ${error.message || "Unknown error"}`, type: "error" });
      setIsSendingMessage(false);
    }
  }, [messageInput, db, userId, currentChatSessionId, isAuthReady, isFirebaseServicesReady, firestoreModule, chatMessages, chatSessions, fetchBackendChatResponse, appId]);

  // Voice recording handlers (reintroduced)
  const handleStartVoiceRecording = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices) {
      console.error("MediaDevices not supported in this environment.");
      return;
    }
    if (!currentChatSessionId) {
      setCurrentAlert({ message: "Please start a new chat session before recording voice.", type: "warning" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log("DIAG: Audio recording stopped, blob created:", audioBlob);
        setMessageInput("[Voice Message]");
        await handleSendMessage(true, audioBlob);
        audioChunksRef.current = [];
      };
      mediaRecorderRef.current.start();
      setIsVoiceRecording(true);
      console.log("DIAG: Voice recording started.");
    } catch (err) {
      console.error("DIAG: Error accessing microphone:", err);
      setCurrentAlert({ message: "Failed to start voice recording. Please check microphone permissions.", type: "error" });
    }
  }, [currentChatSessionId, handleSendMessage, setMessageInput]);

  const handleStopVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsVoiceRecording(false);
      console.log("DIAG: Voice recording stopped.");
    }
  }, []);

  // --- USE EFFECTS ---

  // Effect for fetching chat sessions (reintroduced)
  useEffect(() => {
    console.log("DIAG: useEffect for chat sessions listener triggered. db ready:", !!db, "userId ready:", !!userId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule);
    if (db && userId && isAuthReady && isFirebaseServicesReady && firestoreModule) {
      const sessionsCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/chatSessions`);
      const q = firestoreModule.query(sessionsCollectionRef, firestoreModule.orderBy('createdAt', 'desc'));

      const unsubscribe = firestoreModule.onSnapshot(q, (snapshot: any) => {
        console.log("DIAG: onSnapshot for chat sessions received data.");
        const sessions = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          name: doc.data().name || "Untitled Chat",
          createdAt: doc.data().createdAt,
          lastMessageText: doc.data().lastMessageText || "No messages yet.",
          lastMessageTimestamp: doc.data().lastMessageTimestamp || null
        })) as ChatSession[];
        setChatSessions(sessions);

        if (!currentChatSessionId || !sessions.some((s: ChatSession) => s.id === currentChatSessionId)) {
          if (sessions.length > 0) {
            setCurrentChatSessionId(sessions[0].id);
            console.log("DIAG: Setting currentChatSessionId to most recent:", sessions[0].id);
          } else {
            setCurrentChatSessionId(null);
            console.log("DIAG: No chat sessions found, setting currentChatSessionId to null.");
          }
        }
      }, (error: any) => {
        console.error("DIAG: Error fetching chat sessions:", error);
        setCurrentAlert({ message: `Failed to load chat sessions: ${error.message || 'Unknown error'}`, type: "error" });
      });

      return () => {
        console.log("DIAG: Cleaning up chat sessions listener.");
        unsubscribe();
      };
    } else {
      console.log("DIAG: Chat sessions listener not ready. Skipping. (db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule, ")");
    }
  }, [db, userId, isAuthReady, isFirebaseServicesReady, currentChatSessionId, firestoreModule, appId]);


  // Effect for fetching messages of the currently active chat session (reintroduced)
  useEffect(() => {
    console.log("DIAG: useEffect for chat messages listener triggered. db ready:", !!db, "userId ready:", !!userId, "currentChatSessionId:", !!currentChatSessionId, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule);
    if (db && userId && currentChatSessionId && isFirebaseServicesReady && firestoreModule) {
      const messagesCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`);
      const q = firestoreModule.query(messagesCollectionRef, firestoreModule.orderBy('timestamp', 'asc'));

      const unsubscribe = firestoreModule.onSnapshot(q, (snapshot: any) => {
        console.log("DIAG: onSnapshot for chat messages received data for session:", currentChatSessionId);
        const messages = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          sender: doc.data().sender,
          text: doc.data().text,
          timestamp: doc.data().timestamp,
          type: doc.data().type || 'text',
          audioUrl: doc.data().audioUrl || undefined
        })) as { id: string; sender: string; text: string; timestamp?: any; type?: string; audioUrl?: string }[];
        setChatMessages(messages);
      }, (error: any) => {
        console.error("DIAG: Error fetching messages for session", currentChatSessionId, ":", error);
        setCurrentAlert({ message: `Failed to load messages for chat session ${currentChatSessionId}: ${error.message || 'Unknown error'}.`, type: "error" });
      });

      return () => {
        console.log("DIAG: Cleaning up chat messages listener for session:", currentChatSessionId);
        unsubscribe();
      };
    } else {
      setChatMessages([]);
      console.log("DIAG: Chat messages cleared or listener skipped. (db:", !!db, "userId:", !!userId, "currentChatSessionId:", !!currentChatSessionId, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule, ")");
    }
  }, [db, userId, currentChatSessionId, isFirebaseServicesReady, firestoreModule, appId]);

  // Auto-scroll chat to bottom (reintroduced)
  useEffect(() => {
    if (chatMessagesEndRef.current) {
        chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeView, isChatHistoryMobileOpen]);


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
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeView === "dashboard"
                ? "bg-gray-800 text-purple-400"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
            href="#"
            onClick={() => { setActiveView("dashboard"); setSidebarOpen(false); }}
          >
            <Home className="h-5 w-5" />
            Dashboard
          </a>
          <a
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeView === "chat"
                ? "bg-gray-800 text-purple-400"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
            href="#"
            onClick={() => { setActiveView("chat"); setSidebarOpen(false); }}
          >
            <MessageCircle className="h-5 w-5" />
            Aura Chat
          </a>
          {/* Other navigation links (Analysis, Trade Log, Settings) are removed for this test */}
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

            {/* Dashboard View (from minimal version) */}
            {activeView === "dashboard" && (
              <div className="flex flex-col space-y-6">
                <h2 className="text-2xl font-bold text-white mb-6">Market Overview (Dashboard)</h2>
                <p className="text-gray-400">This is the dashboard view. The chat functionality is now integrated!</p>
              </div>
            )}

            {/* Chat View (reintroduced completely) */}
            {activeView === "chat" && (
              <div className="flex flex-col md:flex-row h-full bg-gray-900 rounded-lg shadow-xl overflow-hidden relative">
                {/* Chat Header - Grok-like */}
                <div className="flex items-center justify-between p-4 md:px-6 md:py-4 border-b border-gray-800 flex-shrink-0">
                  <button
                      className="md:hidden text-gray-400 hover:text-white"
                      onClick={() => {
                        if (currentChatSessionId) {
                            setCurrentChatSessionId(null);
                            setChatMessages([]);
                        }
                      }}
                  >
                      {currentChatSessionId ? <X className="h-6 w-6" /> : null}
                  </button>

                  <div className="flex-1 text-center font-semibold text-lg text-gray-300">
                    Aura Bot {currentChatSessionId ? `(${userId ? userId.substring(0, 8) : 'N/A'}...)` : ''}
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={handleNewConversation}
                      className="p-2 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-all duration-200"
                      title="New Chat"
                    >
                      <SquarePen className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setIsChatHistoryMobileOpen(true)}
                      className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center transition-all duration-200"
                      title="View History"
                    >
                      <History className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Main Chat Content Area */}
                {currentChatSessionId ? (
                  // Active Conversation View
                  <div className="flex-1 flex flex-col relative overflow-hidden">
                    {/* Messages Container (scrollable) */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar" style={{ paddingBottom: '88px' }}>
                      <div className="space-y-4">
                        {chatMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] p-3 rounded-xl ${
                                msg.sender === "user"
                                  ? "bg-purple-600 text-white"
                                  : "bg-gray-700 text-gray-200"
                              } break-words`}
                            >
                              <p>{msg.text}</p>
                              {msg.timestamp && typeof msg.timestamp.toDate === 'function' && (
                                  <p className="text-xs text-gray-400 mt-1 text-right">
                                      {msg.timestamp.toDate().toLocaleString()}
                                  </p>
                              )}
                            </div>
                          </div>
                        ))}
                        <div ref={chatMessagesEndRef} />
                      </div>
                    </div>

                    {/* Input area (fixed at bottom) */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gray-900 border-t border-gray-800 z-10">
                      <div className="relative flex items-center w-full bg-gray-800 rounded-lg border border-gray-700 pr-2">
                        <input
                          type="text"
                          placeholder="Ask anything"
                          className="flex-1 bg-transparent text-white rounded-lg px-4 py-3 focus:outline-none"
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === "Enter" && !isSendingMessage) {
                              handleSendMessage();
                            }
                          }}
                          disabled={isSendingMessage}
                        />
                        <button
                          className="p-2 text-white rounded-full bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 transition-all duration-200"
                          onClick={() => handleSendMessage()}
                          disabled={isSendingMessage}
                        >
                          {isSendingMessage ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <Send className="h-5 w-5" />
                          )}
                        </button>
                        <button
                          onClick={isVoiceRecording ? handleStopVoiceRecording : handleStartVoiceRecording}
                          className={`ml-2 p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 ${isVoiceRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                          title={isVoiceRecording ? "Stop Recording" : "Start Voice Recording"}
                          disabled={!currentChatSessionId}
                        >
                          {isVoiceRecording ? <Volume2 className="h-5 w-5 text-white animate-pulse" /> : <Mic className="h-5 w-5 text-white" />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Empty State (Grok-like initial screen)
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-4 pb-20">
                    <Bot className="h-24 w-24 text-purple-400 mb-4 animate-bounce-slow" />
                    <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-8">Aura AI</h2>
                    <p className="text-xl text-gray-400 mb-12">Your intelligent trading assistant.</p>

                    <div className="relative w-full max-w-xl mb-4">
                      <div className="relative flex items-center w-full bg-gray-800 rounded-lg border border-gray-700 pr-2">
                        <input
                          type="text"
                          placeholder="Ask anything"
                          className="flex-1 bg-transparent text-white rounded-lg px-4 py-3 focus:outline-none"
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === "Enter" && !isSendingMessage) {
                              if (messageInput.trim()) {
                                handleNewConversation().then(() => {
                                  handleSendMessage();
                                });
                              }
                            }
                          }}
                          disabled={isSendingMessage}
                        />
                        <button
                          className="p-2 text-white rounded-full bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 transition-all duration-200"
                          onClick={() => {
                            if (messageInput.trim()) {
                              handleNewConversation().then(() => {
                                handleSendMessage();
                              });
                            }
                          }}
                          disabled={isSendingMessage}
                        >
                          {isSendingMessage ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <Send className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex space-x-4 mt-4">
                      <button className="bg-gray-700 text-gray-300 px-6 py-2 rounded-full hover:bg-gray-600 transition-colors">
                        Create Images
                      </button>
                      <button className="bg-gray-700 text-gray-300 px-6 py-2 rounded-full hover:bg-gray-600 transition-colors">
                        Edit Image
                      </button>
                    </div>
                  </div>
                )}

                {/* Right Overlay Chat History Sidebar */}
                <div
                  className={`fixed inset-y-0 right-0 z-50 w-full md:w-80 flex-col bg-gray-900 border-l border-gray-800 transition-transform ease-out duration-300 ${
                    isChatHistoryMobileOpen ? "translate-x-0" : "translate-x-full"
                  } flex`}
                >
                  <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
                    <h3 className="text-xl font-extrabold text-indigo-400">History</h3>
                    <button onClick={() => setIsChatHistoryMobileOpen(false)} className="text-gray-400 hover:text-white">
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {chatSessions.length > 0 ? (
                      chatSessions.map((session) => (
                        <div
                          key={session.id}
                          onClick={() => handleSwitchConversation(session.id)}
                          className={`p-3 rounded-lg cursor-pointer transition duration-150 ease-in-out
                            ${session.id === currentChatSessionId ? 'bg-indigo-700 text-white shadow-lg' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`
                          }
                        >
                          <p className="font-semibold text-lg truncate">{session.name || 'Untitled Chat'}</p>
                          <p className="text-sm text-gray-400 truncate mt-1">
                            {session.lastMessageText || 'No messages yet...'}
                          </p>
                          {session.createdAt && typeof session.createdAt.toDate === 'function' && (
                            <p className="text-xs text-gray-500 mt-1">
                              {session.createdAt.toDate().toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-md text-center mt-4">No conversations yet.</p>
                    )}
                  </div>
                  <div className="p-4 border-t border-gray-800 flex-shrink-0">
                    <button
                      onClick={handleNewConversation}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200 ease-in-out transform hover:scale-105"
                    >
                      <Plus className="inline-block w-5 h-5 mr-2" /> Start New Chat
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Other views will be added back here */}
          </main>
        </div>
      </div>
    </div>
  )
}