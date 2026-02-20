import { useState, useRef, useEffect } from "react";
import { Wand2, Sparkles, Copy, RotateCcw, Loader2, Lightbulb, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AnalyzedOffer, GeneratedOffer, OfferElement } from "./types";

interface OfferPromptProps {
  analyzedOffers: AnalyzedOffer[];
  onOfferGenerated: (offer: GeneratedOffer) => void;
}

const PROMPT_SUGGESTIONS = [
  "Create a modern tech company proposal with clean lines",
  "Design a luxury real estate offer with gold accents",
  "Build a creative agency quote with bold typography",
  "Make a professional consulting proposal",
  "Generate a minimalist SaaS pricing offer",
];

const STYLE_PRESETS = [
  { id: "copy", label: "Exact Copy", description: "Replicate the style 1:1" },
  { id: "inspired", label: "Inspired", description: "Use as inspiration" },
  { id: "modern", label: "Modernize", description: "Update to 2025 trends" },
  { id: "minimal", label: "Minimize", description: "Strip to essentials" },
];

export function OfferPrompt({ analyzedOffers, onOfferGenerated }: OfferPromptProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [streamedContent, setStreamedContent] = useState<string[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("inspired");
  const [creativity, setCreativity] = useState([50]);
  const [selectedInspiration, setSelectedInspiration] = useState(analyzedOffers[0]?.id || "");
  const streamRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGenerationProgress(0);
    setStreamedContent([]);

    // Simulate AI streaming generation
    const steps = [
      "🎨 Analyzing style preferences...",
      "📐 Creating layout structure...",
      "🎯 Positioning header elements...",
      "💼 Adding company branding area...",
      "📝 Generating content sections...",
      "💰 Building pricing table...",
      "📞 Adding contact information...",
      "✨ Applying final polish...",
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setStreamedContent((prev) => [...prev, steps[i]]);
      setGenerationProgress(((i + 1) / steps.length) * 100);
    }

    // Generate mock offer
    const selectedOffer = analyzedOffers.find((o) => o.id === selectedInspiration);
    const mockOffer: GeneratedOffer = {
      id: `generated-${Date.now()}`,
      title: "New Offer",
      width: 800,
      height: 1100,
      backgroundColor: "#FFFFFF",
      elements: generateMockElements(selectedOffer),
      style: {
        primaryColor: selectedOffer?.analysis.colors[0] || "#3B82F6",
        secondaryColor: selectedOffer?.analysis.colors[1] || "#64748B",
        accentColor: "#F59E0B",
        fontFamily: selectedOffer?.analysis.fonts[0] || "Inter",
        headingFont: selectedOffer?.analysis.fonts[1] || "Inter",
      },
    };

    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsGenerating(false);
    onOfferGenerated(mockOffer);
  };

  const generateMockElements = (inspiration?: AnalyzedOffer): OfferElement[] => {
    const primaryColor = inspiration?.analysis.colors[0] || "#3B82F6";
    
    return [
      // Header background
      {
        id: "header-bg",
        type: "shape",
        x: 0,
        y: 0,
        width: 800,
        height: 200,
        backgroundColor: primaryColor,
        borderRadius: 0,
      },
      // Logo placeholder
      {
        id: "logo",
        type: "shape",
        x: 40,
        y: 40,
        width: 120,
        height: 60,
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
      },
      // Title
      {
        id: "title",
        type: "text",
        x: 40,
        y: 120,
        width: 720,
        height: 50,
        content: "Business Proposal",
        fontSize: 36,
        fontFamily: "Inter",
        fontWeight: "bold",
        color: "#FFFFFF",
      },
      // Subtitle
      {
        id: "subtitle",
        type: "text",
        x: 40,
        y: 170,
        width: 720,
        height: 30,
        content: "Prepared for: [Client Name]",
        fontSize: 16,
        fontFamily: "Inter",
        color: "rgba(255,255,255,0.8)",
      },
      // Main content area
      {
        id: "content-title",
        type: "text",
        x: 40,
        y: 240,
        width: 720,
        height: 40,
        content: "Executive Summary",
        fontSize: 24,
        fontFamily: "Inter",
        fontWeight: "bold",
        color: "#1E293B",
      },
      // Content text
      {
        id: "content-text",
        type: "text",
        x: 40,
        y: 290,
        width: 720,
        height: 100,
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
        fontSize: 14,
        fontFamily: "Inter",
        color: "#64748B",
      },
      // Pricing section
      {
        id: "pricing-bg",
        type: "shape",
        x: 40,
        y: 420,
        width: 720,
        height: 150,
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
      },
      {
        id: "pricing-title",
        type: "text",
        x: 60,
        y: 440,
        width: 680,
        height: 30,
        content: "Investment",
        fontSize: 20,
        fontFamily: "Inter",
        fontWeight: "bold",
        color: "#1E293B",
      },
      {
        id: "pricing-amount",
        type: "text",
        x: 60,
        y: 480,
        width: 680,
        height: 50,
        content: "$12,500",
        fontSize: 42,
        fontFamily: "Inter",
        fontWeight: "bold",
        color: primaryColor,
      },
    ];
  };

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [streamedContent]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Configuration */}
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inspiration Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedInspiration} onValueChange={setSelectedInspiration}>
              <SelectTrigger>
                <SelectValue placeholder="Select offer" />
              </SelectTrigger>
              <SelectContent>
                {analyzedOffers.map((offer) => (
                  <SelectItem key={offer.id} value={offer.id}>
                    {offer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2">
              <Label>Style Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedStyle(preset.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedStyle === preset.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <p className="text-sm font-medium">{preset.label}</p>
                    <p className="text-xs text-muted-foreground">{preset.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Creativity Level</Label>
                <span className="text-sm text-muted-foreground">{creativity[0]}%</span>
              </div>
              <Slider
                value={creativity}
                onValueChange={setCreativity}
                max={100}
                step={10}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Suggestions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-warning" />
              Quick Prompts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {PROMPT_SUGGESTIONS.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setPrompt(suggestion)}
                  className="w-full text-left text-sm p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Prompt & Generation */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Generate Your Offer
            </CardTitle>
            <CardDescription>
              Describe what you want to create, and AI will generate it live
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Describe your offer... e.g., 'Create a professional IT services proposal with our company colors, including sections for scope, timeline, and pricing'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[120px] resize-none"
              disabled={isGenerating}
            />

            <div className="flex items-center gap-2">
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="flex-1 bg-gradient-to-r from-primary to-primary/80"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Offer
                  </>
                )}
              </Button>
              {prompt && !isGenerating && (
                <Button variant="outline" onClick={() => setPrompt("")}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Generation Stream */}
        <AnimatePresence>
          {(isGenerating || streamedContent.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="overflow-hidden border-primary/20">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      AI Generation
                    </CardTitle>
                    {isGenerating && (
                      <Badge variant="secondary" className="animate-pulse">
                        Live
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]" ref={streamRef}>
                    <div className="space-y-2 font-mono text-sm">
                      {streamedContent.map((content, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2 text-muted-foreground"
                        >
                          <span>{content}</span>
                          {index === streamedContent.length - 1 && isGenerating && (
                            <span className="inline-block w-2 h-4 bg-primary animate-pulse" />
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Progress */}
                  {isGenerating && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{Math.round(generationProgress)}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-primary to-primary/60"
                          initial={{ width: 0 }}
                          animate={{ width: `${generationProgress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
