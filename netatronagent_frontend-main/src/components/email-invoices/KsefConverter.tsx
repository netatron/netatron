import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Image,
  File,
  X,
  Download,
  Loader2,
  FileCode2,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  status: "pending" | "processing" | "completed" | "error";
  progress: number;
  xmlResult?: string;
  error?: string;
}

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
};

const getFileIcon = (type: string) => {
  if (type.startsWith("image/")) {
    return <Image className="h-5 w-5 text-purple-500" />;
  }
  if (type === "application/pdf") {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  return <File className="h-5 w-5 text-blue-500" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export function KsefConverter() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const validateFile = (file: File): boolean => {
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      toast({
        title: "Plik za duży",
        description: `${file.name} przekracza limit 20MB`,
        variant: "destructive",
      });
      return false;
    }

    const acceptedMimeTypes = Object.keys(ACCEPTED_TYPES);
    if (!acceptedMimeTypes.includes(file.type)) {
      toast({
        title: "Nieobsługiwany format",
        description: `${file.name} - akceptowane: obrazy, PDF, TXT, CSV`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles = fileArray.filter(validateFile);

    const uploadedFiles: UploadedFile[] = validFiles.map((file) => {
      const uploadedFile: UploadedFile = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: "pending",
        progress: 0,
      };

      // Create preview for images
      if (file.type.startsWith("image/")) {
        uploadedFile.preview = URL.createObjectURL(file);
      }

      return uploadedFile;
    });

    setFiles((prev) => [...prev, ...uploadedFiles]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        addFiles(selectedFiles);
      }
      // Reset input
      e.target.value = "";
    },
    [addFiles]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    files.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setFiles([]);
  }, [files]);

  const convertToKsef = async () => {
    if (files.length === 0) {
      toast({
        title: "Brak plików",
        description: "Dodaj pliki do konwersji",
        variant: "destructive",
      });
      return;
    }

    setIsConverting(true);

    // Simulate conversion process
    // TODO: Replace with actual API call to backend conversion service
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.status === "completed") continue;

      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, status: "processing", progress: 0 } : f
        )
      );

      // Simulate progress
      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, progress } : f))
        );
      }

      // Generate mock KSEF XML
      const mockXml = generateMockKsefXml(file.file.name);

      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? { ...f, status: "completed", progress: 100, xmlResult: mockXml }
            : f
        )
      );
    }

    setIsConverting(false);
    toast({
      title: "Konwersja zakończona",
      description: `Przekonwertowano ${files.length} plików do formatu KSEF XML`,
    });
  };

  const downloadXml = (file: UploadedFile) => {
    if (!file.xmlResult) return;

    const blob = new Blob([file.xmlResult], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.file.name.replace(/\.[^/.]+$/, "")}_ksef.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllXml = () => {
    const completedFiles = files.filter((f) => f.status === "completed" && f.xmlResult);
    if (completedFiles.length === 0) return;

    // Download each file
    completedFiles.forEach((file) => {
      downloadXml(file);
    });

    toast({
      title: "Pobieranie",
      description: `Pobrano ${completedFiles.length} plików XML`,
    });
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const completedCount = files.filter((f) => f.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300 cursor-pointer",
          isDragOver
            ? "border-primary border-2 bg-primary/5 scale-[1.01]"
            : "border-dashed border-2 hover:border-primary/50 hover:bg-muted/30"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById("ksef-file-input")?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <input
            id="ksef-file-input"
            type="file"
            multiple
            accept={Object.entries(ACCEPTED_TYPES)
              .flatMap(([mime, exts]) => [mime, ...exts])
              .join(",")}
            onChange={handleFileInput}
            className="hidden"
          />

          <motion.div
            animate={{
              scale: isDragOver ? 1.1 : 1,
              y: isDragOver ? -5 : 0,
            }}
            className={cn(
              "p-4 rounded-full mb-4 transition-colors",
              isDragOver ? "bg-primary/20" : "bg-muted"
            )}
          >
            <Upload
              className={cn(
                "h-8 w-8 transition-colors",
                isDragOver ? "text-primary" : "text-muted-foreground"
              )}
            />
          </motion.div>

          <h3 className="text-lg font-semibold mb-2">
            {isDragOver ? "Upuść pliki tutaj" : "Przeciągnij pliki lub kliknij"}
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Akceptowane formaty: obrazy (JPG, PNG, WebP, GIF), PDF, pliki tekstowe (TXT, CSV)
          </p>
          <p className="text-xs text-muted-foreground mt-1">Maksymalnie 20MB na plik</p>
        </CardContent>
      </Card>

      {/* Files List */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileCode2 className="h-5 w-5" />
                  Pliki do konwersji
                </CardTitle>
                <CardDescription>
                  {files.length} plików • {completedCount} ukończonych • {pendingCount} oczekujących
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {completedCount > 0 && (
                  <Button variant="outline" size="sm" onClick={downloadAllXml} className="gap-2">
                    <Download className="h-4 w-4" />
                    Pobierz wszystkie XML
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={clearAll} className="gap-2 text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Wyczyść
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <AnimatePresence mode="popLayout">
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <motion.div
                      key={file.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-lg border transition-colors",
                        file.status === "completed" && "bg-success/5 border-success/20",
                        file.status === "error" && "bg-destructive/5 border-destructive/20",
                        file.status === "processing" && "bg-primary/5 border-primary/20"
                      )}
                    >
                      {/* Preview/Icon */}
                      <div className="shrink-0">
                        {file.preview ? (
                          <img
                            src={file.preview}
                            alt={file.file.name}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                            {getFileIcon(file.file.type)}
                          </div>
                        )}
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{file.file.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.file.size)}
                          </span>
                          <Badge
                            variant={
                              file.status === "completed"
                                ? "default"
                                : file.status === "error"
                                ? "destructive"
                                : file.status === "processing"
                                ? "secondary"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {file.status === "pending" && "Oczekuje"}
                            {file.status === "processing" && "Przetwarzanie..."}
                            {file.status === "completed" && "Gotowe"}
                            {file.status === "error" && "Błąd"}
                          </Badge>
                        </div>
                        {file.status === "processing" && (
                          <Progress value={file.progress} className="h-1.5 mt-2" />
                        )}
                      </div>

                      {/* Status Icon & Actions */}
                      <div className="flex items-center gap-2">
                        {file.status === "completed" && (
                          <>
                            <CheckCircle2 className="h-5 w-5 text-success" />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => downloadXml(file)}
                              title="Pobierz XML"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {file.status === "processing" && (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        )}
                        {file.status === "error" && (
                          <AlertCircle className="h-5 w-5 text-destructive" />
                        )}
                        {file.status !== "processing" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeFile(file.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            </ScrollArea>

            {/* Convert Button */}
            <div className="mt-6 flex justify-center">
              <Button
                size="lg"
                onClick={convertToKsef}
                disabled={isConverting || files.length === 0 || pendingCount === 0}
                className="gap-2 min-w-[200px]"
              >
                {isConverting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Konwertowanie...
                  </>
                ) : (
                  <>
                    <FileCode2 className="h-5 w-5" />
                    Konwertuj do KSEF XML
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <FileCode2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-medium text-sm">O formacie KSEF XML</h4>
              <p className="text-xs text-muted-foreground">
                KSeF (Krajowy System e-Faktur) to polski system wymiany faktur elektronicznych.
                Konwerter automatycznie rozpoznaje dane z faktur i tworzy pliki XML zgodne ze
                schematem FA(2) wymaganym przez KSeF.
              </p>
              <p className="text-xs text-muted-foreground">
                Obsługiwane są faktury w formie obrazów (skan, zdjęcie), plików PDF oraz danych tekstowych.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Mock KSEF XML generator - replace with actual OCR/AI extraction
function generateMockKsefXml(filename: string): string {
  const date = new Date().toISOString().split("T")[0];
  const invoiceNumber = `FV/${Date.now().toString().slice(-6)}/${new Date().getFullYear()}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>2</WariantFormularza>
    <DataWytworzeniaFa>${date}T12:00:00Z</DataWytworzeniaFa>
    <SystemInfo>Konwerter KSEF - ${filename}</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>0000000000</NIP>
      <Nazwa>Nazwa Sprzedawcy</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Przykładowa 1</AdresL1>
      <AdresL2>00-000 Warszawa</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>0000000000</NIP>
      <Nazwa>Nazwa Nabywcy</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Testowa 2</AdresL1>
      <AdresL2>00-001 Warszawa</AdresL2>
    </Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${date}</P_1>
    <P_2>${invoiceNumber}</P_2>
    <P_13_1>100.00</P_13_1>
    <P_14_1>23.00</P_14_1>
    <P_15>123.00</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie>
        <P_19N>1</P_19N>
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </PMarzy>
    </Adnotacje>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługa / Towar z faktury</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>1</P_8B>
      <P_9A>100.00</P_9A>
      <P_11>100.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`;
}
