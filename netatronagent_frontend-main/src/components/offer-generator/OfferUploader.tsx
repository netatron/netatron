import { useState, useCallback } from "react";
import { Upload, File, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface OfferUploaderProps {
  onFilesUploaded: (files: File[]) => void;
  uploadedFiles: File[];
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export function OfferUploader({ onFilesUploaded, uploadedFiles }: OfferUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      const validFiles: File[] = [];
      const errors: string[] = [];

      Array.from(files).forEach((file) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          errors.push(`${file.name}: Unsupported file type`);
          return;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: File too large (max 20MB)`);
          return;
        }
        validFiles.push(file);
      });

      if (errors.length > 0) {
        errors.forEach((error) => toast.error(error));
      }

      if (validFiles.length > 0) {
        // Simulate upload progress
        validFiles.forEach((file) => {
          let progress = 0;
          const interval = setInterval(() => {
            progress += Math.random() * 30;
            if (progress >= 100) {
              progress = 100;
              clearInterval(interval);
            }
            setUploadProgress((prev) => ({ ...prev, [file.name]: progress }));
          }, 200);
        });

        setTimeout(() => {
          onFilesUploaded([...uploadedFiles, ...validFiles]);
          toast.success(`${validFiles.length} file(s) uploaded successfully`);
        }, 1000);
      }
    },
    [uploadedFiles, onFilesUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
    },
    [processFiles]
  );

  const removeFile = (fileName: string) => {
    onFilesUploaded(uploadedFiles.filter((f) => f.name !== fileName));
    setUploadProgress((prev) => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <ImageIcon className="h-5 w-5 text-primary" />;
    }
    return <FileText className="h-5 w-5 text-primary" />;
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        }`}
      >
        <input
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <motion.div
          animate={{ scale: isDragging ? 1.1 : 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="p-4 rounded-full bg-primary/10">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="font-medium">Drag and drop your offers here</p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse • PDF, PNG, JPG, DOCX, PPTX
            </p>
          </div>
        </motion.div>
      </div>

      {/* Uploaded Files */}
      <AnimatePresence>
        {uploadedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <p className="text-sm font-medium text-muted-foreground">
              Uploaded files ({uploadedFiles.length})
            </p>
            {uploadedFiles.map((file) => (
              <motion.div
                key={file.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border"
              >
                {getFileIcon(file)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  {uploadProgress[file.name] !== undefined && uploadProgress[file.name] < 100 && (
                    <Progress value={uploadProgress[file.name]} className="h-1 mt-1" />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeFile(file.name)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
