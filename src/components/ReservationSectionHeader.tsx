import type { ReactNode } from 'react';

interface ReservationSectionHeaderProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export function ReservationSectionHeader({ title, description, icon }: ReservationSectionHeaderProps) {
  return <div className="flex items-start gap-3 border-b border-slate-200 pb-4">
    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{icon}</div>
    <div className="min-w-0 space-y-1">
      <h3 className="text-base font-semibold leading-6 text-slate-900">{title}</h3>
      <p className="text-sm leading-5 text-slate-500">{description}</p>
    </div>
  </div>;
}
