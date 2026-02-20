import { motion } from "framer-motion";
import { 
  Folder, 
  File, 
  ChevronRight, 
  Home, 
  Download, 
  FileText,
  Image,
  FileSpreadsheet,
  Loader2,
  FolderOpen,
  Archive
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface FileEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
  modified: number;
}

interface FileExplorerProps {
  path: string;
  entries: FileEntry[];
  isLoading: boolean;
  onNavigate: (path: string) => void;
  onDownload?: (path: string, filename: string) => void;
  onDownloadZip?: (path: string) => void;
}

const getFileIcon = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return <FileText className="h-5 w-5 text-red-500" />;
    case "csv":
    case "xlsx":
    case "xls":
      return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "webp":
      return <Image className="h-5 w-5 text-purple-500" />;
    default:
      return <File className="h-5 w-5 text-muted-foreground" />;
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function FileExplorer({ path, entries, isLoading, onNavigate, onDownload, onDownloadZip }: FileExplorerProps) {
  // Parse path into breadcrumb parts
  const pathParts = path ? path.split("/").filter(Boolean) : [];
  
  // Separate directories and files
  const directories = entries.filter(e => e.type === "dir");
  const files = entries.filter(e => e.type === "file");

  // Calculate totals
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Eksplorator plików
            </CardTitle>
            <CardDescription>
              {directories.length} katalogów • {files.length} plików • {formatFileSize(totalSize)}
            </CardDescription>
          </div>
          {onDownloadZip && (files.length > 0 || directories.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadZip(path)}
              className="gap-2"
              title="Pobierz wszystkie pliki jako ZIP"
            >
              <Archive className="h-4 w-4" />
              <span className="hidden sm:inline">Pobierz ZIP</span>
            </Button>
          )}
        </div>
        
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mt-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink 
                onClick={() => onNavigate("")}
                className="flex items-center gap-1 cursor-pointer hover:text-foreground"
              >
                <Home className="h-4 w-4" />
                Root
              </BreadcrumbLink>
            </BreadcrumbItem>
            {pathParts.map((part, index) => (
              <BreadcrumbItem key={index}>
                <BreadcrumbSeparator />
                <BreadcrumbLink
                  onClick={() => onNavigate(pathParts.slice(0, index + 1).join("/"))}
                  className="cursor-pointer hover:text-foreground"
                >
                  {part}
                </BreadcrumbLink>
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 px-4 text-muted-foreground">
            <Folder className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Katalog pusty</p>
            <p className="text-sm mt-1">Pliki pojawią się tutaj po przetworzeniu</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="divide-y divide-border/50">
              {/* Parent directory link */}
              {path && (
                <button
                  onClick={() => {
                    const parentPath = pathParts.slice(0, -1).join("/");
                    onNavigate(parentPath);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-muted">
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </div>
                  <span className="text-muted-foreground">..</span>
                </button>
              )}

              {/* Directories */}
              {directories.map((entry, index) => (
                <motion.button
                  key={entry.path}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => onNavigate(entry.path)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Folder className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate group-hover:text-primary transition-colors">
                      {entry.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(entry.modified)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </motion.button>
              ))}

              {/* Files */}
              {files.map((entry, index) => (
                <motion.div
                  key={entry.path}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (directories.length + index) * 0.02 }}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-muted/50">
                    {getFileIcon(entry.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(entry.size)} • {formatDate(entry.modified)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onDownload?.(entry.path, entry.name)}
                    title="Pobierz"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
