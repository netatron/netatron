import { useState, useEffect } from "react";
import { Server, Database, GitBranch, PlayCircle, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { InfrastructureStatus } from "@/types/api";

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "running":
    case "succeeded":
    case "applied":
      return <CheckCircle className="h-4 w-4 text-success" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "pending":
      return <Clock className="h-4 w-4 text-warning" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  }
};

export function InfrastructureStatus() {
  const [status, setStatus] = useState<InfrastructureStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const loadStatus = async () => {
    try {
      setIsLoading(true);
      const data = await api.getInfrastructureStatus();
      setStatus(data);
      setLastUpdate(new Date(data.last_updated ? new Date(data.last_updated) : new Date()));
    } catch (error) {
      console.error("Failed to load infrastructure status:", error);
      toast.error("Failed to load infrastructure status. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load and auto-refresh every 30 seconds
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Infrastructure Status</h3>
          <p className="text-sm text-muted-foreground">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="cloudrun" className="space-y-6">
        <TabsList>
          <TabsTrigger value="cloudrun">
            <Server className="mr-2 h-4 w-4" />
            Cloud Run
          </TabsTrigger>
          <TabsTrigger value="sql">
            <Database className="mr-2 h-4 w-4" />
            Cloud SQL
          </TabsTrigger>
          <TabsTrigger value="migrations">
            <GitBranch className="mr-2 h-4 w-4" />
            Migrations
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <PlayCircle className="mr-2 h-4 w-4" />
            Jobs
          </TabsTrigger>
        </TabsList>

        {/* Cloud Run Services */}
        <TabsContent value="cloudrun" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !status || status.cloud_run_services.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Server className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No Cloud Run services found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {status.cloud_run_services.map((service, index) => (
                <motion.div
                  key={service.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <StatusIcon status={service.status} />
                          <div>
                            <CardTitle className="text-base">{service.name}</CardTitle>
                            <CardDescription>{service.region}</CardDescription>
                          </div>
                        </div>
                        <Badge variant={service.status === "running" ? "default" : "secondary"}>
                          {service.instances} instance{service.instances > 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">CPU Usage</p>
                          <Progress value={service.cpu_percent} className="h-2" />
                          <p className="text-xs font-medium">{service.cpu_percent}%</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Memory</p>
                          <Progress value={service.memory_percent} className="h-2" />
                          <p className="text-xs font-medium">{service.memory_percent}%</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Requests/min</p>
                          <p className="text-lg font-bold">{service.requests_per_minute}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Avg Latency</p>
                          <p className="text-lg font-bold">{service.avg_latency_ms}ms</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Cloud SQL */}
        <TabsContent value="sql" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !status || status.cloud_sql_instances.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Database className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No Cloud SQL instances found</p>
              </CardContent>
            </Card>
          ) : (
            status.cloud_sql_instances.map((instance) => (
              <Card key={instance.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusIcon status={instance.status} />
                      <div>
                        <CardTitle>{instance.name}</CardTitle>
                        <CardDescription>{instance.type} • {instance.tier}</CardDescription>
                      </div>
                    </div>
                    <Badge>{instance.region}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Storage</span>
                        <span>{instance.storage.used_gb} GB / {instance.storage.total_gb} GB</span>
                      </div>
                      <Progress value={(instance.storage.used_gb / instance.storage.total_gb) * 100} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Connections</span>
                        <span>{instance.connections.active} / {instance.connections.max}</span>
                      </div>
                      <Progress value={(instance.connections.active / instance.connections.max) * 100} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Migrations */}
        <TabsContent value="migrations">
          <Card>
            <CardHeader>
              <CardTitle>Database Migrations</CardTitle>
              <CardDescription>Alembic migration history</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !status || status.migrations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No migrations found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Status</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Applied At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.migrations.map((migration) => (
                      <TableRow key={migration.version}>
                        <TableCell>
                          <StatusIcon status={migration.status} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{migration.version}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{migration.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {migration.applied_at ? new Date(migration.applied_at).toLocaleString() : "N/A"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cloud Run Jobs */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>Cloud Run Jobs</CardTitle>
              <CardDescription>Scheduled and on-demand job executions</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !status || status.jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No jobs found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Status</TableHead>
                      <TableHead>Job Name</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">Executions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.jobs.map((job) => (
                      <TableRow key={job.name}>
                        <TableCell>
                          <StatusIcon status={job.status} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {job.name}
                          {job.error && (
                            <p className="text-xs text-destructive mt-1">{job.error}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {job.last_run ? new Date(job.last_run).toLocaleString() : "N/A"}
                        </TableCell>
                        <TableCell>{job.duration || "N/A"}</TableCell>
                        <TableCell className="text-right">{job.executions}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
