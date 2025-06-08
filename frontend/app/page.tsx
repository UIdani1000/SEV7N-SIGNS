"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
// Import ALL necessary Lucide-React icons (added Card components, DollarSign, BarChart3, Settings, FileText for Analysis)
import {
  Home,
  MessageCircle,
  Menu,
  X,
  TrendingUp,
  Bell,
  Bot,
  User,
  Send,
  Plus,
  History,
  SquarePen,
  Mic,
  Volume2,
  TrendingDown,
  DollarSign,
  BarChart3,
  Play,
  Save,
  FileText, // Re-added for Trade Log / Journal
  Settings, // Re-added for Settings (next step)
  Trash2, // For deleting trade logs
  Edit2 // For editing trade logs
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


// Define interfaces for the expected API response structure
interface AISuggestion {
  entry_type: string;
  recommended_action: string;
  position_size: string;
}

interface PriceDetail {
  price: string;
  percentage_change: string;
}

interface AnalysisResult {
  confidence_score: string;
  signal_strength: string;
  market_summary: string;
  ai_suggestion: AISuggestion;
  stop_loss: PriceDetail;
  take_profit_1: PriceDetail;
  take_profit_2: PriceDetail;
  technical_indicators_analysis: string;
  next_step_for_user: string;
  ormcr_confirmation_status: string;
  ormcr_overall_bias: string;
  ormcr_reason: string;
}

// Market Data (for Dashboard and Analysis Live Price)
interface MarketData {
  price: number | string;
  percent_change: number | string;
  rsi: number | string;
  macd: number | string;
  stoch_k: number | string;
  volume: number | string;
  orscr_signal: string;
}

interface AllMarketPrices {
  [key: string]: MarketData;
}

// Interface for a chat session
interface ChatSession {
  id: string;
  name: string;
  createdAt: any;
  lastMessageText: string;
  lastMessageTimestamp?: any;
}

// Interfaces for Trade Log
interface TradeLogEntry {
  id: string;
  currencyPair: string;
  entryPrice: number;
  exitPrice: number;
  volume: number;
  profitOrLoss: number;
  timestamp: any;
  journalEntry?: string;
}

interface JournalEntry { // This interface is defined but not used directly, can be removed in a future cleanup if needed.
  tradeId: string;
  date: string;
  content: string;
}

// Custom Alert/Message component
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
export default function TradingDashboardWrapper() {
  return (
    <FirebaseProvider>
      <TradingDashboardContent />
    </FirebaseProvider>
  );
}


function TradingDashboardContent() {
  const { db, userId, isAuthReady, isFirebaseServicesReady, firestoreModule } = useFirebase();

  // --- STATE VARIABLES ---
  const [activeView, setActiveView] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentAlert, setCurrentAlert] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const [isChatHistoryMobileOpen, setIsChatHistoryMobileOpen] = useState(false);

  // Market Data states
  const [marketPrices, setMarketPrices] = useState<AllMarketPrices>({})
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [errorPrices, setErrorPrices] = useState<string | null>(null)
  const [currentLivePrice, setCurrentLivePrice] = useState<string>('N/A');

  // Chat states
  const [messageInput, setMessageInput] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const [chatMessages, setChatMessages] = useState<
    { id: string; sender: string; text: string; timestamp?: any }[]
  >([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  // FIX: mediaRecorderRef should be initialized with null
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [aiAssistantName] = useState("Aura");


  // Analysis Page Inputs and Results
  const [analysisCurrencyPair, setAnalysisCurrencyPair] = useState("BTC/USD")
  const [analysisTimeframes, setAnalysisTimeframes] = useState<string[]>([])
  const [analysisTradeType, setAnalysisTradeType] = useState("Scalp (Quick trades)")
  const [analysisIndicators, setAnalysisIndicators] = useState<string[]>([
    "RSI", "MACD", "Moving Averages", "Bollinger Bands", "Stochastic Oscillator", "Volume", "ATR", "Fibonacci Retracements"
  ])
  const [analysisBalance, setAnalysisBalance] = useState("10000")
  const [analysisLeverage, setAnalysisLeverage] = useState("1x (No Leverage)")
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const availableTimeframes = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"]
  const availableIndicators = [
    { name: "RSI", desc: "Relative Sth Index" },
    { name: "Stochastic Oscillator", desc: "Momentum oscillator" },
    { name: "MACD", desc: "Moving Average Convergence" },
    { name: "Moving Averages", desc: "SMA/EMA trends" },
    { name: "Bollinger Bands", desc: "Volatility bands" },
    { name: "Volume", desc: "Trading volume analysis" },
    { name: "ATR", desc: "Average True Range" },
    { name: "Fibonacci Retracements", desc: "Key structural levels" },
  ]

  // Trade Log states
  const [tradeLogs, setTradeLogs] = useState<TradeLogEntry[]>([])
  const [loadingTradeLogs, setLoadingTradeLogs] = useState(true)
  const [tradeLogForm, setTradeLogForm] = useState({
    currencyPair: "BTC/USD",
    entryPrice: "",
    exitPrice: "",
    volume: "",
    profitOrLoss: "",
  })
  const [isAddingTrade, setIsAddingTrade] = useState(false)
  const [journalEntry, setJournalEntry] = useState("")
  const [selectedTradeForJournal, setSelectedTradeForJournal] = useState<string | null>(null)
  const [isSavingJournal, setIsSavingJournal] = useState(false)
  const [tradeLogError, setTradeLogError] = useState<string | null>(null);


  // --- HANDLERS ---

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
        text: `Hello! I&apos;m ${aiAssistantName}, your AI trading assistant. How can I help you today?`,
        timestamp: firestoreModule.serverTimestamp()
      };
      await firestoreModule.addDoc(messagesCollectionRef, initialGreeting);
      console.log("DIAG: Initial greeting added to new chat session.");

    } catch (error: any) {
      console.error("DIAG: Error creating new conversation:", error);
      setCurrentAlert({ message: `Failed to start new conversation: ${error.message}`, type: "error" });
    }
  }, [db, userId, aiAssistantName, isAuthReady, isFirebaseServicesReady, firestoreModule]); // Removed appId from dependency array

  const handleSwitchConversation = (sessionId: string) => {
    setCurrentChatSessionId(sessionId);
    setIsChatHistoryMobileOpen(false);
    setMessageInput('');
    setCurrentAlert({ message: "Switched to selected conversation.", type: "info" });
    console.log("DIAG: Switched to conversation ID:", sessionId);
  };


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
  }, [db, userId, currentChatSessionId, firestoreModule, setChatMessages]); // Removed appId from dependency array


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
    setMessageInput("");

    try {
      const userMessage = { id: crypto.randomUUID(), sender: "user", text: messageContent, timestamp: firestoreModule.serverTimestamp(), type: messageType };
      console.log("DIAG: User message prepared:", userMessage);

      console.log("DIAG: Adding user message to Firestore for session:", currentChatSessionId);
      const messagesCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`);
      await firestoreModule.addDoc(messagesCollectionRef, userMessage);
      console.log("DIAG: User message added to Firestore.");

      const sessionDocRef = firestoreModule.doc(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}`);
      await firestoreModule.setDoc(sessionDocRef, {
        lastMessageText: userMessage.text,
        lastMessageTimestamp: userMessage.timestamp,
        name: chatMessages.length === 0 ? userMessage.text.substring(0, 30) + (userMessage.text.length > 30 ? '&hellip;' : '') : (chatSessions.find((s: ChatSession) => s.id === currentChatSessionId)?.name || "Untitled Chat"),
      }, { merge: true });

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
  }, [messageInput, db, userId, currentChatSessionId, isAuthReady, isFirebaseServicesReady, firestoreModule, chatMessages, chatSessions, fetchBackendChatResponse]); // Removed appId from dependency array

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
      // Ensure mediaRecorderRef.current is assigned a new MediaRecorder instance
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

  const handleRunAnalysis = async () => {
    if (!analysisCurrencyPair || analysisTimeframes.length === 0 || !analysisBalance || !analysisLeverage) {
      setCurrentAlert({ message: "Please select a Currency Pair, at least one Timeframe, Available Balance, and Leverage.", type: "warning" });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResults(null);

    const analysisInput = {
      currencyPair: analysisCurrencyPair,
      timeframes: analysisTimeframes,
      tradeType: analysisTradeType,
      indicators: analysisIndicators,
      availableBalance: parseFloat(analysisBalance),
      leverage: analysisLeverage.includes('x (No Leverage)') ? 1 : parseFloat(analysisLeverage.replace('x', '')),
    };
    console.log("DIAG: Running analysis with input:", analysisInput, "to backend:", BACKEND_BASE_URL + "/run_ormcr_analysis");

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/run_ormcr_analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...analysisInput, userId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: response.statusText}));
        throw new Error(`Backend error! Status: ${response.status}. Message: ${errorData.error || "Unknown response"}`);
      }

      const data: AnalysisResult = await response.json();
      setAnalysisResults(data);
      setCurrentAlert({ message: "ORSCR Analysis completed!", type: "success" });
      console.log("DIAG: Analysis results received:", data);

    } catch (error: any) {
      console.error("DIAG: Error running ORMCR analysis:", error);
      setAnalysisError(error.message || "Failed to run analysis.");
      setCurrentAlert({ message: `Analysis failed: ${error.message || "Unknown error"}. Check backend deployment.`, type: "error" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleIndicatorChange = (indicatorName: string) => {
    setAnalysisIndicators(prev =>
      prev.includes(indicatorName)
        ? prev.filter(name => name !== indicatorName)
        : [...prev, indicatorName]
    );
  };

  const handleTimeframeButtonClick = (tf: string) => {
    setAnalysisTimeframes(prev => {
      const newTimeframes = prev.includes(tf)
        ? prev.filter(selectedTf => selectedTf !== tf)
        : [...prev, tf];
      const order = ['D1', 'H4', 'H1', 'M30', 'M15', 'M5', 'M1'];
      return newTimeframes.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    });
  };

  const handleChatAboutAnalysis = () => {
    if (analysisResults && analysisResults.market_summary) {
      const analysisSummary = analysisResults.market_summary;
      setMessageInput(`Regarding the recent analysis for ${analysisCurrencyPair}:\n\n${analysisSummary}\n\nWhat do you think about this?`);
      setActiveView("chat");
    } else {
      setCurrentAlert({ message: "No analysis results to chat about.", type: "warning" });
    }
  };

  // Trade Log Handlers
  const handleAddTradeLog = async () => {
    if (!tradeLogForm.currencyPair || !tradeLogForm.entryPrice || !tradeLogForm.exitPrice || !tradeLogForm.volume) {
      setCurrentAlert({ message: "Please fill in all trade log fields.", type: "warning" });
      return;
    }
    if (!db || !userId || !isAuthReady || !isFirebaseServicesReady || !firestoreModule) {
      setCurrentAlert({ message: "Firebase not ready. Cannot add trade log.", type: "warning" });
      console.warn("DIAG: Attempted to add trade log, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule);
      return;
    }

    setIsAddingTrade(true);
    setTradeLogError(null);

    try {
      const entryPriceNum = parseFloat(tradeLogForm.entryPrice);
      const exitPriceNum = parseFloat(tradeLogForm.exitPrice);
      const volumeNum = parseFloat(tradeLogForm.volume);

      if (isNaN(entryPriceNum) || isNaN(exitPriceNum) || isNaN(volumeNum)) {
          throw new Error("Invalid number format for price or volume.");
      }

      const profitOrLoss = (exitPriceNum - entryPriceNum) * volumeNum;

      const tradeLogEntry = {
        currencyPair: tradeLogForm.currencyPair,
        entryPrice: entryPriceNum,
        exitPrice: exitPriceNum,
        volume: volumeNum,
        profitOrLoss: parseFloat(profitOrLoss.toFixed(2)),
        timestamp: firestoreModule.serverTimestamp(),
      };

      const tradeLogsCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/tradeLogs`);
      await firestoreModule.addDoc(tradeLogsCollectionRef, tradeLogEntry);

      setCurrentAlert({ message: "Trade log added successfully!", type: "success" });
      setTradeLogForm({
        currencyPair: "BTC/USD",
        entryPrice: "",
        exitPrice: "",
        volume: "",
        profitOrLoss: "",
      });
      console.log("DIAG: Trade log added:", tradeLogEntry);
    } catch (error: any) {
      console.error("DIAG: Error adding trade log:", error);
      setTradeLogError(error.message || "Failed to add trade log.");
      setCurrentAlert({ message: `Failed to add trade log: ${error.message}`, type: "error" });
    } finally {
      setIsAddingTrade(false);
    }
  };

  const handleSaveJournalEntry = async () => {
    if (!selectedTradeForJournal || !journalEntry.trim()) {
      setCurrentAlert({ message: "Please select a trade and write a journal entry.", type: "warning" });
      return;
    }
    if (!db || !userId || !isAuthReady || !isFirebaseServicesReady || !firestoreModule) {
      setCurrentAlert({ message: "Firebase not ready. Cannot save journal entry.", type: "warning" });
      console.warn("DIAG: Attempted to save journal, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule);
      return;
    }

    setIsSavingJournal(true);
    setTradeLogError(null);

    try {
      const tradeDocRef = firestoreModule.doc(db, `artifacts/${appId}/users/${userId}/tradeLogs`, selectedTradeForJournal);
      await firestoreModule.updateDoc(tradeDocRef, {
        journalEntry: journalEntry,
      });

      setCurrentAlert({ message: "Journal entry saved successfully!", type: "success" });
      setJournalEntry("");
      setSelectedTradeForJournal(null);
      console.log("DIAG: Journal entry saved for trade:", selectedTradeForJournal);
    } catch (error: any) {
      console.error("DIAG: Error saving journal entry:", error);
      setTradeLogError(error.message || "Failed to save journal entry.");
      setCurrentAlert({ message: `Failed to save journal entry: ${error.message}`, type: "error" });
    } finally {
      setIsSavingJournal(false);
    }
  };

  const handleDeleteTradeLog = async (tradeId: string) => {
    if (!db || !userId || !isAuthReady || !isFirebaseServicesReady || !firestoreModule) {
      setCurrentAlert({ message: "Firebase not ready. Cannot delete trade log.", type: "warning" });
      console.warn("DIAG: Attempted to delete trade log, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule);
      return;
    }

    setTradeLogError(null);
    // IMPORTANT: Replace window.confirm with a custom modal for production apps.
    // For this debug session, it's left as is for simplicity, but in Canvas/Production,
    // this would be replaced with a proper UI component.
    if (window.confirm("Are you sure you want to delete this trade log?")) {
      try {
        const tradeDocRef = firestoreModule.doc(db, `artifacts/${appId}/users/${userId}/tradeLogs`, tradeId);
        await firestoreModule.deleteDoc(tradeDocRef);
        setCurrentAlert({ message: "Trade log deleted successfully!", type: "success" });
        console.log("DIAG: Trade log deleted:", tradeId);
      } catch (error: any) {
        console.error("DIAG: Error deleting trade log:", error);
        setTradeLogError(error.message || "Failed to delete trade log.");
        setCurrentAlert({ message: `Failed to delete trade log: ${error.message}`, type: "error" });
      }
    }
  };


  // --- USE EFFECTS ---

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
  }, [db, userId, isAuthReady, isFirebaseServicesReady, currentChatSessionId, firestoreModule]); // Removed appId from dependency array


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
        console.log("DIAG: Cleaning up chat messages listener.");
        unsubscribe();
      };
    } else {
      setChatMessages([]);
      console.log("DIAG: Chat messages cleared or listener skipped. (db:", !!db, "userId:", !!userId, "currentChatSessionId:", !!currentChatSessionId, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule, ")");
    }
  }, [db, userId, currentChatSessionId, isFirebaseServicesReady, firestoreModule]); // Removed appId from dependency array

  useEffect(() => {
    if (chatMessagesEndRef.current) {
        chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeView, isChatHistoryMobileOpen]);


  const fetchMarketPricesData = useCallback(async (initialLoad = false) => {
    console.log("DIAG: Fetching market prices from:", BACKEND_BASE_URL + "/all_market_prices");
    try {
      if (initialLoad) {
        setLoadingPrices(true);
      }
      setErrorPrices(null);
      const response = await fetch(`${BACKEND_BASE_URL}/all_market_prices`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status}. Response: ${errorText}`);
      }
      const data: AllMarketPrices = await response.json();
      setMarketPrices(data);
      console.log("DIAG: Market prices fetched successfully.", data);
    } catch (error: any) {
      console.error("DIAG: Error fetching market prices:", error);
      setErrorPrices(error.message || "Failed to fetch market prices.");
    } finally {
      if (initialLoad) {
        setLoadingPrices(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchMarketPricesData(true);

    const intervalId = setInterval(() => fetchMarketPricesData(false), 10000);
    return () => clearInterval(intervalId);
  }, [fetchMarketPricesData]);

  const fetchAnalysisLivePrice = useCallback(async (pair: string) => {
    console.log("DIAG: Fetching analysis live price for:", pair, "from:", BACKEND_BASE_URL + "/all_market_prices");
    try {
      const backendSymbol = pair.replace('/', '') + 'T';
      const response = await fetch(`${BACKEND_BASE_URL}/all_market_prices`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status}. Response: ${errorText}`);
      }
      const data: AllMarketPrices = await response.json();
      if (data[backendSymbol] && typeof data[backendSymbol].price === 'number') {
        setCurrentLivePrice(data[backendSymbol].price.toLocaleString());
        console.log("DIAG: Analysis live price fetched:", data[backendSymbol].price);
      } else {
        setCurrentLivePrice('N/A');
        console.warn("DIAG: Analysis live price not found for", backendSymbol, data);
      }
    } catch (e: any) {
      console.error("DIAG: Error fetching live price for analysis page:", e);
      setCurrentLivePrice('Error');
    }
  }, []);

  useEffect(() => {
    if (activeView === 'analysis') {
      fetchAnalysisLivePrice(analysisCurrencyPair);
      const intervalId = setInterval(() => fetchAnalysisLivePrice(analysisCurrencyPair), 10000);
      return () => clearInterval(intervalId);
    }
  }, [activeView, analysisCurrencyPair, fetchAnalysisLivePrice]);


  // Effect for fetching Trade Logs
  useEffect(() => {
    console.log("DIAG: useEffect for trade logs listener triggered. db ready:", !!db, "userId ready:", !!userId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule);
    if (db && userId && isAuthReady && isFirebaseServicesReady && firestoreModule) {
      setLoadingTradeLogs(true);
      const tradeLogsCollectionRef = firestoreModule.collection(db, `artifacts/${appId}/users/${userId}/tradeLogs`);
      const q = firestoreModule.query(tradeLogsCollectionRef, firestoreModule.orderBy('timestamp', 'desc'));

      const unsubscribe = firestoreModule.onSnapshot(q, (snapshot: any) => {
        console.log("DIAG: onSnapshot for trade logs received data.");
        const logs = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          currencyPair: doc.data().currencyPair,
          entryPrice: doc.data().entryPrice,
          exitPrice: doc.data().exitPrice,
          volume: doc.data().volume,
          profitOrLoss: doc.data().profitOrLoss,
          timestamp: doc.data().timestamp,
          journalEntry: doc.data().journalEntry || '',
        })) as TradeLogEntry[];
        setTradeLogs(logs);
        setLoadingTradeLogs(false);
      }, (error: any) => {
        console.error("DIAG: Error fetching trade logs:", error);
        setTradeLogError(error.message || "Failed to load trade logs.");
        setCurrentAlert({ message: `Failed to load trade logs: ${error.message || 'Unknown error'}`, type: "error" });
        setLoadingTradeLogs(false);
      });

      return () => {
        console.log("DIAG: Cleaning up trade logs listener.");
        unsubscribe();
      };
    } else {
      setTradeLogs([]);
      setLoadingTradeLogs(false);
      console.log("DIAG: Trade logs listener not ready. Skipping. (db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady, "isFirebaseServicesReady:", isFirebaseServicesReady, "firestoreModule:", !!firestoreModule, ")");
    }
  }, [db, userId, isAuthReady, isFirebaseServicesReady, firestoreModule]); // Removed appId from dependency array


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
          <a
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeView === "analysis"
                ? "bg-gray-800 text-purple-400"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
            href="#"
            onClick={() => { setActiveView("analysis"); setSidebarOpen(false); }}
          >
            <BarChart3 className="h-5 w-5" />
            Analysis
          </a>
          <a
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeView === "trade-log"
                ? "bg-gray-800 text-purple-400"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
            href="#"
            onClick={() => { setActiveView("trade-log"); setSidebarOpen(false); }}
          >
            <FileText className="h-5 w-5" />
            Trade Log
          </a>
          <a
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeView === "settings"
                ? "bg-gray-800 text-purple-400"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
            href="#"
            onClick={() => { setActiveView("settings"); setSidebarOpen(false); }}
          >
            <Settings className="h-5 w-5" />
            Settings
          </a>
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

            {/* Dashboard View (Market Overview) */}
            {activeView === "dashboard" && (
              <div className="flex flex-col space-y-6">
                <h2 className="text-2xl font-bold text-white mb-6">Market Overview</h2>
                {loadingPrices && <p>Loading market prices...</p>}
                {errorPrices && <p className="text-red-500">Error: {errorPrices}</p>}
                {!loadingPrices && !errorPrices && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(marketPrices).map(([pair, data]) => (
                      <div key={pair} className="bg-gray-800/50 rounded-lg p-4 shadow-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-gray-300">{pair}</h3>
                          {typeof data.percent_change === 'number' && data.percent_change >= 0 ? (
                            <TrendingUp className="w-5 h-5 text-green-400" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-red-400" />
                          )}
                        </div>
                        <div className="text-3xl font-bold text-white mb-1">
                          ${typeof data.price === 'number' ? data.price.toFixed(2) : 'N/A'}
                        </div>
                        <div className={`text-sm ${typeof data.percent_change === 'number' && data.percent_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {typeof data.percent_change === 'number' ? data.percent_change.toFixed(2) : 'N/A'}%
                          <span className="text-gray-400 ml-1">Today</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-2">
                          RSI: {typeof data.rsi === 'number' ? data.rsi.toFixed(2) : "N/A"} | MACD: {typeof data.macd === 'number' ? data.macd.toFixed(2) : "N/A"}
                        </div>
                        <div className={`text-sm font-semibold mt-1 ${
                            data.orscr_signal === "BUY" ? 'text-green-500' :
                            data.orscr_signal === "SELL" ? 'text-red-500' : 'text-yellow-500'
                        }`}>
                            Signal: {data.orscr_signal || 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Dashboard Trading Performance & Market Selection placeholders */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg border border-gray-700">
                    <h3 className="text-xl font-semibold mb-4">Trading Performance (Placeholder)</h3>
                    <p className="text-gray-400">Content for trading performance will go here.</p>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg border border-gray-700">
                    <h3 className="text-xl font-semibold mb-4">Recent Alerts (Placeholder)</h3>
                    <p className="text-gray-400">Content for recent alerts will go here.</p>
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg border border-gray-700">
                  <h3 className="text-xl font-semibold mb-4">MARKET SELECTION (Placeholder)</h3>
                  <p className="text-gray-400">Content for market selection will go here.</p>
                </div>
              </div>
            )}

            {/* Chat View */}
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
                    Aura Bot {userId ? `(${userId.substring(0, 8)}...)` : ''}
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

            {/* Analysis View */}
            {activeView === "analysis" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-gray-800/40 rounded-xl shadow-lg border border-purple-500/30 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-purple-300">MARKET SELECTION</h3>
                      <BarChart3 className="w-5 h-5 text-purple-400" />
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Currency Pair</label>
                        <select
                          className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md px-4 py-2"
                          value={analysisCurrencyPair}
                          onChange={(e) => setAnalysisCurrencyPair(e.target.value)}
                        >
                          <option>BTC/USD</option>
                          <option>ETH/USD</option>
                          <option>ADA/USD</option>
                          <option>SOL/USD</option>
                          <option>DOGE/USD</option>
                          <option>XRP/USD</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Timeframe</label>
                        <div className="grid grid-cols-3 gap-2">
                          {availableTimeframes.map(tf => (
                            <button
                              key={tf}
                              onClick={() => handleTimeframeButtonClick(tf)}
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors
                                ${analysisTimeframes.includes(tf)
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-800/50 border border-gray-600 text-gray-300 hover:bg-gray-700/50'
                                }`}
                            >
                              {tf}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Trade Type</label>
                        <select
                          className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md px-4 py-2"
                          value={analysisTradeType}
                          onChange={(e) => setAnalysisTradeType(e.target.value)}
                        >
                          <option>Scalp (Quick trades)</option>
                          <option>Day Trade (Intraday)</option>
                          <option>Long Hold (Position)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800/40 rounded-xl shadow-lg border border-blue-500/30 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-blue-300">TECHNICAL INDICATORS</h3>
                      <TrendingUp className="w-5 h-5 text-blue-400" />
                    </div>

                    <div className="space-y-3">
                      {availableIndicators.map((indicator) => (
                        <div
                          key={indicator.name}
                          className="flex items-center justify-between p-2 hover:bg-gray-700/30 rounded"
                        >
                          <div>
                            <div className="font-medium text-sm">{indicator.name}</div>
                            <div className="text-xs text-gray-400">{indicator.desc}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={analysisIndicators.includes(indicator.name)}
                            onChange={() => handleIndicatorChange(indicator.name)}
                            className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-800/40 rounded-xl shadow-lg border border-emerald-500/30 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-emerald-300">TRADING PARAMETERS</h3>
                      <DollarSign className="w-5 h-5 text-emerald-400" />
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Available Balance</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md px-4 py-2"
                          placeholder="10000.00"
                          value={analysisBalance}
                          onChange={(e) => setAnalysisBalance(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Leverage</label>
                        <select
                          className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md px-4 py-2"
                          value={analysisLeverage}
                          onChange={(e) => setAnalysisLeverage(e.target.value)}
                        >
                          <option>1x (No Leverage)</option>
                          <option>1x5 (5x Leverage)</option>
                          <option>1x10 (10x Leverage)</option>
                          <option>1x25 (25x Leverage)</option>
                          <option>1x50 (50x Leverage)</option>
                          <option>1x100 (100x Leverage)</option>
                          <option>1x200 (200x Leverage)</option>
                        </select>
                      </div>

                      <button
                        onClick={handleRunAnalysis}
                        disabled={isAnalyzing}
                        className="w-full inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200 disabled:opacity-50"
                      >
                        {isAnalyzing ? (
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <Play className="w-4 h-4 mr-2" />
                        )}
                        {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
                      </button>
                      {analysisError && <p className="text-red-500 text-sm mt-2">{analysisError}</p>}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-gray-800/40 rounded-xl shadow-lg border border-cyan-500/30 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-cyan-300">LIVE MARKET DATA</h3>
                      <div className="flex items-center text-emerald-400">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse mr-2"></div>
                        <span className="text-sm">Connected</span>
                      </div>
                    </div>

                    {loadingPrices && <p>Loading live market data...</p>}
                    {errorPrices && <p className="text-red-500">Error loading live data.</p>}
                    {!loadingPrices && !errorPrices ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-gray-700/30 rounded-lg">
                          <div className="text-sm text-gray-400">Current Price</div>
                          <div className="text-lg font-bold text-white">
                            ${currentLivePrice}
                          </div>
                        </div>
                        <div className="text-center p-3 bg-gray-700/30 rounded-lg">
                          <div className="text-sm text-gray-400">24h Change</div>
                          {(() => {
                              const percentChange = marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.percent_change;
                              const isNumber = typeof percentChange === 'number';
                              const textColor = isNumber && percentChange >= 0 ? 'text-emerald-400' : 'text-red-400';
                              return (
                                  <div className={`text-lg font-bold ${textColor}`}>
                                      {isNumber ? `${percentChange.toFixed(2)}%` : 'N/A'}
                                  </div>
                              );
                          })()}
                        </div>
                        <div className="text-center p-3 bg-gray-700/30 rounded-lg">
                          <div className="text-sm text-gray-400">Volume</div>
                          {(() => {
                            const volume = marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.volume;
                            const isVolumeNumber = typeof volume === 'number';
                            return (
                                <div className="text-lg font-bold text-blue-400">
                                    {isVolumeNumber ? volume.toFixed(2) : 'N/A'}
                                </div>
                            );
                          })()}
                        </div>
                        <div className="text-center p-3 bg-gray-700/30 rounded-lg">
                          <div className="text-sm text-gray-400">Signal</div>
                          <div className={`text-lg font-bold ${
                              marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.orscr_signal === "BUY" ? 'text-green-500' :
                              marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.orscr_signal === "SELL" ? 'text-red-500' : 'text-yellow-500'
                          }`}>
                              {marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.orscr_signal || 'N/A'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-400">Select a currency pair to see live data.</p>
                    )}
                  </div>

                  <div className="bg-gray-800/40 rounded-xl shadow-lg border border-emerald-500/30 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-emerald-300">AI ANALYSIS RESULTS</h3>
                      <div className="flex items-center text-purple-400">
                        <Bot className="w-5 h-5 mr-2" />
                        <span className="text-sm">Powered by Gemini AI</span>
                      </div>
                    </div>

                    {isAnalyzing && (
                      <div className="text-center p-10 text-gray-500">
                        <div className="flex items-center justify-center mt-4">
                          <svg className="animate-spin h-5 w-5 text-purple-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <p className="mt-2 text-indigo-400">Analyzing...</p>
                        </div>
                      </div>
                    )}

                    {!isAnalyzing && analysisResults ? (
                      <div className="space-y-6">
                        <div className="text-center p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                          <div className="text-sm text-emerald-300 mb-2">CONFIDENCE SCORE</div>
                          <div className="text-4xl font-bold text-emerald-400 mb-2">{analysisResults.confidence_score}</div>
                          <div className="text-sm text-emerald-300">{analysisResults.signal_strength}</div>
                        </div>

                        <div className="p-4 bg-gray-700/30 rounded-lg">
                          <h4 className="font-semibold text-white mb-3 flex items-center">
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Market Summary
                          </h4>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            {analysisResults.market_summary}
                          </p>
                        </div>

                        <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                          <h4 className="font-semibold text-blue-300 mb-3 flex items-center">
                            <TrendingUp className="w-4 h-4 mr-2" />
                            AI Suggestion
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-300">Entry Type:</span>
                              <span className="font-bold text-emerald-400">{analysisResults.ai_suggestion.entry_type}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-300">Recommended Action:</span>
                              <span className="font-bold text-emerald-400">{analysisResults.ai_suggestion.recommended_action}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-300">Position Size:</span>
                                <span className="font-bold text-white">{analysisResults.ai_suggestion.position_size}</span>
                            </div>
                          </div>
                        </div>

                        {analysisResults.ormcr_confirmation_status === "STRONG CONFIRMATION" && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-center">
                              <div className="text-sm text-red-300 mb-1">Stop Loss</div>
                              <div className="text-xl font-bold text-red-400">{analysisResults.stop_loss.price}</div>
                              <div className="text-xs text-red-300">{analysisResults.stop_loss.percentage_change}</div>
                            </div>
                            <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-center">
                              <div className="text-sm text-emerald-300 mb-1">Take Profit 1</div>
                              <div className="text-xl font-bold text-emerald-400">{analysisResults.take_profit_1.price}</div>
                              <div className="text-xs text-emerald-300">{analysisResults.take_profit_1.percentage_change}</div>
                            </div>
                            <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-center">
                              <div className="text-sm text-emerald-300 mb-1">Take Profit 2</div>
                              <div className="text-xl font-bold text-emerald-400">{analysisResults.take_profit_2.price}</div>
                              <div className="text-xs text-emerald-300">{analysisResults.take_profit_2.percentage_change}</div>
                            </div>
                          </div>
                        )}

                        <div className="p-4 bg-gray-700/30 rounded-lg">
                          <h4 className="font-semibold text-white mb-3">Technical Indicators Analysis</h4>
                          {analysisResults.technical_indicators_analysis && (
                            <div className="mt-2 text-sm text-gray-300">
                              {analysisResults.technical_indicators_analysis}
                            </div>
                          )}
                        </div>

                        <div className="p-4 bg-gray-700/30 rounded-lg">
                          <h4 className="font-semibold text-white mb-3">Next Step for User</h4>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            {analysisResults.next_step_for_user}
                          </p>
                        </div>

                        <div className="flex gap-4">
                          <button
                            onClick={handleChatAboutAnalysis}
                            className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200"
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Chat About This Analysis
                          </button>
                          <button className="inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all duration-200">
                            <Save className="w-4 h-4 mr-2" />
                            Save Analysis
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-10 text-gray-500">
                        <p>Run an AI analysis to see detailed results here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Trade Log View */}
            {activeView === "trade-log" && (
              <div className="flex flex-col space-y-6">
                <h2 className="text-2xl font-bold text-white mb-6">Trade Log & Journal</h2>

                {/* Add New Trade Form */}
                <div className="bg-gray-800/40 rounded-xl shadow-lg border border-purple-500/30 p-6">
                  <h3 className="text-lg font-semibold text-purple-300 mb-4">Add New Trade</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Currency Pair</label>
                      <select
                        className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md px-4 py-2"
                        value={tradeLogForm.currencyPair}
                        onChange={(e) => setTradeLogForm({ ...tradeLogForm, currencyPair: e.target.value })}
                      >
                        <option>BTC/USD</option>
                        <option>ETH/USD</option>
                        <option>ADA/USD</option>
                        <option>SOL/USD</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Entry Price</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md px-4 py-2"
                        placeholder="e.g., 29500.00"
                        value={tradeLogForm.entryPrice}
                        onChange={(e) => setTradeLogForm({ ...tradeLogForm, entryPrice: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Exit Price</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md px-4 py-2"
                        placeholder="e.g., 29750.00"
                        value={tradeLogForm.exitPrice}
                        onChange={(e) => setTradeLogForm({ ...tradeLogForm, exitPrice: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Volume (Units)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md px-4 py-2"
                        placeholder="e.g., 0.1"
                        value={tradeLogForm.volume}
                        onChange={(e) => setTradeLogForm({ ...tradeLogForm, volume: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddTradeLog}
                    disabled={isAddingTrade}
                    className="mt-6 w-full inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200 disabled:opacity-50"
                  >
                    {isAddingTrade ? (
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {isAddingTrade ? "Adding Trade..." : "Add Trade"}
                  </button>
                  {tradeLogError && <p className="text-red-500 text-sm mt-2">{tradeLogError}</p>}
                </div>

                {/* Trade Log Table */}
                <div className="bg-gray-800/40 rounded-xl shadow-lg border border-cyan-500/30 p-6">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-4">Your Trades</h3>
                  {loadingTradeLogs && <p className="text-gray-400">Loading trade history...</p>}
                  {!loadingTradeLogs && tradeLogs.length === 0 && (
                    <p className="text-gray-400">No trades logged yet. Add your first trade above!</p>
                  )}
                  {!loadingTradeLogs && tradeLogs.length > 0 && (
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="min-w-full divide-y divide-gray-700">
                        <thead>
                          <tr>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Date</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Pair</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Entry</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Exit</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Volume</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">P/L</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Journal</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {tradeLogs.map((trade) => (
                            <tr key={trade.id} className="hover:bg-gray-700/50 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                {trade.timestamp && typeof trade.timestamp.toDate === 'function' ? trade.timestamp.toDate().toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{trade.currencyPair}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{trade.entryPrice.toFixed(2)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{trade.exitPrice.toFixed(2)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{trade.volume.toFixed(2)}</td>
                              <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold ${trade.profitOrLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {trade.profitOrLoss.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate cursor-pointer"
                                  title={trade.journalEntry || "No journal entry. Click to add/edit."}
                                  onClick={() => {
                                    setSelectedTradeForJournal(trade.id);
                                    setJournalEntry(trade.journalEntry || '');
                                  }}>
                                {trade.journalEntry ? trade.journalEntry : "Add Entry"}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => {
                                    setSelectedTradeForJournal(trade.id);
                                    setJournalEntry(trade.journalEntry || '');
                                  }}
                                  className="text-indigo-400 hover:text-indigo-500 mr-3"
                                  title="Edit Journal"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTradeLog(trade.id)}
                                  className="text-red-400 hover:text-red-500"
                                  title="Delete Trade"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Journal Entry Editor */}
                {selectedTradeForJournal && (
                  <div className="bg-gray-800/40 rounded-xl shadow-lg border border-emerald-500/30 p-6">
                    <h3 className="text-lg font-semibold text-emerald-300 mb-4">Journal Entry for Trade ID: {selectedTradeForJournal.substring(0, 8)}...</h3>
                    <textarea
                      className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-md p-4 h-32 resize-y focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="Write your thoughts, strategies, and lessons learned from this trade..."
                      value={journalEntry}
                      onChange={(e) => setJournalEntry(e.target.value)}
                    ></textarea>
                    <div className="flex justify-end space-x-3 mt-4">
                      <button
                        onClick={() => {
                          setJournalEntry("");
                          setSelectedTradeForJournal(null);
                        }}
                        className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveJournalEntry}
                        disabled={isSavingJournal}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {isSavingJournal ? "Saving..." : "Save Journal Entry"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Settings View (placeholder for now) */}
            {activeView === "settings" && (
              <div className="flex flex-col space-y-6">
                <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
                <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg border border-gray-700">
                  <h3 className="text-xl font-semibold mb-4">API Configuration (Placeholder)</h3>
                  <p className="text-gray-400">Settings for API keys, backend URL, etc. will go here.</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg border border-gray-700">
                  <h3 className="text-xl font-semibold mb-4">User Preferences (Placeholder)</h3>
                  <p className="text-gray-400">Theme, notifications, and other user preferences will go here.</p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}