import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Calendar as CalendarIcon, LayoutGrid, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { LogPanel, useMockLogs } from "@/components/ui/log-panel";
import { ModuleControls, type ModuleStatus } from "@/components/ui/module-controls";
import { CalendarView, type CalendarEvent } from "@/components/calendar/CalendarView";
import {
  CalendarApiConfigDialog,
  type CalendarApiConfig,
} from "@/components/calendar/CalendarApiConfig";
import { EventDetailSheet } from "@/components/calendar/EventDetailSheet";
import { Badge } from "@/components/ui/badge";

// ============================================================================
// NETATRON SCHEDULE CALENDAR MODULE
// ============================================================================
// TODO: API_INTEGRATION - Connect to backend calendar sync API
// Endpoints:
//   GET  /api/v1/calendar/events - Fetch all synced events
//   POST /api/v1/calendar/sync   - Trigger calendar sync
//   POST /api/v1/calendar/events - Create new event
//   PUT  /api/v1/calendar/events/{id} - Update event
//   DELETE /api/v1/calendar/events/{id} - Delete event
// ============================================================================

// Mock events for demonstration
const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: "1",
    title: "Shopify Order #1234",
    description: "Order from John Doe - 3x Product A, 2x Product B",
    start: new Date(2025, 0, 15, 10, 0),
    end: new Date(2025, 0, 15, 11, 0),
    category: "orders",
    source: "shopify",
    metadata: { orderId: "1234", total: "$299.99" },
  },
  {
    id: "2",
    title: "Team Meeting",
    description: "Weekly sync with development team",
    start: new Date(2025, 0, 16, 14, 0),
    end: new Date(2025, 0, 16, 15, 0),
    category: "meetings",
    source: "google",
  },
  {
    id: "3",
    title: "Product Launch",
    description: "New product line launch event",
    start: new Date(2025, 0, 20, 9, 0),
    end: new Date(2025, 0, 20, 17, 0),
    allDay: true,
    category: "events",
    source: "custom",
  },
  {
    id: "4",
    title: "WooCommerce Sale",
    description: "Flash sale promotion",
    start: new Date(2025, 0, 18, 0, 0),
    end: new Date(2025, 0, 19, 23, 59),
    allDay: true,
    category: "promotions",
    source: "woocommerce",
  },
  {
    id: "5",
    title: "Client Call",
    description: "Quarterly review with ABC Corp",
    start: new Date(2025, 0, 17, 11, 0),
    end: new Date(2025, 0, 17, 12, 0),
    category: "meetings",
    source: "outlook",
  },
];

