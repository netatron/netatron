import { useState, useRef, useEffect } from "react";
import { Terminal, Search, Download, Filter, RefreshCw, Pause, Play, AlertCircle, Info, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { LogEntry, Tenant, InfrastructureStatus } from "@/types/api";

const LogLevelIcon = ({ level }: { level: LogLevel }) => {
  switch (level) {
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    default:
      return <Info className="h-4 w-4 text-primary" />;
  }
};

export function TenantLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [selectedService, setSelectedService] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load tenants and services on mount
  useEffect(() => {
    loadTenants();
    loadServices();
  }, []);

  // Load logs when filters change or streaming
  useEffect(() => {
    loadLogs();
    if (isStreaming) {
      const interval = setInterval(loadLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedTenant, selectedService, selectedLevel, searchQuery, isStreaming]);

  const loadTenants = async () => {
    try {
      const data = await api.listTenants();
      setTenants(data);
    } catch (error) {
      console.error("Failed to load tenants:", error);
    }
  };

  const loadServices = async () => {
    try {
      const status = await api.getInfrastructureStatus();
      const serviceNames = status.cloud_run_services.map(s => s.name);
      setServices(serviceNames);
    } catch (error) {
      console.error("Failed to load services:", error);
      // Fallback to default services
      setServices(["netatron-api", "netatron-ui", "n8n-automation"]);
    }
  };

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const params = {
        tenant_id: selectedTenant !== "all" ? selectedTenant : undefined,
        service: selectedService !== "all" ? selectedService : undefined,
        level: selectedLevel !== "all" ? selectedLevel as "info" | "warning" | "error" : undefined,
        search: searchQuery || undefined,
        limit: 100,
      };
      const data = await api.getTenantLogs(params);
      setLogs(data);
    } catch (error) {
      console.error("Failed to load logs:", error);
      toast.error("Failed to load logs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-scroll to top when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (selectedTenant !== "all" && log.tenant_id !== selectedTenant) return false;
    if (selectedService !== "all" && log.service !== selectedService) return false;
    if (selectedLevel !== "all" && log.level !== selectedLevel) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleDownload = () => {
    const content = filteredLogs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.service}] ${log.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.txt`;
    a.click();
  };

  const handleRefresh = () => {
    loadLogs();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Tenant Logs</h3>
          <p className="text-sm text-muted-foreground">Real-time Cloud Run logs for all tenants</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Switch
              id="auto-scroll"
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
            />
            <Label htmlFor="auto-scroll" className="text-sm">Auto-scroll</Label>
          </div>
          <Button
            variant={isStreaming ? "destructive" : "default"}
            onClick={() => setIsStreaming(!isStreaming)}
          >
            {isStreaming ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Stop Stream
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Stream
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedTenant} onValueChange={setSelectedTenant}>
              <SelectTrigger>
                <SelectValue placeholder="Tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tenants</SelectItem>
                {tenants.map(tenant => (
                  <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger>
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                {services.map(service => (
                  <SelectItem key={service} value={service}>{service}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <Badge variant="outline">{filteredLogs.length} logs</Badge>
              <Badge variant="outline" className="text-destructive border-destructive">
                {filteredLogs.filter(l => l.level === "error").length} errors
              </Badge>
              <Badge variant="outline" className="text-warning border-warning">
                {filteredLogs.filter(l => l.level === "warning").length} warnings
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Viewer */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <CardTitle className="text-base">Log Stream</CardTitle>
            {isStreaming && (
              <Badge variant="default" className="animate-pulse">
                Live
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-[500px] rounded-md border bg-card/50 p-4 font-mono text-sm">
              <div ref={scrollRef}>
                <AnimatePresence initial={false}>
                  {filteredLogs.map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0 ${
                      log.level === "error" ? "bg-destructive/5" : 
                      log.level === "warning" ? "bg-warning/5" : ""
                    }`}
                  >
                    <LogLevelIcon level={log.level} />
                    <span className="text-muted-foreground w-44 shrink-0">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {log.service}
                    </Badge>
                    {log.tenant_id && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {log.tenant_name || log.tenant_id}
                      </Badge>
                    )}
                    <span className={`flex-1 ${
                      log.level === "error" ? "text-destructive" :
                      log.level === "warning" ? "text-warning" : ""
                    }`}>
                      {log.message}
                    </span>
                  </motion.div>
                ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
          </CardContent>
      </Card>
    </div>
  );
}
