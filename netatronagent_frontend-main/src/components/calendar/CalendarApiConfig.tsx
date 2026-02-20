import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Key,
  Link2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ============================================================================
// API INTEGRATION TYPES
// ============================================================================
export interface CalendarApiConfig {
  id: string;
  name: string;
  provider: CalendarProvider;
  apiKey?: string;
  apiSecret?: string;
  webhookUrl?: string;
  calendarId?: string;
  syncEnabled: boolean;
  lastSync?: Date;
  status: "connected" | "disconnected" | "error" | "syncing";
}

export type CalendarProvider =
  | "google_calendar"
  | "outlook"
  | "apple_calendar"
  | "caldav"
  | "shopify"
  | "woocommerce"
  | "custom";

const PROVIDER_CONFIG: Record<
  CalendarProvider,
  {
    name: string;
    color: string;
    icon: string;
    fields: string[];
    docUrl: string;
  }
> = {
  google_calendar: {
    name: "Google Calendar",
    color: "#4285F4",
    icon: "📅",
    fields: ["apiKey", "calendarId"],
    docUrl: "https://developers.google.com/calendar/api",
  },
  outlook: {
    name: "Microsoft Outlook",
    color: "#0078D4",
    icon: "📧",
    fields: ["apiKey", "apiSecret"],
    docUrl: "https://docs.microsoft.com/graph/api/resources/calendar",
  },
  apple_calendar: {
    name: "Apple Calendar",
    color: "#FF3B30",
    icon: "🍎",
    fields: ["apiKey", "calendarId"],
    docUrl: "https://developer.apple.com/documentation/eventkit",
  },
  caldav: {
    name: "CalDAV Server",
    color: "#8E44AD",
    icon: "🔗",
    fields: ["webhookUrl", "apiKey"],
    docUrl: "https://tools.ietf.org/html/rfc4791",
  },
  shopify: {
    name: "Shopify",
    color: "#96BF48",
    icon: "🛒",
    fields: ["apiKey", "apiSecret", "webhookUrl"],
    docUrl: "https://shopify.dev/docs/api",
  },
  woocommerce: {
    name: "WooCommerce",
    color: "#96588A",
    icon: "🛍️",
    fields: ["webhookUrl", "apiKey", "apiSecret"],
    docUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
  },
  custom: {
    name: "Custom API",
    color: "#718096",
    icon: "⚙️",
    fields: ["webhookUrl", "apiKey"],
    docUrl: "",
  },
};

