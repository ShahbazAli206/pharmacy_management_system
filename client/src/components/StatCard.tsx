import type { LucideIcon } from 'lucide-react';

export type StatAccent = 'primary' | 'blue' | 'purple' | 'amber' | 'rose' | 'cyan';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: StatAccent;
  valueColor?: string;
}

export function StatCard({ label, value, sub, icon: Icon, accent = 'primary', valueColor }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-row">
        {Icon && (
          <div className={`stat-icon${accent !== 'primary' ? ` accent-${accent}` : ''}`}>
            <Icon size={20} />
          </div>
        )}
        <div className="stat-body">
          <div className="stat-label">{label}</div>
          <div className="stat-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
          {sub && <div className="stat-sub">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
