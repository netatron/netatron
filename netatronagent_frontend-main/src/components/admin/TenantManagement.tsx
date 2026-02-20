import { useState, useEffect } from "react";
import { Plus, Building2, Settings, Trash2, Eye, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Tenant } from "@/types/api";

// Available modules for tenants - mapped to CreateClient components
const AVAILABLE_MODULES = [
  { id: "maps_scraper", label: "Maps Scraper", description: "Google Maps business data scraping", componentKey: "maps_scraper" },
  { id: "kpo", label: "KPO", description: "KPO data processing and enrichment", componentKey: "kpo" },
  { id: "email_invoices", label: "Email Invoices", description: "Email invoice processing and management", componentKey: "email_invoices" },
  { id: "schedule", label: "Schedule", description: "Calendar and scheduling features", componentKey: "schedule" },
  { id: "chat_agent", label: "Chat Agent", description: "AI-powered chat assistant", componentKey: "chat_agent" },
];

export function TenantManagement() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTenant, setNewTenant] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    domainName: "",
    modules: [] as string[],
  });

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setIsLoading(true);
      const data = await api.listTenants();
      setTenants(data);
    } catch (error) {
      console.error("Failed to load tenants:", error);
      toast.error("Failed to load tenants. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleModuleToggle = (moduleId: string) => {
    setNewTenant(prev => ({
      ...prev,
      modules: prev.modules.includes(moduleId)
        ? prev.modules.filter(m => m !== moduleId)
        : [...prev.modules, moduleId]
    }));
  };

  const handleCreateTenant = async () => {
    if (!newTenant.name || !newTenant.email || !newTenant.username || !newTenant.password || !newTenant.domainName) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (newTenant.password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    // Validate domain name
    const domainRegex = /^[a-z0-9-]+$/;
    if (!domainRegex.test(newTenant.domainName) || newTenant.domainName.length < 3 || newTenant.domainName.length > 63) {
      toast.error("Domain name can only contain lowercase letters, numbers, and hyphens (3-63 characters)");
      return;
    }

    if (newTenant.modules.length === 0) {
      toast.error("Please select at least one module");
      return;
    }
    
    try {
      setIsCreating(true);
      
      // Map modules to components format
      const components = {
        maps_scraper: newTenant.modules.includes("maps_scraper"),
        kpo: newTenant.modules.includes("kpo"),
        email_invoices: newTenant.modules.includes("email_invoices"),
        schedule: newTenant.modules.includes("schedule"),
        chat_agent: newTenant.modules.includes("chat_agent"),
      };

      const client = await api.createClient({
        company_name: newTenant.name,
        username: newTenant.username,
        password: newTenant.password,
        email: newTenant.email,
        domain_name: newTenant.domainName,
        components,
      });
      
      // Reload tenants list
      await loadTenants();
      
      setNewTenant({ name: "", email: "", username: "", password: "", domainName: "", modules: [] });
      setIsCreateOpen(false);
      toast.success(`Client "${client.company_name}" created successfully! Service URL: ${client.service_url}`);
    } catch (error) {
      console.error("Failed to create client:", error);
      const message = error instanceof Error ? error.message : "Failed to create client. Please try again.";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTenant = async (tenantId: string) => {
    if (!confirm("Are you sure you want to delete this tenant? This action cannot be undone.")) {
      return;
    }
    
    try {
      await api.deleteTenant(tenantId);
      setTenants(prev => prev.filter(t => t.id !== tenantId));
      toast.success("Tenant deleted successfully");
    } catch (error) {
      console.error("Failed to delete tenant:", error);
      toast.error("Failed to delete tenant. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Tenant Management</h3>
          <p className="text-sm text-muted-foreground">Create and manage tenant organizations</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Client</DialogTitle>
              <DialogDescription>
                Create a new client instance with their own Cloud Run service and selected components
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant-name">Company Name *</Label>
                  <Input
                    id="tenant-name"
                    placeholder="e.g., Acme Corporation"
                    value={newTenant.name}
                    onChange={(e) => setNewTenant(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    This name will be displayed in the client's Netatron instance
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain-name">Domain Name *</Label>
                  <Input
                    id="domain-name"
                    placeholder="acme-corp"
                    value={newTenant.domainName}
                    onChange={(e) => setNewTenant(prev => ({ ...prev, domainName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used for Cloud Run service: netatron-{newTenant.domainName || "..."}.run.app
                  </p>
                </div>
              </div>

              <Separator />

              {/* User Credentials */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">User Credentials</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tenant-email">Email *</Label>
                    <Input
                      id="tenant-email"
                      type="email"
                      placeholder="admin@company.com"
                      value={newTenant.email}
                      onChange={(e) => setNewTenant(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tenant-username">Username *</Label>
                    <Input
                      id="tenant-username"
                      placeholder="admin"
                      value={newTenant.username}
                      onChange={(e) => setNewTenant(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="tenant-password">Password *</Label>
                    <Input
                      id="tenant-password"
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={newTenant.password}
                      onChange={(e) => setNewTenant(prev => ({ ...prev, password: e.target.value }))}
                      minLength={6}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Module Selection */}
              <div className="space-y-4">
                <div>
                  <Label className="text-base">Select Modules</Label>
                  <p className="text-sm text-muted-foreground">Choose which features to enable for this tenant</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {AVAILABLE_MODULES.map((module) => (
                    <motion.div
                      key={module.id}
                      whileHover={{ scale: 1.02 }}
                      className={`flex items-start space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                        newTenant.modules.includes(module.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => handleModuleToggle(module.id)}
                    >
                      <Checkbox
                        checked={newTenant.modules.includes(module.id)}
                        onCheckedChange={() => handleModuleToggle(module.id)}
                      />
                      <div className="flex-1">
                        <Label className="cursor-pointer font-medium">{module.label}</Label>
                        <p className="text-xs text-muted-foreground mt-1">{module.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button onClick={handleCreateTenant} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Create Client
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tenants Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No tenants found. Create your first tenant to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tenants.map((tenant, index) => (
          <motion.div
            key={tenant.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{tenant.name}</CardTitle>
                      <CardDescription className="text-xs">{tenant.email}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={tenant.status === "active" ? "default" : "secondary"}>
                    {tenant.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Active Modules</p>
                    <div className="flex flex-wrap gap-1">
                      {tenant.enabled_modules && tenant.enabled_modules.length > 0 ? (
                        tenant.enabled_modules.map((moduleId) => {
                          const module = AVAILABLE_MODULES.find(m => m.id === moduleId);
                          return module ? (
                            <Badge key={moduleId} variant="outline" className="text-xs">
                              {module.label}
                            </Badge>
                          ) : null;
                        })
                      ) : (
                        <span className="text-xs text-muted-foreground">No modules enabled</span>
                      )}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Created: {new Date(tenant.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteTenant(tenant.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
        </div>
      )}
    </div>
  );
}