// ============================================================================
// API CONFIG FORM
// ============================================================================
function ApiConfigForm({
  config,
  onSave,
  onCancel,
}: {
  config?: CalendarApiConfig;
  onSave: (config: Partial<CalendarApiConfig>) => void;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState<CalendarProvider>(
    config?.provider || "google_calendar"
  );
  const [name, setName] = useState(config?.name || "");
  const [apiKey, setApiKey] = useState(config?.apiKey || "");
  const [apiSecret, setApiSecret] = useState(config?.apiSecret || "");
  const [webhookUrl, setWebhookUrl] = useState(config?.webhookUrl || "");
  const [calendarId, setCalendarId] = useState(config?.calendarId || "");
  const [isTesting, setIsTesting] = useState(false);

  const providerConfig = PROVIDER_CONFIG[provider];

  const handleTest = async () => {
    setIsTesting(true);
    // TODO: API_INTEGRATION - Test API connection
    // const response = await calendarApi.testConnection({ provider, apiKey, ... });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsTesting(false);
    toast({
      title: "Connection Test",
      description: "API connection test successful!",
    });
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for this integration",
        variant: "destructive",
      });
      return;
    }

    onSave({
      id: config?.id || crypto.randomUUID(),
      name,
      provider,
      apiKey: apiKey || undefined,
      apiSecret: apiSecret || undefined,
      webhookUrl: webhookUrl || undefined,
      calendarId: calendarId || undefined,
      syncEnabled: true,
      status: "disconnected",
    });
  };

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div className="space-y-2">
        <Label>Calendar/E-commerce Provider</Label>
        <Select
          value={provider}
          onValueChange={(v) => setProvider(v as CalendarProvider)}
        >
          <SelectTrigger className="bg-input border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PROVIDER_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <span>{cfg.icon}</span>
                  <span>{cfg.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Integration Name */}
      <div className="space-y-2">
        <Label>Integration Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`My ${providerConfig.name} Calendar`}
          className="bg-input border-border"
        />
      </div>

      {/* Dynamic Fields Based on Provider */}
      {providerConfig.fields.includes("apiKey") && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Key
          </Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="bg-input border-border font-mono"
          />
        </div>
      )}

      {providerConfig.fields.includes("apiSecret") && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Secret
          </Label>
          <Input
            type="password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="Enter your API secret"
            className="bg-input border-border font-mono"
          />
        </div>
      )}

      {providerConfig.fields.includes("webhookUrl") && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Webhook / API URL
          </Label>
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://api.example.com/calendar"
            className="bg-input border-border font-mono"
          />
        </div>
      )}

      {providerConfig.fields.includes("calendarId") && (
        <div className="space-y-2">
          <Label>Calendar ID</Label>
          <Input
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            placeholder="primary"
            className="bg-input border-border"
          />
        </div>
      )}

      {/* Documentation Link */}
      {providerConfig.docUrl && (
        <a
          href={providerConfig.docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          View {providerConfig.name} API Documentation
        </a>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={isTesting}
          className="flex-1"
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            "Test Connection"
          )}
        </Button>
        <Button onClick={handleSave} className="flex-1">
          Save Integration
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// CONNECTED API CARD
// ============================================================================
function ConnectedApiCard({
  config,
  onEdit,
  onDelete,
  onSync,
}: {
  config: CalendarApiConfig;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
}) {
  const providerConfig = PROVIDER_CONFIG[config.provider];

  const statusColors = {
    connected: "bg-success/20 text-success border-success/30",
    disconnected: "bg-muted text-muted-foreground border-border",
    error: "bg-destructive/20 text-destructive border-destructive/30",
    syncing: "bg-primary/20 text-primary border-primary/30",
  };

  const StatusIcon =
    config.status === "connected"
      ? CheckCircle2
      : config.status === "error"
        ? AlertCircle
        : config.status === "syncing"
          ? Loader2
          : AlertCircle;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="p-4 rounded-lg border border-border bg-card/50 hover:bg-card/70 transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
            style={{ backgroundColor: `${providerConfig.color}20` }}
          >
            {providerConfig.icon}
          </div>
          <div>
            <div className="font-medium text-foreground">{config.name}</div>
            <div className="text-sm text-muted-foreground">
              {providerConfig.name}
            </div>
          </div>
        </div>

        <Badge className={cn("gap-1", statusColors[config.status])}>
          <StatusIcon
            className={cn(
              "h-3 w-3",
              config.status === "syncing" && "animate-spin"
            )}
          />
          {config.status}
        </Badge>
      </div>

      {config.lastSync && (
        <div className="mt-3 text-xs text-muted-foreground">
          Last synced: {config.lastSync.toLocaleString()}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Button variant="outline" size="sm" onClick={onSync} className="flex-1">
          <Loader2 className="h-3 w-3 mr-1" />
          Sync Now
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Settings className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN API CONFIG COMPONENT
// ============================================================================
interface CalendarApiConfigDialogProps {
  configs: CalendarApiConfig[];
  onConfigsChange: (configs: CalendarApiConfig[]) => void;
}

export function CalendarApiConfigDialog({
  configs,
  onConfigsChange,
}: CalendarApiConfigDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CalendarApiConfig | null>(
    null
  );
  const [isAddingNew, setIsAddingNew] = useState(false);

  const handleSave = (newConfig: Partial<CalendarApiConfig>) => {
    if (editingConfig) {
      // Update existing
      onConfigsChange(
        configs.map((c) =>
          c.id === editingConfig.id ? { ...c, ...newConfig } : c
        )
      );
    } else {
      // Add new
      onConfigsChange([...configs, newConfig as CalendarApiConfig]);
    }
    setEditingConfig(null);
    setIsAddingNew(false);
    toast({
      title: "Integration saved",
      description: "Calendar API integration has been saved successfully.",
    });
  };

  const handleDelete = (id: string) => {
    onConfigsChange(configs.filter((c) => c.id !== id));
    toast({
      title: "Integration removed",
      description: "Calendar API integration has been removed.",
    });
  };

  const handleSync = async (id: string) => {
    // TODO: API_INTEGRATION - Trigger sync
    // await calendarApi.syncCalendar(id);
    onConfigsChange(
      configs.map((c) =>
        c.id === id ? { ...c, status: "syncing" as const } : c
      )
    );

    // Simulate sync completion
    setTimeout(() => {
      onConfigsChange(
        configs.map((c) =>
          c.id === id
            ? { ...c, status: "connected" as const, lastSync: new Date() }
            : c
        )
      );
      toast({
        title: "Sync complete",
        description: "Calendar events have been synchronized.",
      });
    }, 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings className="h-4 w-4" />
          API Configuration
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Calendar API Integrations
          </DialogTitle>
          <DialogDescription>
            Connect your calendar or e-commerce platforms to sync events
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Connected Integrations */}
          {!isAddingNew && !editingConfig && (
            <>
              <AnimatePresence>
                {configs.map((config) => (
                  <ConnectedApiCard
                    key={config.id}
                    config={config}
                    onEdit={() => setEditingConfig(config)}
                    onDelete={() => handleDelete(config.id)}
                    onSync={() => handleSync(config.id)}
                  />
                ))}
              </AnimatePresence>

              {configs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Link2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No calendar integrations configured</p>
                  <p className="text-sm">
                    Add an integration to sync your calendar events
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => setIsAddingNew(true)}
                className="w-full gap-2 border-dashed"
              >
                <Plus className="h-4 w-4" />
                Add New Integration
              </Button>
            </>
          )}

          {/* Add/Edit Form */}
          {(isAddingNew || editingConfig) && (
            <ApiConfigForm
              config={editingConfig || undefined}
              onSave={handleSave}
              onCancel={() => {
                setEditingConfig(null);
                setIsAddingNew(false);
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
