// Netatron Agent Constants

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const POLLING_INTERVALS = {
  JOBS: 10000, // 10 seconds
  CHAT: 5000,  // 5 seconds
  EMAIL_INVOICES: 10000, // 10 seconds
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 1000,
} as const;

export const JOB_LIMITS = {
  MIN_DESIRED_RESULTS: 1,
  MAX_DESIRED_RESULTS: 1000,
  MAX_KPO_LIMIT: 500,
  MAX_DEEP_SEARCH_LIMIT: 200,
} as const;

export const POLISH_VOIVODESHIPS = [
  "dolnośląskie",
  "kujawsko-pomorskie",
  "lubelskie",
  "lubuskie",
  "łódzkie",
  "małopolskie",
  "mazowieckie",
  "opolskie",
  "podkarpackie",
  "podlaskie",
  "pomorskie",
  "śląskie",
  "świętokrzyskie",
  "warmińsko-mazurskie",
  "wielkopolskie",
  "zachodniopomorskie",
] as const;

export const NAV_ITEMS = [
  { title: "Dashboard", href: "/", icon: "Home" },
  { title: "Chat AI", href: "/chat", icon: "Bot" },
  { title: "Google Maps", href: "/google-maps", icon: "Map" },
  { title: "KPO", href: "/kpo", icon: "Building2" },
  { title: "Deep Search", href: "/deep-search", icon: "Search" },
  { title: "Email Invoices", href: "/email-invoices", icon: "Mail" },
  { title: "Results", href: "/results", icon: "Database" },
  { title: "Jobs", href: "/jobs", icon: "ListTodo" },
] as const;
