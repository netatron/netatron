import { motion } from 'framer-motion';
import { Send, Paperclip, Mic, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export const ChatInput = ({ 
  onSend, 
  isLoading = false, 
  placeholder = "Ask the agent anything..." 
}: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (message.trim() && !isLoading) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  return (
    <div className="relative w-full">
      {/* Glow effect */}
      <motion.div
        className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-2xl blur-lg pointer-events-none"
        animate={{ opacity: message.length > 0 ? 0.8 : 0.3 }}
        transition={{ duration: 0.3 }}
      />

      <div className="relative w-full bg-background rounded-2xl border border-border">
        {/* Input row */}
        <div className="flex items-end w-full gap-2 p-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            style={{ width: '100%' }}
            className={cn(
              'flex-1 min-w-0 bg-transparent resize-none text-sm text-foreground placeholder:text-muted-foreground',
              'border-0 outline-none focus:outline-none focus:ring-0 py-2',
              'min-h-[36px] max-h-[120px] leading-normal',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Mic className="h-4 w-4" />
          </Button>

          <motion.div whileTap={{ scale: 0.95 }} className="shrink-0">
            <Button
              onClick={handleSubmit}
              disabled={!message.trim() || isLoading}
              size="icon"
              className={cn(
                'h-9 w-9 rounded-xl',
                'bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90',
                'disabled:from-muted disabled:to-muted disabled:text-muted-foreground'
              )}
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className="h-4 w-4" />
                </motion.div>
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </motion.div>
        </div>

        {/* Hint */}
        <div className="px-4 pb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">Enter</kbd> to send
          </span>
          <span>{message.length}/4000</span>
        </div>
      </div>
    </div>
  );
};
