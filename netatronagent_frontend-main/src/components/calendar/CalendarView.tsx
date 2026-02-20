import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  addYears,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";

// ============================================================================
// CALENDAR EVENT TYPES
// ============================================================================
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  category?: string;
  source?: string; // API source: 'google', 'outlook', 'custom', etc.
  color?: string;
  metadata?: Record<string, unknown>;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  view: "month" | "year";
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onMonthChange?: (date: Date) => void;
}

// ============================================================================
// DAY CELL COMPONENT
// ============================================================================
function DayCell({
  date,
  events,
  currentMonth,
  isSelected,
  onClick,
  onEventClick,
}: {
  date: Date;
  events: CalendarEvent[];
  currentMonth: Date;
  isSelected: boolean;
  onClick: () => void;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const dayEvents = events.filter((event) => isSameDay(event.start, date));
  const isCurrentMonth = isSameMonth(date, currentMonth);
  const isCurrentDay = isToday(date);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "relative min-h-[100px] p-2 border border-border/50 rounded-lg cursor-pointer transition-all duration-200",
        isCurrentMonth ? "bg-card/50" : "bg-muted/20 opacity-50",
        isSelected && "ring-2 ring-primary border-primary",
        isCurrentDay && "border-primary/50",
        "hover:bg-card/70 hover:border-primary/30"
      )}
    >
      {/* Day Number */}
      <div
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium mb-1",
          isCurrentDay && "bg-primary text-primary-foreground",
          !isCurrentDay && isCurrentMonth && "text-foreground",
          !isCurrentMonth && "text-muted-foreground"
        )}
      >
        {format(date, "d")}
      </div>

      {/* Events */}
      <div className="space-y-1 overflow-hidden">
        <AnimatePresence>
          {dayEvents.slice(0, 3).map((event, idx) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ delay: idx * 0.05 }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(event);
              }}
              className={cn(
                "px-2 py-0.5 text-xs rounded truncate cursor-pointer transition-all",
                "bg-primary/20 text-primary hover:bg-primary/30",
                event.color && `bg-${event.color}/20 text-${event.color}`
              )}
              style={
                event.color
                  ? {
                      backgroundColor: `${event.color}20`,
                      color: event.color,
                    }
                  : undefined
              }
            >
              {event.title}
            </motion.div>
          ))}
        </AnimatePresence>
        {dayEvents.length > 3 && (
          <div className="text-xs text-muted-foreground pl-2">
            +{dayEvents.length - 3} more
          </div>
        )}
      </div>

      {/* Glow effect for today */}
      {isCurrentDay && (
        <div className="absolute inset-0 rounded-lg bg-primary/5 pointer-events-none" />
      )}
    </motion.div>
  );
}

// ============================================================================
// MONTH VIEW COMPONENT
// ============================================================================
function MonthView({
  currentMonth,
  events,
  selectedDate,
  onDateSelect,
  onEventClick,
}: {
  currentMonth: Date;
  events: CalendarEvent[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = startDate;
  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-2">
      {/* Week days header */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {weekDays.map((weekDay) => (
          <div
            key={weekDay}
            className="text-center text-xs font-medium text-muted-foreground py-2"
          >
            {weekDay}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((dayItem, idx) => (
          <DayCell
            key={idx}
            date={dayItem}
            events={events}
            currentMonth={currentMonth}
            isSelected={isSameDay(dayItem, selectedDate)}
            onClick={() => onDateSelect(dayItem)}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// YEAR VIEW COMPONENT
// ============================================================================
function YearView({
  currentYear,
  events,
  selectedDate,
  onMonthSelect,
}: {
  currentYear: Date;
  events: CalendarEvent[];
  selectedDate: Date;
  onMonthSelect: (month: Date) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const monthDate = new Date(currentYear.getFullYear(), i, 1);
    const monthEvents = events.filter(
      (event) =>
        event.start.getMonth() === i &&
        event.start.getFullYear() === currentYear.getFullYear()
    );
    return { date: monthDate, events: monthEvents };
  });

  return (
    <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
      {months.map(({ date: monthDate, events: monthEvents }) => {
        const isCurrentMonth =
          monthDate.getMonth() === new Date().getMonth() &&
          monthDate.getFullYear() === new Date().getFullYear();
        const isSelected = isSameMonth(monthDate, selectedDate);

        return (
          <motion.div
            key={monthDate.getMonth()}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onMonthSelect(monthDate)}
            className={cn(
              "p-4 rounded-xl border border-border/50 cursor-pointer transition-all duration-200",
              "bg-card/50 hover:bg-card/70 hover:border-primary/30",
              isCurrentMonth && "border-primary/50",
              isSelected && "ring-2 ring-primary"
            )}
          >
            <div className="text-lg font-semibold text-foreground mb-2">
              {format(monthDate, "MMMM")}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarIcon className="h-4 w-4" />
              <span>{monthEvents.length} events</span>
            </div>
            {monthEvents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {monthEvents.slice(0, 3).map((event) => (
                  <Badge
                    key={event.id}
                    variant="outline"
                    className="text-xs bg-primary/10 text-primary border-primary/30"
                  >
                    {event.title.slice(0, 10)}
                    {event.title.length > 10 && "..."}
                  </Badge>
                ))}
                {monthEvents.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{monthEvents.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ============================================================================
// MAIN CALENDAR VIEW
// ============================================================================
export function CalendarView({
  events,
  view,
  selectedDate,
  onDateSelect,
  onEventClick,
  onMonthChange,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(selectedDate);

  const navigate = (direction: "prev" | "next") => {
    const newDate =
      view === "month"
        ? direction === "prev"
          ? addMonths(currentDate, -1)
          : addMonths(currentDate, 1)
        : direction === "prev"
          ? addYears(currentDate, -1)
          : addYears(currentDate, 1);

    setCurrentDate(newDate);
    onMonthChange?.(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    onDateSelect(today);
    onMonthChange?.(today);
  };

  return (
    <div className="space-y-4">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("prev")}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold text-foreground min-w-[200px] text-center">
            {view === "month"
              ? format(currentDate, "MMMM yyyy")
              : format(currentDate, "yyyy")}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("next")}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={goToToday} className="gap-2">
          <Clock className="h-4 w-4" />
          Today
        </Button>
      </div>

      {/* Calendar Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${view}-${currentDate.toISOString()}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          {view === "month" ? (
            <MonthView
              currentMonth={currentDate}
              events={events}
              selectedDate={selectedDate}
              onDateSelect={onDateSelect}
              onEventClick={onEventClick}
            />
          ) : (
            <YearView
              currentYear={currentDate}
              events={events}
              selectedDate={selectedDate}
              onMonthSelect={(month) => {
                setCurrentDate(month);
                onDateSelect(month);
                onMonthChange?.(month);
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
