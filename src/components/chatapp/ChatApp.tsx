import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Upload, MessageCircle, Send, Bot, User, Sparkles,
  FileText, Trash2, Plus, Check, ChevronLeft, ChevronRight,
  Menu, AlertCircle, Loader2
} from "lucide-react";

// Type definitions
interface Message {
  role: "user" | "bot";
  content: string;
  timestamp: Date;
}

interface Document {
  id: string;
  name: string;
  size: number;
  uploaded: boolean;
  progress: number;
  selected: boolean;
  sessionId?: string;
  error?: string;
}

// Use Vite environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [apiError, setApiError] = useState("");
  const [backendStatus, setBackendStatus] = useState<"unknown" | "healthy" | "unhealthy">("unknown");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        setBackendStatus(res.ok ? "healthy" : "unhealthy");
      } catch {
        setBackendStatus("unhealthy");
      }
    };
    checkHealth();
  }, []);

  const sendMessage = async () => {
    const selected = documents.find(d => d.selected && d.uploaded);
    if (!input.trim() || !selected) return;
    
    const userMsg: Message = { role: "user", content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setApiError("");

    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          session_id: selected.sessionId,
          question: input 
        })
      });
      
      if (!res.ok) {
        let error = `API error: ${res.status}`;
        try {
          const data = await res.json();
          error = data.error || error;
        } catch {}
        throw new Error(error);
      }
      
      const data = await res.json();
      setMessages(prev => [...prev, { 
        role: "bot", 
        content: data.answer || "No response received", 
        timestamp: new Date() 
      }]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setApiError(errorMessage);
      setMessages(prev => [...prev, { 
        role: "bot", 
        content: "Error processing request. Please try again.", 
        timestamp: new Date() 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    
    setApiError("");
    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf') {
        setApiError('PDF files only');
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setApiError(`${file.name} too large (max 10MB)`);
        continue;
      }

      const id = Math.random().toString(36).substring(2, 11);
      const doc: Document = { id, name: file.name, size: file.size, uploaded: false, progress: 0, selected: false };
      setDocuments(prev => [...prev, doc]);
      
      try {
        // Create session
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, progress: 30 } : d));
        const sessionRes = await fetch(`${API_BASE_URL}/create-session`, {
          method: 'POST'
        });
        
        if (!sessionRes.ok) throw new Error('Session creation failed');
        const { session_id } = await sessionRes.json();
        
        // Upload PDF
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, progress: 60, sessionId: session_id } : d));
        
        const formData = new FormData();
        formData.append('session_id', session_id);
        formData.append('pdf', file);
        
        const uploadRes = await fetch(`${API_BASE_URL}/upload-pdf`, {
          method: 'POST',
          body: formData
        });
        
        if (!uploadRes.ok) {
          let error = `Upload failed (${uploadRes.status})`;
          try {
            const data = await uploadRes.json();
            error = data.error || error;
          } catch {}
          throw new Error(error);
        }
        
        setDocuments(prev => prev.map(d => 
          d.id === id ? { ...d, progress: 100, uploaded: true } : d
        ));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setDocuments(prev => prev.map(d => 
          d.id === id ? { ...d, error: `Failed: ${errorMessage}`, progress: 0 } : d
        ));
      }
    }
  };

  const removeDocument = async (id: string, sessionId?: string) => {
    const original = documents;
    setDocuments(prev => prev.filter(d => d.id !== id));
    try {
      if (sessionId) {
        const res = await fetch(`${API_BASE_URL}/clear-session/${sessionId}`, { 
          method: 'DELETE' 
        });
        if (!res.ok) {
          setDocuments(original);
          throw new Error(`Delete failed (${res.status})`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setApiError(`Remove failed: ${errorMessage}`);
    }
  };

  const toggleSelection = (id: string) => {
    setDocuments(prev => prev.map(d => ({ 
      ...d, 
      selected: d.id === id ? !d.selected : false 
    })));
  };

  const selectedDoc = documents.find(d => d.selected && d.uploaded);

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col md:flex-row overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-4 -right-4 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-8 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      {/* Mobile Header */}
      {isMobile && (
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5" />
            <h2 className="text-lg font-semibold">DocuChat AI</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Sidebar */}
      {(!isMobile || sidebarOpen) && (
        <div className={`${isMobile ? 'w-full border-t' : 'w-80 min-w-80'} bg-white/80 backdrop-blur-sm border-r border-gray-200 flex flex-col relative z-10`}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  DocuChat AI
                </h1>
              </div>
              {!isMobile && (
                <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
                  {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </Button>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-2">Upload documents and start chatting</p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${
                backendStatus === "healthy" ? "bg-green-500 animate-pulse" : 
                backendStatus === "unhealthy" ? "bg-red-500" : "bg-yellow-500"
              }`}></div>
              <span className="text-gray-600">
                {backendStatus === "healthy" ? "Connected" : 
                 backendStatus === "unhealthy" ? "Disconnected" : "Connecting"}
              </span>
            </div>
          </div>

          {/* Upload */}
          <div className="p-4 border-b border-gray-200">
            <div
              className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
              }`}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Plus className="w-6 h-6 text-blue-500" />
                </div>
                <Input
                  type="file" accept=".pdf" multiple
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden" id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all transform hover:scale-105">
                  <Upload className="w-4 h-4" />
                  Add Documents
                </label>
                <p className="text-xs text-gray-500">PDF only • Max 10MB</p>
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="flex-1 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">Documents ({documents.length})</h3>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              {!documents.length ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No documents</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className={`p-3 rounded-lg border transition-all ${
                      doc.selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    } ${doc.error ? 'border-red-200 bg-red-50' : ''}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <button
                            onClick={() => toggleSelection(doc.id)}
                            disabled={!doc.uploaded || !!doc.error}
                            className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                              doc.selected && doc.uploaded && !doc.error
                                ? 'bg-blue-500 border-blue-500'
                                : 'border-gray-300 hover:border-blue-400'
                            } ${!doc.uploaded || doc.error ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {doc.selected && doc.uploaded && !doc.error && <Check className="w-3 h-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm truncate ${doc.error ? 'text-red-700' : 'text-gray-800'}`}>
                              {doc.name}
                            </p>
                            {doc.size > 0 && !doc.error && (
                              <p className="text-xs text-gray-500">{(doc.size / 1024 / 1024).toFixed(2)} MB</p>
                            )}
                            {doc.error && <p className="text-xs text-red-600 mt-1">{doc.error}</p>}
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeDocument(doc.id, doc.sessionId)} 
                          className="p-1 h-auto text-gray-500 hover:text-gray-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      {!doc.uploaded && !doc.error && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>{doc.progress < 30 ? 'Creating session...' : doc.progress < 60 ? 'Uploading...' : 'Processing...'}</span>
                            <span>{doc.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-1.5 rounded-full transition-all" style={{ width: `${doc.progress}%` }}></div>
                          </div>
                        </div>
                      )}

                      {doc.uploaded && !doc.error && (
                        <div className="flex items-center gap-2 text-green-600 mt-2">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-medium">Ready</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {selectedDoc && (
            <div className="p-4 border-t border-gray-200 bg-blue-50">
              <p className="text-xs text-blue-700 font-medium">1 document selected</p>
            </div>
          )}
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white/80 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Chat</h2>
              <p className="text-xs text-gray-600 flex items-center gap-1">
                {selectedDoc ? (
                  <>Using: <span className="font-medium truncate max-w-xs">{selectedDoc.name}</span></>
                ) : (
                  <span className="text-orange-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Select a document
                  </span>
                )}
              </p>
            </div>
          </div>
          {isMobile && sidebarOpen && (
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden relative">
          <ScrollArea className="h-full">
            <div className="p-4 pb-16">
              {!messages.length ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <div className="mb-4 p-3 bg-blue-100 rounded-full">
                    <Bot className="w-10 h-10 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">Welcome to DocuChat AI</h3>
                  <p className="text-gray-600 max-w-md mb-6">Upload PDF documents and ask questions about their content.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-lg">
                    {[
                      { icon: Upload, title: "Upload PDF", desc: "Add document to sidebar" },
                      { icon: FileText, title: "Select Document", desc: "Choose which to query" },
                      { icon: Send, title: "Ask Questions", desc: "Get answers from docs" }
                    ].map(({ icon: Icon, title, desc }) => (
                      <div key={title} className="bg-white p-4 rounded-lg border shadow-sm">
                        <Icon className="w-5 h-5 mx-auto text-blue-500 mb-2" />
                        <h4 className="font-medium text-gray-800 mb-1">{title}</h4>
                        <p className="text-xs text-gray-600">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-xl p-4 ${
                        msg.role === "user"
                          ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-br-none"
                          : "bg-white border border-gray-200 rounded-tl-none shadow-sm"
                      }`}>
                        <div className="flex items-start gap-2">
                          {msg.role === "user" ? 
                            <User className="w-5 h-5 mt-0.5 text-blue-200" /> : 
                            <Bot className="w-5 h-5 mt-0.5 text-blue-600" />
                          }
                          <div className="flex-1">
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <p className={`text-xs mt-2 ${msg.role === "user" ? "text-blue-200" : "text-gray-500"}`}>
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-white border p-4 rounded-xl rounded-tl-none">
                        <div className="flex items-center gap-2">
                          <Bot className="w-5 h-5 text-blue-600" />
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {apiError && (
                    <div className="flex justify-center">
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        {apiError}
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Input */}
        <div className="border-t bg-white/80 backdrop-blur-sm p-4">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedDoc ? "Ask about the document..." : "Select a document first..."}
              className="flex-1 min-h-[60px] max-h-32 resize-none"
              disabled={!selectedDoc || loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              onClick={sendMessage}
              size="icon"
              className="h-11 w-11 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              disabled={!input.trim() || !selectedDoc || loading}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-center text-gray-500 mt-2">
            DocuChat AI can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}