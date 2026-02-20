import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Sparkles, Loader2 } from 'lucide-react';
import { AnimatedText } from './AnimatedText';

interface ReasoningBubbleProps {
  thought: string;
  isVisible: boolean;
  isProcessing?: boolean;
}

export const ReasoningBubble = ({ thought, isVisible, isProcessing = false }: ReasoningBubbleProps) => {
  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative"
        >
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-xl rounded-2xl" />
          
          <div className="relative glass-panel rounded-2xl p-4 border border-primary/30">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <motion.div
                animate={{ rotate: isProcessing ? 360 : 0 }}
                transition={{ duration: 2, repeat: isProcessing ? Infinity : 0, ease: 'linear' }}
                className="p-1.5 rounded-lg bg-primary/20"
              >
                <Brain className="h-4 w-4 text-primary" />
              </motion.div>
              <span className="text-xs font-mono text-primary uppercase tracking-wider">
                Reasoning
              </span>
              {isProcessing && (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                </motion.div>
              )}
              <motion.div
                className="ml-auto flex gap-1"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {[0, 1, 2].map((i) => (
                  <Sparkles 
                    key={i} 
                    className="h-3 w-3 text-primary/60" 
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </motion.div>
            </div>

            {/* Thought content */}
            <div className="text-sm text-muted-foreground italic leading-relaxed">
              <AnimatedText text={thought} speed={15} />
            </div>

            {/* Decorative elements */}
            <motion.div
              className="absolute -bottom-1 left-4 right-4 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent, hsl(var(--primary)/0.5), transparent)',
              }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
