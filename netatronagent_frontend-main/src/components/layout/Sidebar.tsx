import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Map,
  Building2,
  Search,
  Mail,
  Database,
  ListTodo,
  Bot,
  ChevronLeft,
  ChevronRight,
  Zap,
  CalendarDays,
  Shield,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/api";

const baseNavItems = [
  { title: "Dashboard", href: "/", icon: Home, componentKey: null }, // Always visible
  { title: "Chat AI", href: "/chat", icon: Bot, componentKey: "chat_agent" },
  { title: "Schedule", href: "/schedule", icon: CalendarDays, componentKey: "schedule" },
  { title: "Google Maps", href: "/google-maps", icon: Map, componentKey: "maps_scraper" },
  { title: "KPO", href: "/kpo", icon: Building2, componentKey: "kpo" },
  { title: "Deep Search", href: "/deep-search", icon: Search, componentKey: null }, // Always visible
  { title: "Email Invoices", href: "/email-invoices", icon: Mail, componentKey: "email_invoices" },
  { title: "Offer Generator", href: "/offer-generator", icon: Wand2, componentKey: null }, // Always visible
  { title: "Results", href: "/results", icon: Database, componentKey: null }, // Always visible
  { title: "Jobs", href: "/jobs", icon: ListTodo, componentKey: null }, // Always visible
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user } = useAuthStore();
  const [enabledComponents, setEnabledComponents] = useState<Record<string, boolean>>({});
  const [componentsLoading, setComponentsLoading] = useState(true);

  // Fetch enabled components for tenant
  useEffect(() => {
    const fetchComponents = async () => {
      try {
        const response = await api.getTenantComponents();
        setEnabledComponents(response.enabled_components || {});
      } catch (err) {
        console.error("[Sidebar] Failed to fetch tenant components:", err);
        // Default: show all components if fetch fails
        setEnabledComponents({});
      } finally {
        setComponentsLoading(false);
      }
    };

    if (user) {
      fetchComponents();
    }
  }, [user]);

  // Filter nav items based on enabled components
  // If componentKey is null, always show the item
  // If componentKey is set, only show if enabled_components[componentKey] is true
  const filteredNavItems = baseNavItems.filter((item) => {
    if (item.componentKey === null) {
      return true; // Always visible
    }
    // If components are still loading, show all items
    if (componentsLoading) {
      return true;
    }
    // Show if component is enabled (default to true if not set)
    return enabledComponents[item.componentKey] !== false;
  });

  // Add Admin link only if user is admin
  const navItems = [
    ...filteredNavItems,
    ...(user?.is_admin ? [{ title: "Admin", href: "/admin", icon: Shield, componentKey: null }] : []),
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="relative flex h-screen flex-col border-r border-border bg-sidebar"
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Zap className="h-5 w-5" />
        </div>
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              key="logo-text"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col overflow-hidden"
            >
              <span className="text-sm font-bold tracking-tight text-foreground">
                Netatron
              </span>
              <span className="text-xs text-primary">Agent</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;

          const link = (
            <NavLink
              key={item.href}
              to={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    key="active-indicator"
                    layoutId="activeIndicator"
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    exit={{ opacity: 0, scaleY: 0 }}
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </AnimatePresence>
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.span
                    key={`text-${item.href}`}
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {item.title}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {item.title}
                </TooltipContent>
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>


      {/* Collapse Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full border border-border bg-background shadow-md hover:bg-muted"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </Button>
    </motion.aside>
  );
}
