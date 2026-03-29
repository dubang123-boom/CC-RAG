'use client';

import { differenceInDays, parseISO } from 'date-fns';

interface DeadlineCountdownProps {
  deadline: string; // ISO date string
}

export default function DeadlineCountdown({ deadline }: DeadlineCountdownProps) {
  const deadlineDate = parseISO(deadline);
  const today = new Date();
  const daysLeft = differenceInDays(deadlineDate, today);

  let colorClass = 'text-green-600';
  if (daysLeft <= 7) colorClass = 'text-red-600 font-bold';
  else if (daysLeft <= 15) colorClass = 'text-orange-500 font-semibold';

  if (daysLeft < 0) {
    return (
      <span className="text-red-600 font-bold">
        已过期 {Math.abs(daysLeft)} 天
      </span>
    );
  }

  return (
    <span className={colorClass}>
      剩余 {daysLeft} 天（{deadline}）
    </span>
  );
}
