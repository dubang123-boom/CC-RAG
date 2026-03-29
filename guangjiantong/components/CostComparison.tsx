import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EstimatedCost } from '@/types';

interface CostComparisonProps {
  cost: EstimatedCost;
}

export default function CostComparison({ cost }: CostComparisonProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">成本对比分析</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
              现在和解
            </p>
            <p className="text-sm">{cost.cooperation_cost}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
            <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">
              升级后果
            </p>
            <p className="text-sm">{cost.escalation_cost}</p>
          </div>
        </div>
        {cost.comparison_note && (
          <p className="text-xs text-muted-foreground mt-3">
            {cost.comparison_note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