export default function ScheduleCalendar() {
  // ============================================================================
  // STATE
  // ============================================================================
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>(MOCK_EVENTS);
  const [apiConfigs, setApiConfigs] = useState<CalendarApiConfig[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEventSheetOpen, setIsEventSheetOpen] = useState(false);

  // Module control state
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>("idle");
  const { logs, clearLogs, addLog } = useMockLogs(moduleStatus === "running");

  // ============================================================================
  // DERIVED STATE
  // ============================================================================
  const connectedSources = useMemo(() => {
    const sources = new Set(events.map((e) => e.source).filter(Boolean));
    return Array.from(sources);
  }, [events]);

  const eventStats = useMemo(() => {
    const today = new Date();
    const thisMonth = events.filter(
      (e) =>
        e.start.getMonth() === today.getMonth() &&
        e.start.getFullYear() === today.getFullYear()
    );
    const upcoming = events.filter((e) => e.start > today);
    return {
      total: events.length,
      thisMonth: thisMonth.length,
      upcoming: upcoming.length,
    };
  }, [events]);

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsEventSheetOpen(true);
  };

  const handleEventEdit = (event: CalendarEvent) => {
    // TODO: API_INTEGRATION - Open edit modal and update via API
    addLog("info", `Editing event: ${event.title}`);
    toast({
      title: "Edit Event",
      description: "Event editing will be available with Chat Agent commands.",
    });
  };

  const handleEventDelete = (event: CalendarEvent) => {
    // TODO: API_INTEGRATION - Delete via API
    setEvents(events.filter((e) => e.id !== event.id));
    setIsEventSheetOpen(false);
    addLog("warning", `Deleted event: ${event.title}`);
    toast({
      title: "Event Deleted",
      description: `"${event.title}" has been removed.`,
    });
  };

  const handleSyncAll = async () => {
    // TODO: API_INTEGRATION - Trigger full sync
    addLog("info", "Starting full calendar sync...");
    setModuleStatus("running");

    // Simulate sync
    await new Promise((resolve) => setTimeout(resolve, 2000));

    addLog("success", `Synced ${events.length} events from ${connectedSources.length} sources`);
    setModuleStatus("idle");
    toast({
      title: "Sync Complete",
      description: `${events.length} events synchronized from ${connectedSources.length} sources.`,
    });
  };

  // Module controls
  const handleStart = async () => {
    setModuleStatus("running");
    addLog("info", "Starting calendar sync service...");
    addLog("info", `Connected sources: ${connectedSources.join(", ") || "None"}`);
    toast({ title: "Sync service started" });
  };

  const handlePause = async () => {
    setModuleStatus("paused");
    addLog("warning", "Calendar sync paused");
    toast({ title: "Sync paused" });
  };

  const handleResume = async () => {
    setModuleStatus("running");
    addLog("info", "Calendar sync resumed");
    toast({ title: "Sync resumed" });
  };

  const handleStop = async () => {
    setModuleStatus("stopped");
    addLog("error", "Calendar sync stopped");
    toast({ title: "Sync stopped", variant: "destructive" });
  };

  const handleExportLogs = () => {
    const logText = logs
      .map((l) => `[${l.timestamp.toISOString()}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendar-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        title="Netatron Schedule Calendar"
        description="Sync and manage calendar events from multiple sources with AI-powered automation."
        actions={
          <div className="flex items-center gap-3">
            <CalendarApiConfigDialog
              configs={apiConfigs}
              onConfigsChange={setApiConfigs}
            />
            <ModuleControls
              status={moduleStatus}
              onStart={handleStart}
              onPause={handlePause}
              onStop={handleStop}
              onResume={handleResume}
            />
          </div>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-foreground">{eventStats.total}</div>
            <div className="text-sm text-muted-foreground">Total Events</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary">{eventStats.thisMonth}</div>
            <div className="text-sm text-muted-foreground">This Month</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-accent">{eventStats.upcoming}</div>
            <div className="text-sm text-muted-foreground">Upcoming</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-success">{connectedSources.length}</div>
            <div className="text-sm text-muted-foreground">Connected Sources</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Calendar Card */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Calendar
            </CardTitle>
            <CardDescription>
              View and manage synced events from all connected sources
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {/* Connected Sources */}
            <div className="flex gap-1">
              {connectedSources.map((source) => (
                <Badge
                  key={source}
                  variant="outline"
                  className="text-xs bg-primary/10 text-primary border-primary/30"
                >
                  {source}
                </Badge>
              ))}
            </div>

            {/* View Toggle */}
            <Tabs value={view} onValueChange={(v) => setView(v as "month" | "year")}>
              <TabsList className="bg-muted">
                <TabsTrigger value="month" className="gap-1">
                  <LayoutGrid className="h-3 w-3" />
                  Month
                </TabsTrigger>
                <TabsTrigger value="year" className="gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Year
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Sync Button */}
            <Button variant="outline" size="sm" onClick={handleSyncAll} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <CalendarView
            events={events}
            view={view}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onEventClick={handleEventClick}
            onMonthChange={(date) => {
              addLog("info", `Navigated to ${date.toLocaleDateString()}`);
            }}
          />
        </CardContent>
      </Card>

      {/* AI Agent Integration Hint */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">
                AI-Powered Calendar Management
              </h4>
              <p className="text-sm text-muted-foreground">
                Use the Chat Agent to manage your calendar with natural language commands:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>• "Show me all events for next week"</li>
                <li>• "Schedule a meeting with the team on Friday at 2pm"</li>
                <li>• "Reschedule the client call to next Monday"</li>
                <li>• "Cancel all events from Shopify"</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Panel */}
      <LogPanel
        logs={logs}
        onClear={clearLogs}
        onExport={handleExportLogs}
        title="Calendar Sync Logs"
        maxHeight="250px"
      />

      {/* Event Detail Sheet */}
      <EventDetailSheet
        event={selectedEvent}
        isOpen={isEventSheetOpen}
        onClose={() => setIsEventSheetOpen(false)}
        onEdit={handleEventEdit}
        onDelete={handleEventDelete}
      />
    </div>
  );
}
