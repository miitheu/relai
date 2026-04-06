import { useState } from 'react';
import { useAIUsageSummary, useAIUsageLog } from '@/hooks/useAIUsage';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Brain, Coins, Clock, AlertTriangle, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AIUsageTab() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month');
  const { data: summary, isLoading: loadingSummary } = useAIUsageSummary(period);
  const { data: recentLogs, isLoading: loadingLogs } = useAIUsageLog({ limit: 50 });

  // Build chart data from recent logs (group by day)
  const chartData = buildChartData(recentLogs || []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">AI Usage Analytics</h3>
          <p className="text-xs text-muted-foreground mt-1">Monitor AI token consumption, costs, and performance.</p>
        </div>
        <Select value={period} onValueChange={v => setPeriod(v as any)}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      {loadingSummary ? (
        <div className="text-center py-8 text-sm text-muted-foreground">Loading summary...</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            icon={<Zap size={16} className="text-primary" />}
            label="Total Tokens"
            value={formatNumber(summary?.totalTokens || 0)}
            sub={`${summary?.totalCalls || 0} calls`}
          />
          <KPICard
            icon={<Coins size={16} className="text-amber-500" />}
            label="Total Cost"
            value={`$${(summary?.totalCost || 0).toFixed(2)}`}
            sub={period === 'today' ? 'today' : period === 'week' ? 'last 7 days' : 'last 30 days'}
          />
          <KPICard
            icon={<Clock size={16} className="text-blue-500" />}
            label="Avg Response Time"
            value={`${summary?.avgResponseMs || 0}ms`}
            sub="per call"
          />
          <KPICard
            icon={<AlertTriangle size={16} className="text-destructive" />}
            label="Error Rate"
            value={`${(summary?.errorRate || 0).toFixed(1)}%`}
            sub={`of ${summary?.totalCalls || 0} calls`}
          />
        </div>
      )}

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="border rounded-lg p-4">
          <h4 className="text-xs font-medium mb-3">Token Usage Over Time</h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                labelFormatter={v => `Date: ${v}`}
                formatter={(value: number) => [formatNumber(value), 'Tokens']}
              />
              <Line type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Calls Table */}
      <div>
        <h4 className="text-xs font-medium mb-2">Recent AI Calls</h4>
        {loadingLogs ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading logs...</div>
        ) : !recentLogs?.length ? (
          <div className="text-center py-12">
            <Brain size={32} className="mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No AI usage recorded yet</p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Function</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-sm">{log.function_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{log.model}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(log.total_tokens)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">${log.cost_usd?.toFixed(4)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{log.duration_ms}ms</TableCell>
                    <TableCell>
                      <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), 'MMM d HH:mm')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="border rounded-lg p-4 space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function buildChartData(logs: { created_at: string; total_tokens: number }[]) {
  const map = new Map<string, number>();
  for (const l of logs) {
    const day = format(new Date(l.created_at), 'MMM d');
    map.set(day, (map.get(day) || 0) + (l.total_tokens || 0));
  }
  return Array.from(map.entries())
    .map(([date, tokens]) => ({ date, tokens }))
    .reverse();
}
