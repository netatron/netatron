import { motion } from 'framer-motion';
import { Bot, User, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { AnimatedText } from './AnimatedText';
import { Button } from '@/components/ui/button';

// TODO: API_INTEGRATION - Replace with real ChatMessage from API
export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
  isNew?: boolean;
}

export const ChatMessage = ({ message, isNew = false }: ChatMessageProps) => {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'group flex gap-4 p-4 rounded-2xl',
        isAssistant ? 'bg-muted/30' : 'bg-transparent'
      )}
    >
      {/* Avatar */}
      <motion.div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
          isAssistant 
            ? 'bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30' 
            : 'bg-muted border border-border'
        )}
        whileHover={{ scale: 1.05 }}
      >
        {isAssistant ? (
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <Bot className="h-5 w-5 text-primary" />
          </motion.div>
        ) : (
          <User className="h-5 w-5 text-muted-foreground" />
        )}
      </motion.div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-semibold',
            isAssistant ? 'text-primary' : 'text-foreground'
          )}>
            {isAssistant ? 'Netatron Agent' : 'You'}
          </span>
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Message content */}
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {message.isStreaming ? (
            <AnimatedText text={message.content} speed={10} />
          ) : (
            message.content
          )}
        </div>

        {/* Actions */}
        {isAssistant && !message.isStreaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
