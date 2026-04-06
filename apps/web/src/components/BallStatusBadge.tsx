import { BallStatus, getBallStatusLabel, getBallStatusColor, getBallStatusIcon } from '@/hooks/useActionCenter';

interface Props {
  status: BallStatus;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export default function BallStatusBadge({ status, size = 'sm', showIcon = true }: Props) {
  if (status === 'unknown' || !status) return null;
  const label = getBallStatusLabel(status);
  const color = getBallStatusColor(status);
  const icon = getBallStatusIcon(status);

  return (
    <span className={`status-badge ${color} ${size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-1.5 py-0.5'}`}>
      {showIcon && <span className="mr-1">{icon}</span>}
      {label}
    </span>
  );
}
