import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  Tag,
  FileText,
  ExternalLink,
  Edit,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import type { CalendarEvent } from "./CalendarView";

// ============================================================================
// EVENT DETAIL SHEET
// ============================================================================
interface EventDetailSheetProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (event: CalendarEvent) => void;
}

export function EventDetailSheet({
  event,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: EventDetailSheetProps) {
  if (!event) return null;

  const sourceColors: Record<string, string> = {
    google: "#4285F4",
    outlook: "#0078D4",
    shopify: "#96BF48",
    woocommerce: "#96588A",
    custom: "#718096",
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] bg-card border-l border-border">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between">
            <SheetTitle className="text-xl font-bold text-foreground pr-8">
              {event.title}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Source Badge */}
          {event.source && (
            <Badge
              className="gap-1"
              style={{
                backgroundColor: `${sourceColors[event.source] || sourceColors.custom}20`,
                color: sourceColors[event.source] || sourceColors.custom,
                borderColor: `${sourceColors[event.source] || sourceColors.custom}30`,
              }}
            >
              <ExternalLink className="h-3 w-3" />
              {event.source.charAt(0).toUpperCase() + event.source.slice(1)}
            </Badge>
          )}

          {/* Date & Time */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-foreground">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">
                  {format(event.start, "EEEE, MMMM d, yyyy")}
                </div>
                {!event.allDay && (
                  <div className="text-sm text-muted-foreground">
                    {format(event.start, "HH:mm")} - {format(event.end, "HH:mm")}
                  </div>
                )}
                {event.allDay && (
                  <div className="text-sm text-muted-foreground">All day</div>
                )}
              </div>
            </div>
          </div>

          {/* Category */}
          {event.category && (
            <div className="flex items-center gap-3">
              <Tag className="h-5 w-5 text-accent" />
              <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30">
                {event.category}
              </Badge>
            </div>
          )}

          <Separator className="bg-border" />

          {/* Description */}
          {event.description && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                Description
              </div>
              <p className="text-foreground leading-relaxed">
                {event.description}
              </p>
            </div>
          )}

          {/* Metadata */}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">
                Additional Data
              </div>
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                {Object.entries(event.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="text-foreground font-mono">
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator className="bg-border" />

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => onEdit?.(event)}
            >
              <Edit className="h-4 w-4" />
              Edit Event
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onDelete?.(event)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>

          {/* AI Agent Hint */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-primary">
                  AI Agent Tip
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Use the Chat Agent to modify this event with natural language
                  commands like "reschedule this meeting to next Tuesday" or
                  "add 30 minutes to this event".
                </p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
