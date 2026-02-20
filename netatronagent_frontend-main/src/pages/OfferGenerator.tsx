import { useState } from "react";
import { Sparkles, Upload, Mail, Wand2, Edit3, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { OfferUploader } from "@/components/offer-generator/OfferUploader";
import { EmailConnector } from "@/components/offer-generator/EmailConnector";
import { OfferAnalyzer } from "@/components/offer-generator/OfferAnalyzer";
import { OfferPrompt } from "@/components/offer-generator/OfferPrompt";
import type { AnalyzedOffer, GeneratedOffer } from "@/components/offer-generator/types";
import { useAuthStore } from "@/stores/authStore";
import { Navigate } from "react-router-dom";

type Step = "upload" | "analyze" | "generate" | "edit";

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: "upload", label: "Import", icon: <Upload className="h-4 w-4" /> },
  { id: "analyze", label: "Analyze", icon: <Sparkles className="h-4 w-4" /> },
  { id: "generate", label: "Generate", icon: <Wand2 className="h-4 w-4" /> },
  { id: "edit", label: "Edit", icon: <Edit3 className="h-4 w-4" /> },
];

export default function OfferGenerator() {
  const { isAuthenticated, isLoading, token } = useAuthStore();
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [analyzedOffers, setAnalyzedOffers] = useState<AnalyzedOffer[]>([]);
  const [generatedOffer, setGeneratedOffer] = useState<GeneratedOffer | null>(null);
  const [isEmailConnected, setIsEmailConnected] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  if (isLoading && token) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleFilesUploaded = (files: File[]) => {
    setUploadedFiles(files);
  };

  const handleAnalysisComplete = (offers: AnalyzedOffer[]) => {
    setAnalyzedOffers(offers);
    setCurrentStep("generate");
  };

  const handleOfferGenerated = (offer: GeneratedOffer) => {
    setGeneratedOffer(offer);
    setCurrentStep("edit");
  };

  const canProceed = () => {
    switch (currentStep) {
      case "upload":
        return uploadedFiles.length > 0 || isEmailConnected;
      case "analyze":
        return analyzedOffers.length > 0;
      case "generate":
        return generatedOffer !== null;
      default:
        return false;
    }
  };

  const goToNextStep = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const goToPrevStep = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="AI Offer Generator" />
        <main className="flex-1 overflow-auto">
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        {/* Header */}
        <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                  <Wand2 className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                    AI Offer Generator
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Create professional offers powered by AI
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                Beta
              </Badge>
            </div>

            {/* Progress Steps */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                {STEPS.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => index <= stepIndex && setCurrentStep(step.id)}
                    disabled={index > stepIndex}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                      step.id === currentStep
                        ? "bg-primary text-primary-foreground"
                        : index < stepIndex
                        ? "bg-primary/20 text-primary hover:bg-primary/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.icon}
                    <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
                  </button>
                ))}
              </div>
              <Progress value={progress} className="h-1" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8">
          <AnimatePresence mode="wait">
            {currentStep === "upload" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="border-dashed">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" />
                        Upload Offers
                      </CardTitle>
                      <CardDescription>
                        Upload your archival offers or sample documents for AI analysis
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <OfferUploader
                        onFilesUploaded={handleFilesUploaded}
                        uploadedFiles={uploadedFiles}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-primary" />
                        Connect Email
                      </CardTitle>
                      <CardDescription>
                        Import offers directly from your mailbox
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <EmailConnector
                        isConnected={isEmailConnected}
                        onConnectionChange={setIsEmailConnected}
                      />
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}

            {currentStep === "analyze" && (
              <motion.div
                key="analyze"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <OfferAnalyzer
                  files={uploadedFiles}
                  isEmailConnected={isEmailConnected}
                  onAnalysisComplete={handleAnalysisComplete}
                />
              </motion.div>
            )}

            {currentStep === "generate" && (
              <motion.div
                key="generate"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <OfferPrompt
                  analyzedOffers={analyzedOffers}
                  onOfferGenerated={handleOfferGenerated}
                />
              </motion.div>
            )}

            {currentStep === "edit" && generatedOffer && (
              <motion.div
                key="edit"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <OfferCanvas offer={generatedOffer} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="outline"
              onClick={goToPrevStep}
              disabled={stepIndex === 0}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {currentStep !== "edit" && (
              <Button
                onClick={goToNextStep}
                disabled={!canProceed()}
                className="bg-gradient-to-r from-primary to-primary/80"
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {currentStep === "edit" && (
              <Button className="bg-gradient-to-r from-primary to-primary/80">
                <Download className="mr-2 h-4 w-4" />
                Export Offer
              </Button>
            )}
          </div>
        </div>
      </div>
        </main>
      </div>
    </div>
  );
}
