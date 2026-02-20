import { useState } from "react";
import { motion } from "framer-motion";
import { 
  BarChart3, 
  FileText, 
  Terminal, 
  FolderOpen, 
  Table2,
  Activity,
  FileCode2
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceStats } from "./InvoiceStats";
import { InvoiceSystem } from "./InvoiceSystem";
import { FileExplorer } from "./FileExplorer";
import { KsefConverter } from "./KsefConverter";
import { LogPanel, type LogEntry } from "@/components/ui/log-panel";
import { CsvResultsPreview } from "@/components/ui/csv-results-preview";
import type { EmailInvoiceRun, EmailInvoiceConfig } from "@/types/api";
import type { ModuleStatus } from "@/components/ui/module-controls";

interface InvoiceDashboardProps {
  // Data
  runs: EmailInvoiceRun[];
  selectedConfig: EmailInvoiceConfig | null;
  currentRunId: string | null;
  moduleStatus: ModuleStatus;
  
  // Invoice structure
  invoiceStructure: Array<{ month: string; count: number }>;
  selectedMonth: string | null;
  monthInvoices: Array<{ id: string; filename: string; vendor: string; amount: number; date: string }>;
  onMonthSelect: (month: string) => void;
  
  // Logs
  logs: LogEntry[];
  onClearLogs: () => void;
  onExportLogs: () => void;
  
  // File explorer
  fileExplorerPath: string;
  fileExplorerEntries: Array<{ name: string; path: string; type: "dir" | "file"; size: number; modified: number }>;
  isLoadingFiles: boolean;
  onNavigateFiles: (path: string) => void;
  onDownloadFile?: (path: string, filename: string) => void;
  onDownloadZip?: (path: string) => void;
  
  // CSV Preview
  csvResults: Record<string, unknown>[];
  csvTotal: number;
  isLoadingCsv: boolean;
  csvPage: number;
  onCsvPageChange: (page: number) => void;
  onDownloadCsv: () => void;
}

interface TabConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export function InvoiceDashboard({
  runs,
  selectedConfig,
  currentRunId,
  moduleStatus,
  invoiceStructure,
  selectedMonth,
  monthInvoices,
  onMonthSelect,
  logs,
  onClearLogs,
  onExportLogs,
  fileExplorerPath,
  fileExplorerEntries,
  isLoadingFiles,
  onNavigateFiles,
  onDownloadFile,
  onDownloadZip,
  csvResults,
  csvTotal,
  isLoadingCsv,
  csvPage,
  onCsvPageChange,
  onDownloadCsv,
}: InvoiceDashboardProps) {
  const [activeTab, setActiveTab] = useState("stats");

  const tabs: TabConfig[] = [
    { id: "stats", label: "Statystyki", icon: BarChart3 },
    { id: "invoices", label: "System Faktur", icon: FileText, badge: invoiceStructure.reduce((s, m) => s + m.count, 0) },
    { id: "ksef", label: "Konwerter KSEF", icon: FileCode2 },
    { id: "logs", label: "Logi", icon: Terminal, badge: logs.length },
    { id: "files", label: "Pliki", icon: FolderOpen, badge: fileExplorerEntries.filter(e => e.type === "file").length },
    { id: "csv", label: "CSV Preview", icon: Table2, badge: csvTotal },
  ];

  const isActive = moduleStatus === "running";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="grid grid-cols-6 w-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2 px-4">
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/20 text-primary tabular-nums">
                    {tab.badge > 999 ? "999+" : tab.badge}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {isActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <Activity className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-sm font-medium text-primary">Przetwarzanie...</span>
            </div>
          )}
        </div>

        <TabsContent value="stats" className="mt-0">
          <InvoiceStats
            runs={runs}
            invoiceStructure={invoiceStructure}
            csvData={csvResults}
            totalRecords={csvTotal}
          />
        </TabsContent>

        <TabsContent value="invoices" className="mt-0">
          <InvoiceSystem
            invoiceStructure={invoiceStructure}
            monthInvoices={monthInvoices}
            selectedMonth={selectedMonth}
            onMonthSelect={onMonthSelect}
          />
        </TabsContent>

        <TabsContent value="ksef" className="mt-0">
          <KsefConverter />
        </TabsContent>

        <TabsContent value="logs" className="mt-0">
          <LogPanel
            logs={logs}
            onClear={onClearLogs}
            onExport={onExportLogs}
            title="Email Processing Logs"
            maxHeight="600px"
            collapsible={false}
          />
        </TabsContent>

        <TabsContent value="files" className="mt-0">
          <FileExplorer
            path={fileExplorerPath}
            entries={fileExplorerEntries}
            isLoading={isLoadingFiles}
            onNavigate={onNavigateFiles}
            onDownload={onDownloadFile}
            onDownloadZip={onDownloadZip}
          />
        </TabsContent>

        <TabsContent value="csv" className="mt-0">
          {csvTotal > 0 || isLoadingCsv ? (
            <CsvResultsPreview
              data={csvResults}
              total={csvTotal}
              isLoading={isLoadingCsv && csvTotal === 0}
              isLive={isActive}
              onDownload={onDownloadCsv}
              onPageChange={onCsvPageChange}
              currentPage={csvPage}
              pageSize={100}
              title="Email Invoices CSV Preview"
            />
          ) : (
            <div className="text-center py-16 px-4 border rounded-lg bg-muted/10">
              <Table2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium text-muted-foreground">Brak danych CSV</p>
              <p className="text-sm text-muted-foreground mt-1">
                Dane pojawią się tutaj po przetworzeniu faktur
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
