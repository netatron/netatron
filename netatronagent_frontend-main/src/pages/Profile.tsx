import { useState } from "react";
import { 
  User, Mail, Calendar, Zap, Database, Clock, 
  CreditCard, Shield, Bell, Palette, Globe, Key,
  BarChart3, TrendingUp, Activity
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/authStore";
import { useTheme } from "@/hooks/use-theme";
import { motion } from "framer-motion";

// Mock usage data
const usageData = {
  apiCalls: { used: 8420, limit: 10000, percentage: 84.2 },
  storage: { used: 2.4, limit: 5, unit: "GB", percentage: 48 },
  jobs: { used: 156, limit: 500, percentage: 31.2 },
  scrapes: { used: 1250, limit: 2000, percentage: 62.5 },
};

const recentActivity = [
  { action: "Google Maps scrape completed", time: "2 min ago", type: "success" },
  { action: "Deep Search query executed", time: "15 min ago", type: "info" },
  { action: "Calendar synced with Google", time: "1 hour ago", type: "success" },
  { action: "Email invoices processed", time: "3 hours ago", type: "success" },
  { action: "API rate limit warning", time: "Yesterday", type: "warning" },
];

export default function Profile() {
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Profile"
        description="Manage your account settings and view usage statistics"
      />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Profile Card */}
            <Card className="md:col-span-1">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <Avatar className="h-24 w-24 border-2 border-primary/30">
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="mt-4 text-lg font-semibold">{user?.name || "User"}</h3>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <Badge variant="secondary" className="mt-2">Pro Plan</Badge>
                  
                  <Separator className="my-4" />
                  
                  <div className="w-full space-y-2 text-left text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Joined December 2024</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="h-4 w-4" />
                      <span>Europe/Warsaw</span>
                    </div>
                  </div>
                  
                  <Button variant="outline" className="mt-4 w-full">
                    Edit Profile
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Quick Stats
                </CardTitle>
                <CardDescription>Your account activity at a glance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <motion.div 
                    className="rounded-lg border border-border bg-card/50 p-4"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">API Calls</span>
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{usageData.apiCalls.used.toLocaleString()}</p>
                    <Progress value={usageData.apiCalls.percentage} className="mt-2 h-1" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {usageData.apiCalls.percentage}% of {usageData.apiCalls.limit.toLocaleString()} limit
                    </p>
                  </motion.div>

                  <motion.div 
                    className="rounded-lg border border-border bg-card/50 p-4"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Storage Used</span>
                      <Database className="h-4 w-4 text-accent" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{usageData.storage.used} GB</p>
                    <Progress value={usageData.storage.percentage} className="mt-2 h-1" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {usageData.storage.percentage}% of {usageData.storage.limit} GB limit
                    </p>
                  </motion.div>

                  <motion.div 
                    className="rounded-lg border border-border bg-card/50 p-4"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Jobs Executed</span>
                      <Activity className="h-4 w-4 text-success" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{usageData.jobs.used}</p>
                    <Progress value={usageData.jobs.percentage} className="mt-2 h-1" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {usageData.jobs.percentage}% of {usageData.jobs.limit} limit
                    </p>
                  </motion.div>

                  <motion.div 
                    className="rounded-lg border border-border bg-card/50 p-4"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Scrapes This Month</span>
                      <TrendingUp className="h-4 w-4 text-warning" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{usageData.scrapes.used.toLocaleString()}</p>
                    <Progress value={usageData.scrapes.percentage} className="mt-2 h-1" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {usageData.scrapes.percentage}% of {usageData.scrapes.limit.toLocaleString()} limit
                    </p>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${
                        activity.type === "success" ? "bg-success" :
                        activity.type === "warning" ? "bg-warning" : "bg-primary"
                      }`} />
                      <span className="text-sm">{activity.action}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{activity.time}</span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>API Usage</CardTitle>
                <CardDescription>Track your API call consumption</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Calls this month</span>
                    <span className="font-medium">{usageData.apiCalls.used.toLocaleString()} / {usageData.apiCalls.limit.toLocaleString()}</span>
                  </div>
                  <Progress value={usageData.apiCalls.percentage} />
                </div>
                <Separator />
                <div className="text-sm text-muted-foreground">
                  <p>Resets on January 1, 2025</p>
                  <p className="mt-1">Average daily usage: ~280 calls</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Storage</CardTitle>
                <CardDescription>Monitor your storage allocation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Storage used</span>
                    <span className="font-medium">{usageData.storage.used} GB / {usageData.storage.limit} GB</span>
                  </div>
                  <Progress value={usageData.storage.percentage} />
                </div>
                <Separator />
                <div className="text-sm text-muted-foreground">
                  <p>Results: 1.8 GB</p>
                  <p>Exports: 0.4 GB</p>
                  <p>Cached data: 0.2 GB</p>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Usage by Module</CardTitle>
                <CardDescription>Breakdown of resource consumption per module</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { name: "Google Maps", usage: 42, color: "bg-primary" },
                    { name: "Deep Search", usage: 28, color: "bg-accent" },
                    { name: "KPO Scraper", usage: 18, color: "bg-success" },
                    { name: "Email Invoices", usage: 12, color: "bg-warning" },
                  ].map((module) => (
                    <div key={module.name} className="rounded-lg border border-border bg-card/50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{module.name}</span>
                        <span className="text-sm text-muted-foreground">{module.usage}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-muted">
                        <div 
                          className={`h-full rounded-full ${module.color}`}
                          style={{ width: `${module.usage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Appearance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Appearance
                </CardTitle>
                <CardDescription>Customize how Netatron looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">Toggle between light and dark theme</p>
                  </div>
                  <Switch 
                    checked={theme === "dark"} 
                    onCheckedChange={toggleTheme}
                  />
                </div>
                <Separator />
                <div className="opacity-50 pointer-events-none">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Compact Mode</Label>
                      <p className="text-sm text-muted-foreground">Reduce spacing and padding</p>
                    </div>
                    <Switch disabled />
                  </div>
                  <Badge variant="outline" className="mt-2">Coming Soon</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notifications
                </CardTitle>
                <CardDescription>Manage notification preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive job completions via email</p>
                  </div>
                  <Switch 
                    checked={emailNotifications} 
                    onCheckedChange={setEmailNotifications}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">Browser push notifications</p>
                  </div>
                  <Switch 
                    checked={pushNotifications} 
                    onCheckedChange={setPushNotifications}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security
                </CardTitle>
                <CardDescription>Manage your account security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="opacity-50 pointer-events-none">
                  <div className="space-y-2">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                    <Button variant="outline" size="sm" disabled>Enable 2FA</Button>
                  </div>
                  <Badge variant="outline" className="mt-2">Coming Soon</Badge>
                </div>
                <Separator />
                <div className="opacity-50 pointer-events-none">
                  <div className="space-y-2">
                    <Label>API Keys</Label>
                    <p className="text-sm text-muted-foreground">Manage your API access tokens</p>
                    <Button variant="outline" size="sm" disabled>
                      <Key className="mr-2 h-4 w-4" />
                      Manage Keys
                    </Button>
                  </div>
                  <Badge variant="outline" className="mt-2">Coming Soon</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Account */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Account
                </CardTitle>
                <CardDescription>Manage your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input defaultValue={user?.name || ""} placeholder="Your name" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue={user?.email || ""} placeholder="your@email.com" disabled />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <Button variant="outline" className="w-full">Save Changes</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div>
                  <h3 className="text-lg font-semibold">Pro Plan</h3>
                  <p className="text-sm text-muted-foreground">$49/month • Billed monthly</p>
                </div>
                <Badge className="bg-primary">Active</Badge>
              </div>
              
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="text-center">
                  <p className="text-2xl font-bold">10,000</p>
                  <p className="text-sm text-muted-foreground">API Calls/month</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">5 GB</p>
                  <p className="text-sm text-muted-foreground">Storage</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">Unlimited</p>
                  <p className="text-sm text-muted-foreground">Team Members</p>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="opacity-50 pointer-events-none">
                <div className="flex gap-4">
                  <Button variant="outline" disabled>Change Plan</Button>
                  <Button variant="outline" disabled>View Invoices</Button>
                  <Button variant="outline" disabled>Update Payment</Button>
                </div>
                <Badge variant="outline" className="mt-4">Billing Management Coming Soon</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
