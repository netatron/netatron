import { motion } from "framer-motion";
import { BarChart3, FileText, TrendingUp, Calendar, DollarSign, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { EmailInvoiceRun } from "@/types/api";

interface InvoiceStatsProps {
  runs: EmailInvoiceRun[];
  invoiceStructure: Array<{ month: string; count: number }>;
  csvData: Record<string, unknown>[];
  totalRecords: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number;
  color?: "primary" | "success" | "warning" | "destructive";
}

function StatCard({ title, value, subtitle, icon: Icon, trend, color = "primary" }: StatCardProps) {
  const colorClasses = {
    primary: "text-primary bg-primary/10 border-primary/20",
    success: "text-success bg-success/10 border-success/20",
    warning: "text-warning bg-warning/10 border-warning/20",
    destructive: "text-destructive bg-destructive/10 border-destructive/20",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="relative overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
              {trend !== undefined && (
                <div className={`flex items-center gap-1 text-xs ${trend >= 0 ? "text-success" : "text-destructive"}`}>
                  <TrendingUp className={`h-3 w-3 ${trend < 0 ? "rotate-180" : ""}`} />
                  <span>{trend >= 0 ? "+" : ""}{trend}% vs ostatni miesiąc</span>
                </div>
              )}
            </div>
            <div className={`p-3 rounded-xl border ${colorClasses[color]}`}>
              <Icon className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function InvoiceStats({ runs, invoiceStructure, csvData, totalRecords }: InvoiceStatsProps) {
  // Calculate statistics
  const totalRuns = runs.length;
  const completedRuns = runs.filter(r => r.status === "completed").length;
  const failedRuns = runs.filter(r => r.status === "failed").length;
  const successRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0;

  const totalInvoices = invoiceStructure.reduce((sum, m) => sum + m.count, 0);
  const monthsWithInvoices = invoiceStructure.length;

  // Calculate financial stats from CSV data
  const calculateFinancialStats = () => {
    let totalAmount = 0;
    let vendors = new Set<string>();
    
    csvData.forEach(row => {
      const amount = parseFloat(String(row.amount || row.kwota || row.total || 0));
      if (!isNaN(amount)) totalAmount += amount;
      
      const vendor = String(row.vendor || row.dostawca || row.kontrahent || "");
      if (vendor) vendors.add(vendor);
    });

    return {
      totalAmount: totalAmount.toFixed(2),
      uniqueVendors: vendors.size,
    };
  };

  const { totalAmount, uniqueVendors } = calculateFinancialStats();

  // Find busiest month
  const busiestMonth = invoiceStructure.reduce(
    (max, m) => (m.count > (max?.count || 0) ? m : max),
    invoiceStructure[0]
  );

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Łącznie faktur"
          value={totalInvoices}
          subtitle={`${monthsWithInvoices} miesięcy z fakturami`}
          icon={FileText}
          color="primary"
        />
        <StatCard
          title="Rekordów CSV"
          value={totalRecords}
          subtitle="Przetworzonych wierszy"
          icon={BarChart3}
          color="success"
        />
        <StatCard
          title="Unikalnych dostawców"
          value={uniqueVendors}
          subtitle="Różnych kontrahentów"
          icon={Building2}
          color="warning"
        />
        <StatCard
          title="Suma kwot"
          value={`${totalAmount} PLN`}
          subtitle="Łączna wartość faktur"
          icon={DollarSign}
          color="primary"
        />
      </div>

      {/* Processing Stats */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Historia przetwarzania</CardTitle>
            <CardDescription>Statystyki uruchomień</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Łącznie uruchomień</span>
              <span className="font-medium">{totalRuns}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Zakończone sukcesem</span>
              <span className="font-medium text-success">{completedRuns}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Zakończone błędem</span>
              <span className="font-medium text-destructive">{failedRuns}</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Skuteczność</span>
                <span className="font-medium">{successRate}%</span>
              </div>
              <Progress value={successRate} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rozkład miesięczny</CardTitle>
            <CardDescription>Faktury według miesięcy</CardDescription>
          </CardHeader>
          <CardContent>
            {invoiceStructure.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Brak danych o fakturach</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[200px] overflow-y-auto">
                {invoiceStructure.map((item, index) => {
                  const percentage = totalInvoices > 0 ? (item.count / totalInvoices) * 100 : 0;
                  return (
                    <motion.div
                      key={item.month}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="space-y-1"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{item.month}</span>
                        <span className="font-medium">{item.count}</span>
                      </div>
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.5, delay: index * 0.05 }}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            item === busiestMonth ? "bg-primary" : "bg-primary/60"
                          }`}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ostatnie uruchomienia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runs.slice(0, 5).map((run, index) => (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      run.status === "completed" ? "bg-success" :
                      run.status === "running" ? "bg-primary animate-pulse" :
                      run.status === "failed" ? "bg-destructive" :
                      "bg-muted-foreground"
                    }`} />
                    <span className="text-sm">
                      {new Date(run.created_at).toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {run.processed_count} / {run.total_count}
                    </span>
                    <span className={`font-medium ${
                      run.status === "completed" ? "text-success" :
                      run.status === "failed" ? "text-destructive" :
                      "text-muted-foreground"
                    }`}>
                      {run.status}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
