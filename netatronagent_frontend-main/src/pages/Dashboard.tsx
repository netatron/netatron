import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Map,
  Building2,
  Search,
  Mail,
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Zap,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

const quickActions = [
  {
    title: "Google Maps Scraper",
    description: "Scrape business data from Google Maps",
    icon: Map,
    href: "/google-maps",
    color: "text-blue-400",
  },
  {
    title: "KPO Scraper",
    description: "Scrape KPO beneficiaries data",
    icon: Building2,
    href: "/kpo",
    color: "text-green-400",
  },
  {
    title: "Deep Search",
    description: "AI-powered advanced search",
    icon: Search,
    href: "/deep-search",
    color: "text-purple-400",
  },
  {
    title: "Email Invoices",
    description: "Process invoices from emails",
    icon: Mail,
    href: "/email-invoices",
    color: "text-orange-400",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const [stats, setStats] = useState({
    active_jobs: 0,
    completed_today: 0,
    records_scraped_week: 0,
    pending_tasks: 0,
    recent_jobs: [] as Array<{
      id: string;
      name: string;
      source: string;
      status: string;
      progress: number;
      createdAt: string;
    }>,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      setIsLoading(true);
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error("Failed to load dashboard stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const statsCards = [
    {
      title: "Active Jobs",
      value: stats.active_jobs,
      description: "Currently running",
      icon: Activity,
      trend: { value: 0, isPositive: true },
    },
    {
      title: "Completed Today",
      value: stats.completed_today,
      description: "Tasks finished",
      icon: CheckCircle2,
      trend: { value: 0, isPositive: true },
    },
    {
      title: "Records Scraped",
      value: stats.records_scraped_week.toLocaleString(),
      description: "This week",
      icon: Zap,
      trend: { value: 0, isPositive: true },
    },
    {
      title: "Pending Tasks",
      value: stats.pending_tasks,
      description: "In queue",
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's an overview of your scraping activities."
      />

      {/* Stats Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        >
          {statsCards.map((stat) => (
            <motion.div key={stat.title} variants={item}>
              <StatCard {...stat} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Jobs */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Recent Jobs</CardTitle>
            <Link to="/jobs">
              <Button variant="ghost" size="sm" className="gap-1 text-primary">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : stats.recent_jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent jobs
              </p>
            ) : (
              <div className="space-y-4">
                {stats.recent_jobs.map((job, index) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      {job.source === "maps" && <Map className="h-5 w-5 text-primary" />}
                      {job.source === "kpo" && <Building2 className="h-5 w-5 text-primary" />}
                      {job.source === "deep_search" && <Search className="h-5 w-5 text-primary" />}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{job.name}</p>
                      <p className="text-sm text-muted-foreground">{job.createdAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {job.status === "running" && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">{job.progress}%</span>
                      </div>
                    )}
                    <StatusBadge status={job.status} />
                  </div>
                </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {quickActions.map((action, index) => (
                <motion.div
                  key={action.href}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link to={action.href}>
                    <div className="group flex items-center gap-3 rounded-lg border border-border p-3 transition-all hover:border-primary/30 hover:bg-muted/50">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-primary/10">
                        <action.icon className={`h-5 w-5 ${action.color}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{action.title}</p>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-5 w-5 text-success" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
              </span>
              <span className="text-sm text-muted-foreground">API Connected</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
              </span>
              <span className="text-sm text-muted-foreground">Scrapers Online</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
              </span>
              <span className="text-sm text-muted-foreground">AI Agent Ready</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
