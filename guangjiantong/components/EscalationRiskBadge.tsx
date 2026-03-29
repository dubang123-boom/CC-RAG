import { Badge } from '@/components/ui/badge';
import type { EscalationRisk } from '@/types';

const config: Record<EscalationRisk, { label: string; className: string }> = {
  high: { label: '升级风险：高', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
  medium: { label: '升级风险：中', className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' },
  low: { label: '升级风险：低', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
};

interface EscalationRiskBadgeProps {
  value: EscalationRisk;
}

export default function EscalationRiskBadge({ value }: EscalationRiskBadgeProps) {
  const { label, className } = config[value];
  return <Badge className={className}>{label}</Badge>;
}
