import { useState } from "react";
import { Mail, ChevronDown, ChevronUp, Check, Loader2, RefreshCw, Settings, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { EmailConfig } from "./types";

interface EmailConnectorProps {
  isConnected: boolean;
  onConnectionChange: (connected: boolean) => void;
}

const PROVIDERS = [
  { id: "gmail", name: "Gmail", icon: "📧", color: "text-red-500" },
  { id: "outlook", name: "Outlook", icon: "📬", color: "text-blue-500" },
  { id: "imap", name: "Custom IMAP", icon: "⚙️", color: "text-muted-foreground" },
] as const;

export function EmailConnector({ isConnected, onConnectionChange }: EmailConnectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [config, setConfig] = useState<Partial<EmailConfig>>({
    provider: "gmail",
    email: "",
  });
  const [imapSettings, setImapSettings] = useState({
    server: "",
    port: "993",
    ssl: true,
  });
  const [filters, setFilters] = useState({
    fromDate: "",
    keywords: "",
    onlyAttachments: true,
  });

  const handleConnect = async () => {
    if (!config.email) {
      toast.error("Please enter your email address");
      return;
    }

    setIsConnecting(true);
    
    // Simulate OAuth flow
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    setIsConnecting(false);
    onConnectionChange(true);
    setConfig((prev) => ({
      ...prev,
      isConnected: true,
      lastSync: new Date().toISOString(),
      offerCount: Math.floor(Math.random() * 50) + 10,
    }));
    toast.success("Email connected successfully!");
  };

  const handleDisconnect = () => {
    onConnectionChange(false);
    setConfig((prev) => ({ ...prev, isConnected: false }));
    toast.info("Email disconnected");
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    setIsSyncing(false);
    setConfig((prev) => ({
      ...prev,
      lastSync: new Date().toISOString(),
      offerCount: (prev.offerCount || 0) + Math.floor(Math.random() * 5),
    }));
    toast.success("Sync completed!");
  };

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      {isConnected ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Check className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{config.email}</p>
                <p className="text-xs text-muted-foreground">
                  {config.offerCount} offers found • Last sync:{" "}
                  {config.lastSync ? new Date(config.lastSync).toLocaleTimeString() : "Never"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {/* Provider Selection */}
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setConfig((prev) => ({ ...prev, provider: provider.id }))}
                className={`p-3 rounded-xl border text-center transition-all ${
                  config.provider === provider.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="text-2xl">{provider.icon}</span>
                <p className="text-sm font-medium mt-1">{provider.name}</p>
              </button>
            ))}
          </div>

          {/* Email Input */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={config.email}
              onChange={(e) => setConfig((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>

          {/* IMAP Settings (if custom) */}
          <AnimatePresence>
            {config.provider === "imap" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 pt-2"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>IMAP Server</Label>
                    <Input
                      placeholder="imap.example.com"
                      value={imapSettings.server}
                      onChange={(e) =>
                        setImapSettings((prev) => ({ ...prev, server: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input
                      placeholder="993"
                      value={imapSettings.port}
                      onChange={(e) =>
                        setImapSettings((prev) => ({ ...prev, port: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={imapSettings.ssl}
                    onCheckedChange={(checked) =>
                      setImapSettings((prev) => ({ ...prev, ssl: checked }))
                    }
                  />
                  <Label>Use SSL/TLS</Label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Advanced Filters */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Advanced Filters
            </span>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4 space-y-4">
          <div className="space-y-2">
            <Label>Search from date</Label>
            <Input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Keywords (comma separated)</Label>
            <Input
              placeholder="offer, quote, proposal"
              value={filters.keywords}
              onChange={(e) => setFilters((prev) => ({ ...prev, keywords: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={filters.onlyAttachments}
              onCheckedChange={(checked) =>
                setFilters((prev) => ({ ...prev, onlyAttachments: checked }))
              }
            />
            <Label>Only emails with attachments</Label>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Connect Button */}
      {!isConnected && (
        <Button
          className="w-full bg-gradient-to-r from-primary to-primary/80"
          onClick={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              Connect Email
            </>
          )}
        </Button>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          We only read emails containing offers. Your credentials are encrypted and stored securely.
        </p>
      </div>
    </div>
  );
}
