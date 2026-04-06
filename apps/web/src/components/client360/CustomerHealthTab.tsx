import { useCustomerHealth } from '@/hooks/useCustomerHealth';
import { Badge } from '@/components/ui/badge';
import { Heart, TrendingUp, Package, RefreshCw, Headphones } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface Props {
  clientId: string;
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground';
  if (score > 70) return 'text-emerald-600';
  if (score >= 40) return 'text-amber-500';
  return 'text-destructive';
}

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-muted';
  if (score > 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-destructive';
}

function scoreLabel(score: number | null): string {
  if (score == null) return 'N/A';
  if (score > 70) return 'Healthy';
  if (score >= 40) return 'At Risk';
  return 'Critical';
}

export default function CustomerHealthTab({ clientId }: Props) {
  const { data, isLoading } = useCustomerHealth(clientId);

  if (isLoading) {
    return <div className="text-center py-12 text-sm text-muted-foreground">Loading health data...</div>;
  }

  if (!data?.latest) {
    return (
      <div className="text-center py-12">
        <Heart size={32} className="mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No health score data available for this account</p>
      </div>
    );
  }

  const { latest, history } = data;

  // Chart data from history (reverse to chronological)
  const chartData = [...history]
    .reverse()
    .map(h => ({
      date: format(new Date(h.calculated_at), 'MMM d'),
      score: h.overall_score,
    }));

  const components = [
    {
      label: 'Engagement',
      score: latest.engagement_score,
      icon: <TrendingUp size={16} />,
      description: 'Meeting frequency, email responses, portal activity',
    },
    {
      label: 'Product Usage',
      score: latest.product_usage_score,
      icon: <Package size={16} />,
      description: 'API calls, data downloads, feature adoption',
    },
    {
      label: 'Renewal Risk',
      score: latest.renewal_risk_score,
      icon: <RefreshCw size={16} />,
      description: 'Contract value, renewal probability, timeline',
    },
    {
      label: 'Support Health',
      score: latest.support_health_score,
      icon: <Headphones size={16} />,
      description: 'Ticket volume, resolution time, satisfaction',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Overall Score Gauge */}
      <div className="flex items-center gap-6 p-6 border rounded-lg">
        <div className="relative">
          <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
            <circle
              cx="60" cy="60" r="50"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="10"
            />
            <circle
              cx="60" cy="60" r="50"
              fill="none"
              stroke={latest.overall_score > 70 ? '#10b981' : latest.overall_score >= 40 ? '#f59e0b' : '#ef4444'}
              strokeWidth="10"
              strokeDasharray={`${(latest.overall_score / 100) * 314} 314`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${scoreColor(latest.overall_score)}`}>{latest.overall_score}</span>
            <span className="text-[10px] text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Overall Health Score</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={latest.overall_score > 70 ? 'default' : latest.overall_score >= 40 ? 'secondary' : 'destructive'}
              className="text-xs"
            >
              {scoreLabel(latest.overall_score)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Last updated {format(new Date(latest.calculated_at), 'MMM d, yyyy')}
            </span>
          </div>
          {latest.factors && (
            <p className="text-xs text-muted-foreground mt-2">
              Key factors: {Object.keys(latest.factors).slice(0, 3).join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* Component Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {components.map(c => (
          <div key={c.label} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className={scoreColor(c.score)}>{c.icon}</span>
              <span className="text-xs font-medium">{c.label}</span>
            </div>
            <div className="flex items-end gap-2">
              <span className={`text-2xl font-bold tabular-nums ${scoreColor(c.score)}`}>
                {c.score ?? '--'}
              </span>
              {c.score != null && (
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full ${scoreBg(c.score)}`}
                    style={{ width: `${c.score}%` }}
                  />
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{c.description}</p>
          </div>
        ))}
      </div>

      {/* Trend Chart */}
      {chartData.length > 1 && (
        <div className="border rounded-lg p-4">
          <h4 className="text-xs font-medium mb-3">Health Score Trend</h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                labelFormatter={v => `Date: ${v}`}
                formatter={(value: number) => [value, 'Score']}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
