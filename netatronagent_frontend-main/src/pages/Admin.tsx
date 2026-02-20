import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Users, DollarSign, Server, Terminal, Settings, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenantManagement, CostMonitoring, InfrastructureStatus, TenantLogs, PasswordSettings, CreateClient } from "@/components/admin";
import { useAuthStore } from "@/stores/authStore";

export default function Admin() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  useEffect(() => {
    // Redirect if user is not admin
    if (user && !user.is_admin) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  // Don't render if not admin
  if (!user?.is_admin) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Admin Panel"
        description="Manage tenants, monitor costs, and view infrastructure status"
      />

      <Tabs defaultValue="tenants" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="tenants">
            <Users className="mr-2 h-4 w-4" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="costs">
            <DollarSign className="mr-2 h-4 w-4" />
            Costs
          </TabsTrigger>
          <TabsTrigger value="infrastructure">
            <Server className="mr-2 h-4 w-4" />
            Infrastructure
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Terminal className="mr-2 h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="create-client">
            <Plus className="mr-2 h-4 w-4" />
            Create Client
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <TenantManagement />
        </TabsContent>

        <TabsContent value="costs">
          <CostMonitoring />
        </TabsContent>

        <TabsContent value="infrastructure">
          <InfrastructureStatus />
        </TabsContent>

        <TabsContent value="logs">
          <TenantLogs />
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-6">
            <PasswordSettings />
          </div>
        </TabsContent>

        <TabsContent value="create-client">
          <CreateClient />
        </TabsContent>
      </Tabs>
    </div>
  );
}
