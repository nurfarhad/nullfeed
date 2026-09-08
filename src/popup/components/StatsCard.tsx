import type { FocusStats } from "../../shared/statsStorage";
import { formatTimeSaved } from "../../shared/statsStorage";

type StatsCardProps = {
  stats: FocusStats;
};

export function StatsCard({ stats }: StatsCardProps) {
  return (
    <section aria-label="Distraction statistics" class="stats-card">
      <div class="stat-item">
        <span class="stat-value">{stats.todayBlocked}</span>
        <span class="stat-label">Blocked</span>
      </div>
      <div aria-hidden="true" class="stat-divider" />
      <div class="stat-item">
        <span class="stat-value">{formatTimeSaved(stats.todayBlocked)}</span>
        <span class="stat-label">Saved</span>
      </div>
      <div aria-hidden="true" class="stat-divider" />
      <div class="stat-item">
        <span class="stat-value">{stats.streakDays}d</span>
        <span class="stat-label">Streak</span>
      </div>
    </section>
  );
}
