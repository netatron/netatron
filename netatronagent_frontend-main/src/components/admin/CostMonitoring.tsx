import { useState, useEffect } from "react";
import { DollarSign, TrendingUp, TrendingDown, Cloud, Cpu, Database, RefreshCw, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { GCPCostReport, OpenAIUsageReport } from "@/types/api";

export function CostMonitoring() {
  const [selectedPeriod, setSelectedPeriod] = useState("current");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gcpCosts, setGcpCosts] = useState<GCPCostReport | null>(null);
  const [openaiUsage, setOpenaiUsage] = useState<OpenAIUsageReport | null>(null);

  useEffect(() => {
    loadBillingData();
  }, [selectedPeriod]);

  const loadBillingData = async () => {
    try {
      setIsLoading(true);
      const [gcp, openai] = await Promise.all([
        api.getGCPCosts(selectedPeriod),
        api.getOpenAIUsage(selectedPeriod),
      ]);
      setGcpCosts(gcp);
      setOpenaiUsage(openai);
    } catch (error) {
      console.error("Failed to load billing data:", error);
      toast.error("Failed to load billing data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await api.refreshBilling();
      await loadBillingData();
      toast.success("Billing data refreshed");
    } catch (error) {
      console.error("Failed to refresh billing:", error);
      toast.error("Failed to refresh billing data. Please try again.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const percentChange = gcpCosts
    ? ((gcpCosts.total - gcpCosts.previous_month) / gcpCosts.previous_month * 100).toFixed(1)
    : "0";
  const budgetUsage = gcpCosts ? (gcpCosts.total / gcpCosts.budget * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Cost Monitoring</h3>
          <p className="text-sm text-muted-foreground">Track GCP billing and OpenAI token usage</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Month</SelectItem>
              <SelectItem value="last">Last Month</SelectItem>
              <SelectItem value="quarter">Last Quarter</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing || isLoading}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="gcp" className="space-y-6">
        <TabsList>
          <TabsTrigger value="gcp">
            <Cloud className="mr-2 h-4 w-4" />
            Google Cloud
          </TabsTrigger>
          <TabsTrigger value="openai">
            <Cpu className="mr-2 h-4 w-4" />
            OpenAI Usage
          </TabsTrigger>
        </TabsList>

        {/* GCP Billing Tab */}
        <TabsContent value="gcp" className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !gcpCosts ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No billing data available</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total Spending</CardDescription>
                      <CardTitle className="text-3xl flex items-baseline gap-2">
                        ${gcpCosts.total.toFixed(2)}
                        <Badge 
                          variant={Number(percentChange) > 0 ? "destructive" : "default"}
                          className="text-xs"
                        >
                          {Number(percentChange) > 0 ? (
                            <TrendingUp className="mr-1 h-3 w-3" />
                          ) : (
                            <TrendingDown className="mr-1 h-3 w-3" />
                          )}
                          {percentChange}%
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        vs ${gcpCosts.previous_month.toFixed(2)} last month
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Budget Usage</CardDescription>
                      <CardTitle className="text-3xl">{budgetUsage.toFixed(1)}%</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Progress value={budgetUsage} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        ${gcpCosts.total.toFixed(2)} of ${gcpCosts.budget} budget
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Projected Monthly</CardDescription>
                      <CardTitle className="text-3xl">
                        ${(gcpCosts.total * 1.2).toFixed(2)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Estimated based on current usage
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              {/* Service Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Service Breakdown</CardTitle>
                  <CardDescription>Cost distribution by GCP service</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {gcpCosts.services.map((service, index) => (
                      <motion.div
                        key={service.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-32 font-medium text-sm">{service.name}</div>
                          <div className="flex-1">
                            <Progress 
                              value={(service.cost / gcpCosts.total) * 100} 
                              className="h-2"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-4 ml-4">
                          <span className="font-medium w-20 text-right">${service.cost.toFixed(2)}</span>
                          <Badge 
                            variant={service.trend > 0 ? "destructive" : "default"}
                            className="w-16 justify-center"
                          >
                            {service.trend > 0 ? "+" : ""}{service.trend}%
                          </Badge>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* OpenAI Usage Tab */}
        <TabsContent value="openai" className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !openaiUsage ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Cpu className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No OpenAI usage data available</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Token Cost</CardDescription>
                    <CardTitle className="text-3xl">
                      ${openaiUsage.total_cost.toFixed(2)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">This billing period</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Input Tokens</CardDescription>
                    <CardTitle className="text-3xl">
                      {(openaiUsage.total_input_tokens / 1000).toFixed(0)}K
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Across all tenants</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Output Tokens</CardDescription>
                    <CardTitle className="text-3xl">
                      {(openaiUsage.total_output_tokens / 1000).toFixed(0)}K
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Across all tenants</p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-Tenant Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Token Usage by Tenant</CardTitle>
                  <CardDescription>OpenAI API usage breakdown per tenant and module</CardDescription>
                </CardHeader>
                <CardContent>
                  {openaiUsage.tenants.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No tenant usage data available
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Module</TableHead>
                          <TableHead className="text-right">Input Tokens</TableHead>
                          <TableHead className="text-right">Output Tokens</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {openaiUsage.tenants.map((tenant) => (
                          Object.entries(tenant.modules).map(([moduleId, data], idx) => (
                            <TableRow key={`${tenant.tenant_id}-${moduleId}`}>
                              {idx === 0 && (
                                <TableCell 
                                  rowSpan={Object.keys(tenant.modules).length}
                                  className="font-medium"
                                >
                                  {tenant.tenant_name}
                                </TableCell>
                              )}
                              <TableCell>
                                <Badge variant="outline">{moduleId.replace("_", " ")}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{data.input_tokens.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{data.output_tokens.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-medium">${data.cost.toFixed(2)}</TableCell>
                            </TableRow>
                          ))
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
