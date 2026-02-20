import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Sparkles, Zap, Eye, Play, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ChatMessage, ChatMessageData } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { ReasoningBubble } from '@/components/chat/ReasoningBubble';
import { ActionTimeline, TimelineAction } from '@/components/chat/ActionTimeline';
import { TodoList, TodoItem } from '@/components/chat/TodoList';
import { ToolExecutionVisualizer, generateMockExecutions } from '@/components/chat/ToolExecutionVisualizer';
import { cn } from '@/lib/utils';
import { useUIAgent } from '@/hooks/use-ui-agent';
import { Badge } from '@/components/ui/badge';
import type { ToolExecution } from '@/lib/agent-tools/types';

// TODO: API_INTEGRATION - Connect to real chat API
// Use api.startChatSession() to create a new session
// Use api.sendChatMessage() to send messages

interface ChatSheetProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ChatSheet({ trigger, open, onOpenChange }: ChatSheetProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentReasoning, setCurrentReasoning] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // UI Agent integration
  const { 
    uiState, 
    isExecuting, 
    sendMessageWithContext, 
    processAgentResponse,
    getUIContext,
    currentRoute,
  } = useUIAgent();

  // TODO: API_INTEGRATION - Replace with real actions from AgentReply.action_timeline
  const [actions, setActions] = useState<TimelineAction[]>([]);

  // TODO: API_INTEGRATION - Replace with real todos from AgentReply.todos
  const [todos, setTodos] = useState<TodoItem[]>([]);

  // Tool executions for visualization
  // TODO: API_INTEGRATION - Connect to WebSocket at ws://api/agent/tools/stream
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [showToolDemo, setShowToolDemo] = useState(false);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentReasoning]);

  // Handle agent response with UI awareness
  const handleAgentResponse = async (userMessage: string) => {
    setIsLoading(true);
    setIsProcessing(true);

    // Show reasoning
    setCurrentReasoning("Analyzing current screen...");
    
    const analyzeAction: TimelineAction = {
      id: `action-${Date.now()}-0`,
      type: 'analyze',
      title: 'Analyzing UI',
      status: 'in_progress',
      timestamp: new Date(),
    };
    setActions([analyzeAction]);

    try {
      // Get AI response with UI context
      setCurrentReasoning("Processing your request...");
      const response = await sendMessageWithContext(userMessage);
      
      // Update actions
      setActions(prev => [
        ...prev.map(a => ({ ...a, status: 'completed' as const })),
        {
          id: `action-${Date.now()}-1`,
          type: response.shouldExecute ? 'process' : 'search',
          title: response.shouldExecute ? 'Executing actions' : 'Responding',
          status: 'in_progress' as const,
          timestamp: new Date(),
        },
      ]);

      // Show reasoning if available
      if (response.reasoning) {
        setCurrentReasoning(response.reasoning);
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Execute UI actions if needed
      if (response.shouldExecute && response.actions?.length) {
        setCurrentReasoning("Executing UI actions...");
        
      await processAgentResponse(response, (index, result) => {
          // Update action status
          setActions(prev => [
            ...prev,
            {
              id: `action-exec-${Date.now()}-${index}`,
              type: result.success ? 'complete' : 'validate',
              title: `${result.action.type}: ${result.action.targetId || 'element'}`,
              status: result.success ? 'completed' : 'error',
              timestamp: new Date(),
            } as TimelineAction,
          ]);
        });
      }

      setCurrentReasoning(null);
      setIsProcessing(false);

      // Final action
      setActions(prev => [
        ...prev.map(a => ({ ...a, status: 'completed' as const })),
        {
          id: `action-complete-${Date.now()}`,
          type: 'complete',
          title: 'Done',
          status: 'completed',
          timestamp: new Date(),
        },
      ]);

      // Add response message
      const responseMessage: ChatMessageData = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages(prev => [...prev, responseMessage]);

      setTimeout(() => {
        setMessages(prev => prev.map(m => 
          m.id === responseMessage.id ? { ...m, isStreaming: false } : m
        ));
        setIsLoading(false);
      }, 500);

    } catch (error) {
      console.error('Agent error:', error);
      setCurrentReasoning(null);
      setIsProcessing(false);
      setIsLoading(false);

      const errorMessage: ChatMessageData = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleSendMessage = (content: string) => {
    const userMessage: ChatMessageData = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setActions([]);
    setTodos([]);
    handleAgentResponse(content);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent 
        side="right" 
        className="w-full sm:w-[480px] p-0 border-l border-border/50 bg-background/95 backdrop-blur-xl flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-foreground">Netatron Agent</SheetTitle>
                <p className="text-xs text-muted-foreground">AI Assistant</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1 text-xs border-primary/30">
              <Eye className="h-3 w-3" />
              {uiState?.page.title || currentRoute}
            </Badge>
          </div>
        </SheetHeader>

        {/* Main content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="space-y-4 py-4 px-4">
                {/* Welcome */}
                {messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-8 text-center"
                  >
                    <motion.div
                      className="relative mb-4"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full" />
                      <div className="relative p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
                        <Sparkles className="h-8 w-8 text-primary" />
                      </div>
                    </motion.div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">
                      How can I help?
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-4">
                      Ask me anything about data extraction, market analysis, or information gathering.
                    </p>
                    <div className="flex flex-col gap-2 w-full max-w-xs">
                      {[
                        "Find companies in Warsaw",
                        "Analyze restaurant market",
                      ].map((suggestion, i) => (
                        <motion.button
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + i * 0.1 }}
                          onClick={() => handleSendMessage(suggestion)}
                          className="px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-primary/30 transition-all text-left"
                        >
                          <Zap className="inline h-3 w-3 mr-2 text-primary" />
                          {suggestion}
                        </motion.button>
                      ))}
                      
                      {/* Demo Tool Execution Button */}
                      <motion.button
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        onClick={() => {
                          setShowToolDemo(true);
                          setToolExecutions(generateMockExecutions());
                          // Simulate tool execution progress
                          setTimeout(() => {
                            setToolExecutions(prev => prev.map(e => 
                              e.status === 'executing' 
                                ? { ...e, progress: 75 } 
                                : e
                            ));
                          }, 1500);
                          setTimeout(() => {
                            setToolExecutions(prev => prev.map(e => ({
                              ...e,
                              status: 'completed' as const,
                              completedAt: new Date(),
                              progress: 100
                            })));
                          }, 3000);
                        }}
                        className="px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 hover:border-violet-500/50 transition-all text-left"
                      >
                        <Wrench className="inline h-3 w-3 mr-2 text-violet-400" />
                        Demo: Tool Executions
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {/* Messages */}
                <AnimatePresence>
                  {messages.map((message, index) => (
                    <ChatMessage 
                      key={message.id} 
                      message={message} 
                      isNew={index === messages.length - 1}
                    />
                  ))}
                </AnimatePresence>

                {/* Reasoning */}
                {currentReasoning && (
                  <ReasoningBubble
                    thought={currentReasoning}
                    isVisible={true}
                    isProcessing={isProcessing}
                  />
                )}

                {/* Tool Executions Visualizer */}
                {(showToolDemo || toolExecutions.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-border/50 rounded-xl p-3 bg-background/50 backdrop-blur-sm"
                  >
                    <ToolExecutionVisualizer 
                      executions={toolExecutions}
                      compact={false}
                    />
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-border/50 flex-shrink-0 w-full">
              <ChatInput 
                onSend={handleSendMessage} 
                isLoading={isLoading}
                placeholder="Ask the agent..."
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
