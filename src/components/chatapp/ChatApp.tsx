import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Upload, MessageCircle, Send, Bot, User, Sparkles, FileText, Trash2, Plus, Check, ChevronLeft, ChevronRight, Menu } from "lucide-react";

interface Message {
  role: "user" | "bot";
  content: string;
  timestamp: Date;
}

interface DocumentFile {
  id: string;
  name: string;
  size: number;
  uploaded: boolean;
  progress: number;
  selected: boolean;
}

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [apiError, setApiError] = useState("");

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);
  
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

  // Helper function to safely parse JSON response
  const safeJsonParse = async (response: Response) => {
    const text = await response.text();
    if (!text.trim()) {
      throw new Error(`Server returned empty response (Status: ${response.status})`);
    }
    
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse JSON:', text);
      throw new Error(`Invalid JSON response from server: ${text.substring(0, 100)}...`);
    }
  };

  // Fetch documents on initial load
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/list-documents`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch documents (Status: ${response.status})`);
        }
        
        const data = await safeJsonParse(response);
        
        if (data.documents && Array.isArray(data.documents)) {
          const loadedDocs = data.documents.map((doc: any) => ({
            id: doc.filename,
            name: doc.filename,
            size: doc.size || 0,
            uploaded: true,
            progress: 100,
            selected: false
          }));
          
          setDocuments(loadedDocs);
        }
      } catch (error) {
        console.error('Error loading documents:', error);
        setApiError(`Failed to load documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    
    fetchDocuments();
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || !selectedDocument) return;
    
    const userMessage: Message = { 
      role: "user", 
      content: input,
      timestamp: new Date()
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setApiError("");

    try {
      const response = await fetch(`${API_BASE_URL}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          filename: selectedDocument.name,
          question: input
        })
      });
      
      if (!response.ok) {
        let errorMessage = `API error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await safeJsonParse(response);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If we can't parse error response, use status message
        }
        throw new Error(errorMessage);
      }
      
      const data = await safeJsonParse(response);
      
      const botMessage: Message = { 
        role: "bot", 
        content: data.answer || "Sorry, I didn't receive a proper response.",
        timestamp: new Date()
      };
      
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to get response from AI";
      setApiError(errorMessage);
      
      const errorBotMessage: Message = { 
        role: "bot", 
        content: "Sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date()
      };
      
      setMessages((prev) => [...prev, errorBotMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (selectedFiles: FileList) => {
    setApiError("");
    
    for (const file of Array.from(selectedFiles)) {
      if (file.type !== 'application/pdf') {
        setApiError('Only PDF files are allowed');
        continue;
      }
      
      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setApiError(`File ${file.name} is too large (max 10MB)`);
        continue;
      }

      const docId = Math.random().toString(36).substr(2, 9);
      const newDoc: DocumentFile = {
        id: docId,
        name: file.name,
        size: file.size,
        uploaded: false,
        progress: 0,
        selected: false
      };
      
      // Add immediately to show in UI
      setDocuments(prev => [...prev, newDoc]);
      
      try {
        // First progress update
        setDocuments(prev => prev.map(d => 
          d.id === docId ? { ...d, progress: 30 } : d
        ));
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
          },
        });
        
        setDocuments(prev => prev.map(d => 
          d.id === docId ? { ...d, progress: 70 } : d
        ));
        
        if (!response.ok) {
          let errorMessage = `Upload failed (Status: ${response.status})`;
          try {
            const errorData = await safeJsonParse(response);
            errorMessage = errorData.error || errorMessage;
          } catch {
            // If we can't parse error response, use status message
            errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }
        
        const responseData = await safeJsonParse(response);
        
        // Update document with final name from server
        setDocuments(prev => prev.map(d => 
          d.id === docId ? { 
            ...d, 
            id: responseData.filename,
            name: responseData.filename,
            progress: 100, 
            uploaded: true 
          } : d
        ));
        
      } catch (error) {
        console.error('Error uploading file:', error);
        const errorMessage = error instanceof Error ? error.message : "Unknown upload error";
        setApiError(`Failed to upload ${file.name}: ${errorMessage}`);
        
        // Remove failed document
        setDocuments(prev => prev.filter(d => d.id !== docId));
      }
    }
  };

  const removeDocument = async (id: string, name: string) => {
    try {
      // First remove from UI optimistically
      const originalDocs = documents;
      setDocuments(prev => prev.filter(doc => doc.id !== id));
      
      // Then call backend to delete
      const response = await fetch(`${API_BASE_URL}/delete-document/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        // Restore the document if deletion failed
        setDocuments(originalDocs);
        throw new Error(`Failed to delete from server (Status: ${response.status})`);
      }
      
      // Refresh documents list after deletion
      const fetchDocuments = async () => {
        const response = await fetch(`${API_BASE_URL}/list-documents`);
        const data = await response.json();
        if (data.documents) {
          setDocuments(data.documents.map((doc: any) => ({
            id: doc.filename,
            name: doc.filename,
            size: doc.size || 0,
            uploaded: true,
            progress: 100,
            selected: false
          })));
        }
      };
      
      fetchDocuments();
      
    } catch (error) {
      console.error('Error removing document:', error);
      setApiError(`Failed to remove document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const toggleDocumentSelection = (id: string) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === id ? { ...doc, selected: !doc.selected } : { ...doc, selected: false }
    ));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const hasUploadedDocuments = documents.some(doc => doc.uploaded);
  const selectedDocument = documents.find(doc => doc.selected && doc.uploaded);

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col md:flex-row overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-4 -right-4 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-8 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      {/* Mobile Header with Menu Button */}
      {isMobile && (
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 flex items-center justify-between md:hidden z-20">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5" />
            <h2 className="text-lg font-semibold">DocuChat AI</h2>
          </div>
          <button 
            onClick={toggleSidebar}
            className="p-1 rounded-md hover:bg-white/10"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Left Panel - Document Management (Collapsible) */}
      {(!isMobile || sidebarOpen) && (
        <div className={`${isMobile ? 'w-full h-auto border-t' : 'w-80 min-w-80 h-full'} bg-white/80 backdrop-blur-sm border-r border-gray-200 flex flex-col relative z-10 transition-all duration-300 ${sidebarOpen ? 'block' : 'hidden md:block md:w-0 md:min-w-0 md:overflow-hidden'}`}>
          {/* Header */}
          <div className="p-4 md:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg">
                  <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  DocuChat AI
                </h1>
              </div>
              {!isMobile && (
                <button 
                  onClick={toggleSidebar}
                  className="p-1 rounded-md hover:bg-gray-100 text-gray-500"
                >
                  {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Upload documents and start chatting
            </p>
          </div>

          {/* Upload Section */}
          <div className="p-3 md:p-4 border-b border-gray-200">
            <div
              className={`border-2 border-dashed rounded-xl p-3 md:p-4 text-center transition-all duration-300 ${
                dragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="flex flex-col items-center gap-2 md:gap-3">
                <div className="p-2 md:p-3 bg-blue-100 rounded-full">
                  <Plus className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
                </div>
                <div>
                  <Input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-lg text-xs md:text-sm"
                  >
                    <Upload className="w-3 h-3 md:w-4 md:h-4" />
                    Add Documents
                  </label>
                </div>
                <p className="text-xs text-gray-500">PDF files only • Max 10MB each</p>
              </div>
            </div>
          </div>

          {/* Documents List */}
          <div className="flex-1 overflow-hidden">
            <div className="p-3 md:p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800 text-sm">
                Documents ({documents.length})
              </h3>
            </div>
            
            <ScrollArea className="flex-1 p-3 md:p-4">
              <div className="space-y-2 md:space-y-3">
                {documents.length === 0 ? (
                  <div className="text-center py-6 md:py-8 text-gray-500">
                    <FileText className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-2 md:mb-3 text-gray-300" />
                    <p className="text-sm">No documents uploaded</p>
                    <p className="text-xs">Add PDF files to get started</p>
                  </div>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className={`p-2 md:p-3 rounded-lg border transition-all duration-200 ${
                        doc.selected
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1 md:mb-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <button
                            onClick={() => toggleDocumentSelection(doc.id)}
                            disabled={!doc.uploaded}
                            className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                              doc.selected && doc.uploaded
                                ? 'bg-blue-500 border-blue-500'
                                : 'border-gray-300 hover:border-blue-400'
                            } ${!doc.uploaded ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {doc.selected && doc.uploaded && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs md:text-sm text-gray-800 truncate">
                              {doc.name}
                            </p>
                            {doc.size > 0 && (
                              <p className="text-xs text-gray-500">
                                {(doc.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={() => removeDocument(doc.id, doc.name)}
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      {/* Progress Bar */}
                      {!doc.uploaded && (
                        <div className="space-y-1 md:space-y-2">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Uploading...</span>
                            <span>{doc.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1 md:h-1.5">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-purple-600 h-1 md:h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${doc.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Status */}
                      {doc.uploaded && (
                        <div className="flex items-center gap-2 text-green-600 mt-1 md:mt-2">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span className="text-xs font-medium">Ready</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Selected Documents Summary */}
          {selectedDocument && (
            <div className="p-3 md:p-4 border-t border-gray-200 bg-blue-50">
              <p className="text-xs text-blue-700 font-medium">
                1 document selected for chat
              </p>
            </div>
          )}
        </div>
      )}

      {/* Right Panel - Chat Interface */}
      <div className={`flex-1 flex flex-col relative z-10 ${isMobile && !sidebarOpen ? 'h-full' : 'h-[calc(100%-300px)] md:h-full'}`}>
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 md:p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
            <div>
              <h2 className="text-lg md:text-xl font-semibold">Chat with Your Documents</h2>
              {selectedDocument && (
                <p className="text-xs md:text-sm text-blue-100">
                  Selected: {selectedDocument.name}
                </p>
              )}
            </div>
          </div>
          {selectedDocument && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs md:text-sm">Ready</span>
            </div>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4 md:p-6">
            <div className="space-y-3 md:space-y-4 max-w-4xl mx-auto">
              {!hasUploadedDocuments && (
                <div className="text-center py-8 md:py-16 text-gray-500">
                  <Upload className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 md:mb-6 text-gray-300" />
                  <p className="text-lg md:text-xl font-medium mb-2">Upload documents to start chatting</p>
                  <p className="text-gray-400 text-sm md:text-base">Your AI assistant is waiting to help you explore your documents</p>
                </div>
              )}

              {hasUploadedDocuments && messages.length === 0 && (
                <div className="text-center py-8 md:py-12 text-gray-500">
                  <Bot className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3 md:mb-4 text-blue-400" />
                  <p className="text-lg md:text-xl font-medium mb-2">Documents loaded successfully!</p>
                  <p className="text-gray-400 text-sm md:text-base">Ask me anything about your selected documents</p>
                </div>
              )}
              
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 md:gap-4 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "bot" && (
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] md:max-w-[70%] p-3 md:p-4 rounded-2xl shadow-lg ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-br-md"
                        : "bg-white text-gray-800 rounded-bl-md border border-gray-200"
                    }`}
                  >
                    <p className="leading-relaxed text-sm md:text-base">{msg.content}</p>
                    <span className={`text-xs mt-1 md:mt-2 block ${
                      msg.role === "user" ? "text-blue-100" : "text-gray-500"
                    }`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  {msg.role === "user" && (
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
                    </div>
                  )}
                </div>
              ))}
              
              {loading && (
                <div className="flex gap-3 md:gap-4">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <Bot className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </div>
                  <div className="bg-white p-3 md:p-4 rounded-2xl rounded-bl-md border border-gray-200 shadow-lg">
                    <div className="flex space-x-1 md:space-x-2">
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </div>
              )}

              {apiError && (
                <div className="text-center py-4 px-4 text-red-600 bg-red-50 border border-red-200 rounded-lg text-sm">
                  <strong>Error:</strong> {apiError}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Input Area - Fixed at bottom */}
        <div className="border-t bg-white p-3 md:p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2 md:gap-3 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  selectedDocument 
                    ? "Ask anything about your selected document..." 
                    : "Select a document from the left panel to start chatting"
                }
                className="flex-1 resize-none bg-white border-gray-300 focus:border-blue-400 focus:ring-blue-300 rounded-xl min-h-[40px] md:min-h-[44px] max-h-32 text-sm md:text-base"
                rows={1}
                disabled={!selectedDocument}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button
                onClick={sendMessage}
                disabled={loading || !input.trim() || !selectedDocument}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-4 py-2 md:px-6 md:py-3 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none h-10 md:h-11"
              >
                <Send className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}