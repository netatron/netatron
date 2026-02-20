import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ChevronLeft, ChevronRight, Table2, Eye, EyeOff, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CsvResultsPreviewProps {
  data: Record<string, unknown>[];
  total: number;
  isLoading?: boolean;
  isLive?: boolean;
  onDownload: () => void;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  pageSize?: number;
  title?: string;
}

export function CsvResultsPreview({
  data,
  total,
  isLoading = false,
  isLive = false,
  onDownload,
  onPageChange,
  currentPage = 1,
  pageSize = 100,
  title = "Results Preview",
}: CsvResultsPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [prevTotal, setPrevTotal] = useState(total);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const totalPages = Math.ceil(total / pageSize);
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const newRecordsCount = total - prevTotal;

  // Track new records for highlighting
  useEffect(() => {
    if (total > prevTotal && isLive) {
      // Auto-scroll to bottom when new records arrive (only on first page)
      if (currentPage === 1 && scrollRef.current) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }, 100);
      }
    }
    setPrevTotal(total);
  }, [total, isLive, currentPage, prevTotal]);

  const handlePrevPage = () => {
    if (currentPage > 1 && onPageChange) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages && onPageChange) {
      onPageChange(currentPage + 1);
    }
  };

  if (total === 0 && !isLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card variant="premium" className="relative overflow-hidden">
        {/* Animated gradient border */}
        <div className="absolute inset-0 rounded-lg border-gradient-animated opacity-50" />
        
        <CardHeader className="relative z-10 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-glow-container p-2 rounded-lg bg-primary/10">
                <Table2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg gradient-text">{title}</CardTitle>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {total} records
                  </p>
                  {isLive && (
                    <motion.div 
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30"
                      animate={{ opacity: [1, 0.6, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Radio className="h-3 w-3 text-red-500" />
                      <span className="text-xs font-medium text-red-500">LIVE</span>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {isExpanded ? "Hide" : "Show"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDownload}
                className="gap-2 border-primary/30 hover:border-primary hover:bg-primary/10 glow-primary-subtle"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CardContent className="relative z-10 pt-0">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Excel-like table */}
                    <ScrollArea className="w-full rounded-lg border border-border/50 bg-background/50">
                      <div className="min-w-max">
                        {/* Header row */}
                        <div className="flex border-b border-border bg-muted/50 sticky top-0 z-10">
                          {/* Row number header */}
                          <div className="flex-shrink-0 w-12 px-2 py-2 text-xs font-semibold text-muted-foreground border-r border-border bg-muted/80 text-center">
                            #
                          </div>
                          {columns.map((column, index) => (
                            <div
                              key={column}
                              className={cn(
                                "flex-shrink-0 min-w-[120px] max-w-[200px] px-3 py-2 text-xs font-semibold text-foreground truncate",
                                index < columns.length - 1 && "border-r border-border/50"
                              )}
                              title={column}
                            >
                              {column}
                            </div>
                          ))}
                        </div>

                        {/* Data rows */}
                        <div ref={scrollRef} className="max-h-[400px] overflow-y-auto">
                          {data.map((row, rowIndex) => {
                            const absoluteIndex = (currentPage - 1) * pageSize + rowIndex;
                            const isNewRecord = isLive && absoluteIndex >= prevTotal - newRecordsCount && newRecordsCount > 0;
                            
                            return (
                              <motion.div
                                key={rowIndex}
                                initial={isNewRecord ? { opacity: 0, backgroundColor: "hsl(var(--primary) / 0.3)" } : { opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0, backgroundColor: "transparent" }}
                                transition={{ 
                                  delay: isNewRecord ? 0 : rowIndex * 0.02, 
                                  duration: isNewRecord ? 0.5 : 0.2,
                                  backgroundColor: { duration: 1.5 }
                                }}
                                className={cn(
                                  "flex border-b border-border/30 hover:bg-primary/5 transition-colors group",
                                  rowIndex % 2 === 0 ? "bg-background/30" : "bg-muted/10",
                                  isNewRecord && "ring-1 ring-primary/30"
                                )}
                              >
                                {/* Row number */}
                                <div className="flex-shrink-0 w-12 px-2 py-2 text-xs text-muted-foreground border-r border-border/50 bg-muted/30 text-center tabular-nums">
                                  {(currentPage - 1) * pageSize + rowIndex + 1}
                                </div>
                                {columns.map((column, colIndex) => {
                                  const value = row[column];
                                  const displayValue = 
                                    value === null || value === undefined 
                                      ? "" 
                                      : typeof value === "object" 
                                        ? JSON.stringify(value) 
                                        : String(value);
                                  
                                  return (
                                    <div
                                      key={column}
                                      className={cn(
                                        "flex-shrink-0 min-w-[120px] max-w-[200px] px-3 py-2 text-xs text-foreground/80 truncate group-hover:text-foreground",
                                        colIndex < columns.length - 1 && "border-r border-border/30"
                                      )}
                                      title={displayValue}
                                    >
                                      {displayValue || <span className="text-muted-foreground/50">ÔÇö</span>}
                                    </div>
                                  );
                                })}
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>

                    {/* Pagination */}
                    {totalPages > 1 && onPageChange && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
                        <p className="text-sm text-muted-foreground">
                          Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, total)} of {total}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePrevPage}
                            disabled={currentPage <= 1}
                            className="gap-1"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Prev
                          </Button>
                          <span className="text-sm text-muted-foreground px-2">
                            Page <span className="font-medium text-foreground">{currentPage}</span> of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextPage}
                            disabled={currentPage >= totalPages}
                            className="gap-1"
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
