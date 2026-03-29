"use client";

import StatsCards from "@/components/dashboard/StatsCards";
import TimelineChart from "@/components/dashboard/TimelineChart";
import SourcePieChart from "@/components/dashboard/SourcePieChart";
import TopicTreemap from "@/components/dashboard/TopicTreemap";
import RecentPapers from "@/components/dashboard/RecentPapers";
import { useOverview, useTimeline } from "@/hooks/useAnalytics";
import { usePapers } from "@/hooks/usePapers";

export default function DashboardPage() {
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: timeline } = useTimeline({ interval: "day" });
  const { data: papers, isLoading: papersLoading } = usePapers({
    per_page: "8",
    sort_by: "created_at",
    sort_order: "desc",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Federated Learning Research Monitor
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={overview} isLoading={overviewLoading} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TimelineChart data={timeline?.data} />
        </div>
        <SourcePieChart data={overview?.sources} />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentPapers papers={papers?.items} isLoading={papersLoading} />
        </div>
        <TopicTreemap data={overview?.topics} />
      </div>
    </div>
  );
}
