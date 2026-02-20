import { useState } from "react";
import { Building2, User, Mail, Lock, Globe, CheckSquare, Square, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface ComponentSelection {
  maps_scraper: boolean;
  kpo: boolean;
  email_invoices: boolean;
  schedule: boolean;
  chat_agent: boolean;
}

export function CreateClient() {
  const [companyName, setCompanyName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [domainName, setDomainName] = useState("");
  const [components, setComponents] = useState<ComponentSelection>({
    maps_scraper: true,
    kpo: true,
    email_invoices: true,
    schedule: true,
    chat_agent: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    client_id: string;
    company_name: string;
  } | null>(null);

  const handleComponentToggle = (component: keyof ComponentSelection) => {
    setComponents((prev) => ({
      ...prev,
      [component]: !prev[component],
    }));
  };

  const validateDomainName = (domain: string): boolean => {
    // Domain name validation: lowercase letters, numbers, hyphens only
    const domainRegex = /^[a-z0-9-]+$/;
    return domainRegex.test(domain) && domain.length >= 3 && domain.length <= 63;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }

    if (!username.trim()) {
      setError("Username is required");
      return;
    }

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setError("Valid email is required");
      return;
    }

    if (!domainName.trim()) {
      setError("Domain name is required");
      return;
    }

    if (!validateDomainName(domainName)) {
      setError("Domain name can only contain lowercase letters, numbers, and hyphens (3-63 characters)");
      return;
    }

    // Check if at least one component is selected
    const hasComponent = Object.values(components).some((v) => v);
    if (!hasComponent) {
      setError("At least one component must be selected");
      return;
    }

    setIsLoading(true);
    try {
      const result = await api.createClient({
        company_name: companyName,
        username,
        password,
        email,
        domain_name: domainName,
        components,
      });

      setSuccess({
        client_id: result.client_id,
        company_name: result.company_name,
      });

      // Reset form
      setCompanyName("");
      setUsername("");
      setPassword("");
      setEmail("");
      setDomainName("");
      setComponents({
        maps_scraper: true,
        kpo: true,
        email_invoices: true,
        schedule: true,
        chat_agent: true,
      });

      toast({
        title: "Tenant created successfully",
        description: `New tenant and user account created for ${result.company_name}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create client";
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Create New Tenant
          </CardTitle>
          <CardDescription>
            Create a new tenant with a user account. The tenant will have access to selected modules in the shared Netatron instance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">Tenant created successfully!</p>
                    <p>
                      <strong>Company:</strong> {success.company_name}
                    </p>
                    <p>
                      <strong>Tenant ID:</strong> {success.client_id}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      The user can now log in using the email and password provided above.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Company Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Company Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="company-name" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Company Name
                </Label>
                <Input
                  id="company-name"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corporation"
                  disabled={isLoading}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This name will be displayed in the client's Netatron instance
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain-name" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Domain Name
                </Label>
                <Input
                  id="domain-name"
                  type="text"
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="acme-corp"
                  disabled={isLoading}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier for this tenant (used as tenant_id in the system)
                </p>
              </div>
            </div>

            {/* User Credentials */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">User Credentials</h3>
              
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@acme.com"
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  disabled={isLoading}
                  required
                  minLength={6}
                />
              </div>
            </div>

            {/* Component Selection */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Select Modules</h3>
              <p className="text-sm text-muted-foreground">
                Choose which features to enable for this tenant
              </p>
              
              <div className="grid gap-4">
                <div className="flex items-center space-x-2 rounded-lg border p-4">
                  <Checkbox
                    id="maps-scraper"
                    checked={components.maps_scraper}
                    onCheckedChange={() => handleComponentToggle("maps_scraper")}
                    disabled={isLoading}
                  />
                  <Label htmlFor="maps-scraper" className="flex-1 cursor-pointer">
                    <div className="font-medium">Maps Scraper</div>
                    <div className="text-sm text-muted-foreground">
                      Google Maps business data scraping
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 rounded-lg border p-4">
                  <Checkbox
                    id="kpo"
                    checked={components.kpo}
                    onCheckedChange={() => handleComponentToggle("kpo")}
                    disabled={isLoading}
                  />
                  <Label htmlFor="kpo" className="flex-1 cursor-pointer">
                    <div className="font-medium">KPO</div>
                    <div className="text-sm text-muted-foreground">
                      KPO data processing and enrichment
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 rounded-lg border p-4">
                  <Checkbox
                    id="email-invoices"
                    checked={components.email_invoices}
                    onCheckedChange={() => handleComponentToggle("email_invoices")}
                    disabled={isLoading}
                  />
                  <Label htmlFor="email-invoices" className="flex-1 cursor-pointer">
                    <div className="font-medium">Email Invoices</div>
                    <div className="text-sm text-muted-foreground">
                      Email invoice processing and management
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 rounded-lg border p-4">
                  <Checkbox
                    id="schedule"
                    checked={components.schedule}
                    onCheckedChange={() => handleComponentToggle("schedule")}
                    disabled={isLoading}
                  />
                  <Label htmlFor="schedule" className="flex-1 cursor-pointer">
                    <div className="font-medium">Schedule</div>
                    <div className="text-sm text-muted-foreground">
                      Calendar and scheduling features
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 rounded-lg border p-4">
                  <Checkbox
                    id="chat-agent"
                    checked={components.chat_agent}
                    onCheckedChange={() => handleComponentToggle("chat_agent")}
                    disabled={isLoading}
                  />
                  <Label htmlFor="chat-agent" className="flex-1 cursor-pointer">
                    <div className="font-medium">Chat Agent</div>
                    <div className="text-sm text-muted-foreground">
                      AI-powered chat assistant
                    </div>
                  </Label>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full" size="lg">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating tenant...
                </>
              ) : (
                <>
                  <Building2 className="mr-2 h-4 w-4" />
                  Create Tenant
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

