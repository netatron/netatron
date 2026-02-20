export interface AnalyzedOffer {
  id: string;
  name: string;
  source: "upload" | "email";
  thumbnail?: string;
  analysis: {
    style: string;
    colors: string[];
    fonts: string[];
    layout: string;
    sections: string[];
    tone: string;
  };
}

export interface OfferElement {
  id: string;
  type: "text" | "image" | "shape" | "logo";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  rotation?: number;
  opacity?: number;
  imageUrl?: string;
}

export interface GeneratedOffer {
  id: string;
  title: string;
  width: number;
  height: number;
  backgroundColor: string;
  elements: OfferElement[];
  style: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    headingFont: string;
  };
}

export interface EmailConfig {
  provider: "gmail" | "outlook" | "imap";
  email: string;
  isConnected: boolean;
  lastSync?: string;
  offerCount?: number;
}
