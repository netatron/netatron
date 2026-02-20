import { useState, useEffect } from "react";
import { Sparkles, Check, Eye, Palette, Type, Layout, FileText, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AnalyzedOffer } from "./types";

interface OfferAnalyzerProps {
  files: File[];
  isEmailConnected: boolean;
  onAnalysisComplete: (offers: AnalyzedOffer[]) => void;
}

const ANALYSIS_STEPS = [
  { id: "extract", label: "Extracting content", icon: FileText },
  { id: "colors", label: "Analyzing colors", icon: Palette },
  { id: "fonts", label: "Detecting fonts", icon: Type },
  { id: "layout", label: "Understanding layout", icon: Layout },
  { id: "style", label: "Identifying style", icon: Sparkles },
];

export function OfferAnalyzer({ files, isEmailConnected, onAnalysisComplete }: OfferAnalyzerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [analyzedOffers, setAnalyzedOffers] = useState<AnalyzedOffer[]>([]);
  const [selectedOffers, setSelectedOffers] = useState<Set<string>>(new Set());

  const totalSources = files.length + (isEmailConnected ? 1 : 0);
  const progress = (currentStep / ANALYSIS_STEPS.length) * 100;

  const startAnalysis = async () => {
    setIsAnalyzing(true);
    setCurrentStep(0);

    // Simulate step-by-step analysis
    for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setCurrentStep(i + 1);
    }

    // Generate mock analyzed offers
    const mockOffers: AnalyzedOffer[] = files.map((file, index) => ({
      id: `offer-${index}`,
      name: file.name,
      source: "upload" as const,
      analysis: {
        style: ["Modern", "Corporate", "Minimalist", "Bold"][Math.floor(Math.random() * 4)],
        colors: ["#3B82F6", "#10B981", "#F59E0B", "#EF4444"].slice(0, Math.floor(Math.random() * 3) + 2),
        fonts: ["Inter", "Roboto", "Open Sans", "Montserrat"].slice(0, 2),
        layout: ["Two-column", "Grid", "Single column", "Hero header"][Math.floor(Math.random() * 4)],
        sections: ["Header", "Services", "Pricing", "Contact", "Footer"].slice(0, Math.floor(Math.random() * 3) + 3),
        tone: ["Professional", "Friendly", "Formal", "Creative"][Math.floor(Math.random() * 4)],
      },
    }));

    if (isEmailConnected) {
      mockOffers.push({
        id: "email-offer-1",
        name: "Email: Project Proposal.pdf",
        source: "email",
        analysis: {
          style: "Corporate",
          colors: ["#1E40AF", "#64748B"],
          fonts: ["Arial", "Georgia"],
          layout: "Two-column",
          sections: ["Introduction", "Scope", "Timeline", "Budget"],
          tone: "Formal",
        },
      });
    }

    setAnalyzedOffers(mockOffers);
    setSelectedOffers(new Set(mockOffers.map((o) => o.id)));
    setIsAnalyzing(false);
  };

  const toggleSelection = (offerId: string) => {
    setSelectedOffers((prev) => {
      const next = new Set(prev);
      if (next.has(offerId)) {
        next.delete(offerId);
      } else {
        next.add(offerId);
      }
      return next;
    });
  };

  const handleContinue = () => {
    const selected = analyzedOffers.filter((o) => selectedOffers.has(o.id));
    onAnalysisComplete(selected);
  };

  useEffect(() => {
    if (files.length > 0 || isEmailConnected) {
      startAnalysis();
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Analysis Progress */}
      {isAnalyzing && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              Analyzing Your Offers
            </CardTitle>
            <CardDescription>
              AI is extracting design patterns from {totalSources} source(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={progress} className="h-2" />
            
            <div className="grid gap-3">
              {ANALYSIS_STEPS.map((step, index) => {
                const StepIcon = step.icon;
                const isComplete = currentStep > index;
                const isCurrent = currentStep === index;

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      isComplete
                        ? "bg-primary/10"
                        : isCurrent
                        ? "bg-muted"
                        : "opacity-50"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        isComplete
                          ? "bg-primary text-primary-foreground"
                          : isCurrent
                          ? "bg-muted-foreground/20"
                          : "bg-muted"
                      }`}
                    >
                      {isComplete ? (
                        <Check className="h-4 w-4" />
                      ) : isCurrent ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <StepIcon className="h-4 w-4" />
                      )}
                    </div>
                    <span className="font-medium">{step.label}</span>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analyzed Results */}
      {!isAnalyzing && analyzedOffers.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Analysis Complete</h3>
              <p className="text-sm text-muted-foreground">
                Select the offers to use as inspiration
              </p>
            </div>
            <Badge variant="secondary">
              {selectedOffers.size} of {analyzedOffers.length} selected
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {analyzedOffers.map((offer, index) => (
              <motion.div
                key={offer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={`cursor-pointer transition-all ${
                    selectedOffers.has(offer.id)
                      ? "ring-2 ring-primary"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => toggleSelection(offer.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1 rounded ${
                            selectedOffers.has(offer.id)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <Check className="h-4 w-4" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">{offer.name}</CardTitle>
                          <Badge variant="outline" className="text-xs mt-1">
                            {offer.source === "email" ? "📧 Email" : "📁 Upload"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Style */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Style</span>
                        <Badge>{offer.analysis.style}</Badge>
                      </div>

                      {/* Colors */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Colors</span>
                        <div className="flex gap-1">
                          {offer.analysis.colors.map((color) => (
                            <div
                              key={color}
                              className="w-5 h-5 rounded-full border"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Fonts */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Fonts</span>
                        <span className="font-medium">{offer.analysis.fonts.join(", ")}</span>
                      </div>

                      {/* Layout */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Layout</span>
                        <span>{offer.analysis.layout}</span>
                      </div>

                      {/* Sections */}
                      <div className="flex flex-wrap gap-1 pt-2">
                        {offer.analysis.sections.map((section) => (
                          <Badge key={section} variant="secondary" className="text-xs">
                            {section}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleContinue}
              disabled={selectedOffers.size === 0}
              className="bg-gradient-to-r from-primary to-primary/80"
            >
              Continue with {selectedOffers.size} offer(s)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
