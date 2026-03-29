import { Badge } from '@/components/ui/badge';
import type { Defensibility } from '@/types';

const config: Record<Defensibility, { label: string; className: string }> = {
  '强': { label: '可申辩性：强', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  '中': { label: '可申辩性：中', className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' },
  '弱': { label: '可申辩性：弱', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
};

interface DefensibilityBadgeProps {
  value: Defensibility;
}

export default function DefensibilityBadge({ value }: DefensibilityBadgeProps) {
  const { label, className } = config[value];
  return <Badge className={className}>{label}</Badge>;
}
