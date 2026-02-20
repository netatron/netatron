import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileText, 
  Calendar, 
  ChevronRight, 
  Search, 
  Filter,
  Download,
  Eye,
  Building2,
  DollarSign
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface InvoiceSystemProps {
  invoiceStructure: Array<{ month: string; count: number }>;
  monthInvoices: Array<{ id: string; filename: string; vendor: string; amount: number; date: string }>;
  selectedMonth: string | null;
  onMonthSelect: (month: string) => void;
  onInvoiceDownload?: (invoiceId: string) => void;
}

export function InvoiceSystem({
  invoiceStructure,
  monthInvoices,
  selectedMonth,
  onMonthSelect,
  onInvoiceDownload,
}: InvoiceSystemProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "vendor">("date");

  // Filter invoices by search query
  const filteredInvoices = monthInvoices.filter(inv =>
    inv.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.vendor.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort invoices
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    switch (sortBy) {
      case "date":
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      case "amount":
        return b.amount - a.amount;
      case "vendor":
        return a.vendor.localeCompare(b.vendor);
      default:
        return 0;
    }
  });

  const totalMonthAmount = monthInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Months List */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Miesiące
          </CardTitle>
          <CardDescription>Wybierz miesiąc do przeglądania</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {invoiceStructure.length === 0 ? (
              <div className="text-center py-12 px-4 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Brak przetworzonych faktur</p>
                <p className="text-xs mt-1">Uruchom przetwarzanie aby zobaczyć faktury</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {invoiceStructure.map((item, index) => (
                  <motion.button
                    key={item.month}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => onMonthSelect(item.month)}
                    className={`
                      w-full flex items-center justify-between p-3 rounded-lg transition-all
                      ${selectedMonth === item.month 
                        ? "bg-primary text-primary-foreground shadow-md" 
                        : "hover:bg-muted/50"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        p-2 rounded-lg 
                        ${selectedMonth === item.month 
                          ? "bg-primary-foreground/20" 
                          : "bg-muted"
                        }
                      `}>
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="font-medium">{item.month}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={selectedMonth === item.month ? "secondary" : "outline"}
                        className="tabular-nums"
                      >
                        {item.count}
                      </Badge>
                      <ChevronRight className={`h-4 w-4 transition-transform ${
                        selectedMonth === item.month ? "rotate-90" : ""
                      }`} />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Invoices List */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {selectedMonth ? `Faktury - ${selectedMonth}` : "Faktury"}
              </CardTitle>
              {selectedMonth && (
                <CardDescription>
                  {monthInvoices.length} faktur • Suma: {totalMonthAmount.toFixed(2)} PLN
                </CardDescription>
              )}
            </div>
            {selectedMonth && monthInvoices.length > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Eksportuj
                </Button>
              </div>
            )}
          </div>
          
          {selectedMonth && monthInvoices.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Szukaj faktury..."
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1 border rounded-lg p-1">
                {(["date", "vendor", "amount"] as const).map((sort) => (
                  <Button
                    key={sort}
                    variant={sortBy === sort ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setSortBy(sort)}
                    className="h-7 px-2 text-xs"
                  >
                    {sort === "date" && "Data"}
                    {sort === "vendor" && "Dostawca"}
                    {sort === "amount" && "Kwota"}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!selectedMonth ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Wybierz miesiąc</p>
              <p className="text-sm mt-1">Kliknij na miesiąc z listy aby zobaczyć faktury</p>
            </div>
          ) : monthInvoices.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Brak faktur w tym miesiącu</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <AnimatePresence mode="popLayout">
                <div className="space-y-2">
                  {sortedInvoices.map((invoice, index) => (
                    <motion.div
                      key={invoice.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.02 }}
                      className="group flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{invoice.filename}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {invoice.vendor || "Nieznany"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(invoice.date).toLocaleDateString("pl-PL")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold flex items-center gap-1">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            {invoice.amount.toFixed(2)} PLN
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            title="Podgląd"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => onInvoiceDownload?.(invoice.id)}
                            title="Pobierz"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
