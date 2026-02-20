import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, 
  Sparkles, 
  Zap, 
  MessageSquare,
  PanelRightOpen,
  PanelRightClose
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage, ChatMessageData } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { ReasoningBubble } from '@/components/chat/ReasoningBubble';
import { ActionTimeline, TimelineAction } from '@/components/chat/ActionTimeline';
import { TodoList, TodoItem } from '@/components/chat/TodoList';
import { LogPanel, LogEntry } from '@/components/ui/log-panel';
import { ModuleControls, ModuleStatus } from '@/components/ui/module-controls';
import { cn } from '@/lib/utils';

// TODO: API_INTEGRATION - Connect to real chat API
// Use api.startChatSession() to create a new session
// Use api.sendChatMessage() to send messages
// Use api.getChatSession() to get session details with timeline and todos

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [currentReasoning, setCurrentReasoning] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // TODO: API_INTEGRATION - Replace with real actions from AgentReply.action_timeline
  const [actions, setActions] = useState<TimelineAction[]>([]);

  // TODO: API_INTEGRATION - Replace with real todos from AgentReply.todos
  const [todos, setTodos] = useState<TodoItem[]>([]);

  // TODO: API_INTEGRATION - Replace with real logs from WebSocket/SSE
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', timestamp: new Date(), level: 'info', message: 'Chat module initialized' },
    { id: '2', timestamp: new Date(), level: 'info', message: 'Ready to accept messages' },
  ]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentReasoning]);

  // Simulate agent response with reasoning and actions
  const simulateAgentResponse = async (userMessage: string) => {
    setIsLoading(true);
    setIsProcessing(true);
    setModuleStatus('running');

    // Add log
    setLogs(prev => [...prev, {
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      message: `Processing query: "${userMessage.slice(0, 50)}..."`
    }]);

    // Phase 1: Reasoning
    const reasoningThoughts = [
      "Analyzing the user's request and identifying key requirements...",
      "Searching through available data sources for relevant information...",
      "Processing and synthesizing the gathered information...",
    ];

    for (let i = 0; i < reasoningThoughts.length; i++) {
      setCurrentReasoning(reasoningThoughts[i]);
      
      // Add action to timeline
      const actionTypes: TimelineAction['type'][] = ['analyze', 'search', 'process'];
      const newAction: TimelineAction = {
        id: `action-${Date.now()}-${i}`,
        type: actionTypes[i],
        title: ['Analyzing request', 'Searching data', 'Processing results'][i],
        status: 'in_progress',
        timestamp: new Date(),
      };
      
      setActions(prev => [...prev.map(a => ({ ...a, status: 'completed' as const })), newAction]);
      
      // Add todo
      if (i === 0) {
        setTodos([
          { id: '1', text: 'Parse user query', completed: false, inProgress: true, priority: 'high' },
          { id: '2', text: 'Search knowledge base', completed: false, priority: 'medium' },
          { id: '3', text: 'Generate response', completed: false, priority: 'medium' },
          { id: '4', text: 'Validate accuracy', completed: false, priority: 'low' },
        ]);
      } else {
        setTodos(prev => prev.map((todo, idx) => ({
          ...todo,
          completed: idx < i,
          inProgress: idx === i,
        })));
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Clear reasoning, show response
    setCurrentReasoning(null);
    setIsProcessing(false);

    // Complete all todos
    setTodos(prev => prev.map(todo => ({ ...todo, completed: true, inProgress: false })));
    
    // Complete final action
    setActions(prev => [...prev.map(a => ({ ...a, status: 'completed' as const })), {
      id: `action-complete-${Date.now()}`,
      type: 'complete',
      title: 'Response generated',
      status: 'completed',
      timestamp: new Date(),
      duration: 2847,
    }]);

    // Add assistant message
    const response: ChatMessageData = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Based on my analysis of your request "${userMessage}", I've gathered the following insights:\n\n1. **Key Finding**: The data patterns suggest significant opportunities in the specified sector.\n\n2. **Recommendation**: I recommend focusing on the top 3 identified prospects for initial outreach.\n\n3. **Next Steps**: I can help you extract detailed contact information or perform deeper analysis on specific companies.\n\nWould you like me to proceed with any of these actions?`,
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, response]);

    // Log completion
    setLogs(prev => [...prev, {
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'success',
      message: 'Response generated successfully'
    }]);

    // Update message to stop streaming after animation
    setTimeout(() => {
      setMessages(prev => prev.map(m => 
        m.id === response.id ? { ...m, isStreaming: false } : m
      ));
      setIsLoading(false);
      setModuleStatus('idle');
    }, 2000);
  };

  const handleSendMessage = (content: string) => {
    const userMessage: ChatMessageData = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setActions([]); // Reset actions for new query
    setTodos([]); // Reset todos for new query
    simulateAgentResponse(content);
  };

  const handleStart = () => setModuleStatus('running');
  const handlePause = () => setModuleStatus('paused');
  const handleStop = () => {
    setModuleStatus('idle');
    setIsLoading(false);
    setCurrentReasoning(null);
    setIsProcessing(false);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <PageHeader
        title="Chat AI Agent"
        description="Interactive AI assistant with reasoning visualization"
        icon={Bot}
        actions={
          <div className="flex items-center gap-4">
            <ModuleControls
              status={moduleStatus}
              onStart={handleStart}
              onPause={handlePause}
              onStop={handleStop}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showSidebar ? (
                <PanelRightClose className="h-5 w-5" />
              ) : (
                <PanelRightOpen className="h-5 w-5" />
              )}
            </Button>
          </div>
        }
      />

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0 p-6 pt-0">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <ScrollArea className="flex-1 -mx-2 px-2">
            <div className="space-y-4 pb-4">
              {/* Welcome message */}
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <motion.div
                    className="relative mb-6"
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full" />
                    <div className="relative p-6 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
                      <Sparkles className="h-12 w-12 text-primary" />
                    </div>
                  </motion.div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    Welcome to Netatron Agent
                  </h2>
                  <p className="text-muted-foreground max-w-md mb-8">
                    I'm your AI-powered data extraction assistant. Ask me to find companies, 
                    analyze markets, or extract information from various sources.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      "Find software companies in Warsaw",
                      "Analyze the restaurant market in Krakow",
                      "Extract emails from my inbox",
                    ].map((suggestion, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.1 }}
                        onClick={() => handleSendMessage(suggestion)}
                        className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-primary/30 transition-all"
                      >
                        <Zap className="inline h-3 w-3 mr-2 text-primary" />
                        {suggestion}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Messages list */}
              <AnimatePresence>
                {messages.map((message, index) => (
                  <ChatMessage 
                    key={message.id} 
                    message={message} 
                    isNew={index === messages.length - 1}
                  />
                ))}
              </AnimatePresence>

              {/* Reasoning bubble */}
              {currentReasoning && (
                <div className="px-4">
                  <ReasoningBubble
                    thought={currentReasoning}
                    isVisible={true}
                    isProcessing={isProcessing}
                  />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="pt-4">
            <ChatInput 
              onSend={handleSendMessage} 
              isLoading={isLoading}
              placeholder="Ask the agent to find data, analyze markets, or extract information..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-4 overflow-hidden"
            >
              {/* Action Timeline */}
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="glass-panel rounded-2xl p-4 flex-shrink-0"
              >
                <ActionTimeline actions={actions} />
                {actions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Actions will appear here as the agent works
                  </p>
                )}
              </motion.div>

              {/* Todo List */}
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="glass-panel rounded-2xl p-4 flex-shrink-0"
              >
                <TodoList items={todos} />
                {todos.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Tasks will appear here as the agent plans
                  </p>
                )}
              </motion.div>

              {/* Logs */}
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex-1 min-h-0"
              >
                <LogPanel
                  logs={logs}
                  title="Agent Logs"
                  maxHeight="100%"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Chat;
