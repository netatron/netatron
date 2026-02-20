import { motion, AnimatePresence } from "framer-motion";
import { 
  Building2, 
  Mail, 
  Phone, 
  Globe, 
  MapPin,
  TrendingUp,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

// ============================================================================
// TYPES
// ============================================================================

export interface ScrapedCompany {
  id: string;
  name: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
  source_query?: string;
  confidence?: "Low" | "Medium" | "High";
  scraped_at: Date;
}

interface ResultsAccumulatorProps {
  results: ScrapedCompany[];
  targetCount: number;
  isRunning: boolean;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================
// TODO: API_INTEGRATION - Results populated from SSE stream
// Endpoint: GET /api/v1/jobs/{jobId}/events/stream
// Event: { type: 'result_found', data: { company: ScrapedCompany } }
// ============================================================================

export function ResultsAccumulator({
  results,
  targetCount,
  isRunning,
  className,
}: ResultsAccumulatorProps) {
  const progress = Math.min((results.length / targetCount) * 100, 100);
  
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Live Results
          </CardTitle>
          <Badge variant={isRunning ? "default" : "secondary"} className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {results.length} / {targetCount}
          </Badge>
        </div>
        
        {/* Progress bar */}
        <div className="mt-2 space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">
            {progress.toFixed(0)}% complete
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[400px]">
          <div className="p-4 pt-0 space-y-2">
            <AnimatePresence mode="popLayout">
              {results.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No results yet</p>
                  <p className="text-xs mt-1 opacity-70">Results will appear here as they are found</p>
                </div>
              ) : (
                results.map((company, index) => (
                  <CompanyResultCard 
                    key={company.id} 
                    company={company} 
                    index={index}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// COMPANY RESULT CARD
// ============================================================================

function CompanyResultCard({ 
  company, 
  index 
}: { 
  company: ScrapedCompany; 
  index: number;
}) {
  const confidenceColors = {
    Low: "bg-yellow-500/10 text-yellow-600",
    Medium: "bg-blue-500/10 text-blue-600",
    High: "bg-green-500/10 text-green-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05 }}
      className="p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-medium truncate">{company.name}</h4>
            {company.source_query && (
              <p className="text-[10px] text-muted-foreground truncate">
                via: {company.source_query}
              </p>
            )}
          </div>
        </div>
        
        {company.confidence && (
          <Badge 
            variant="outline" 
            className={cn("text-[10px] flex-shrink-0", confidenceColors[company.confidence])}
          >
            {company.confidence}
          </Badge>
        )}
      </div>

      {/* Details */}
      <div className="mt-2 space-y-1">
        {company.website && (
          <a 
            href={company.website} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Globe className="h-3 w-3" />
            <span className="truncate">{company.website}</span>
            <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
          </a>
        )}
        
        {company.email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span className="truncate">{company.email}</span>
          </div>
        )}
        
        {company.phone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span>{company.phone}</span>
          </div>
        )}
        
        {company.address && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{company.address}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {company.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
          {company.description}
        </p>
      )}

      {/* Timestamp */}
      <p className="mt-2 text-[10px] text-muted-foreground/60">
        Found at {company.scraped_at.toLocaleTimeString()}
      </p>
    </motion.div>
  );
}
