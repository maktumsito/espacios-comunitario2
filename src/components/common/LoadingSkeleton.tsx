import React from 'react';

export const CalendarSkeleton: React.FC = () => {
  return (
    <div className="w-full space-y-4 animate-pulse p-4">
      {/* Header bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-slate-200 rounded-xl w-48" />
        <div className="flex space-x-2">
          <div className="h-8 bg-slate-200 rounded-lg w-24" />
          <div className="h-8 bg-slate-200 rounded-lg w-24" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-6 bg-slate-200 rounded-md" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-100/90 rounded-xl border border-slate-200/60 p-2 space-y-2">
            <div className="h-4 bg-slate-200 rounded w-8" />
            {i % 2 === 0 && <div className="h-5 bg-blue-100 rounded-md w-full" />}
            {i % 3 === 0 && <div className="h-5 bg-emerald-100 rounded-md w-3/4" />}
          </div>
        ))}
      </div>
    </div>
  );
};

export const TimelineSkeleton: React.FC = () => {
  return (
    <div className="w-full space-y-3 animate-pulse p-4">
      <div className="h-8 bg-slate-200 rounded-xl w-64" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl border border-slate-200 p-3 flex items-center justify-between">
            <div className="space-y-1.5 w-1/3">
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-200 rounded w-1/2" />
            </div>
            <div className="h-6 bg-slate-200 rounded-full w-24" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const ModalLoadingFallback: React.FC<{ label?: string }> = ({ label = 'Cargando ventana...' }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4 animate-fadeIn"
    >
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-xl flex items-center gap-3 text-sm font-semibold text-slate-700">
        <span className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0" />
        <span>{label}</span>
      </div>
    </div>
  );
};

export const RevalidationBanner: React.FC<{ isRevalidating: boolean }> = ({ isRevalidating }) => {
  if (!isRevalidating) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-blue-600 text-white text-xs font-semibold py-1.5 px-4 text-center flex items-center justify-center space-x-2 shadow-inner animate-in fade-in duration-200"
    >
      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
      <span>Actualizando datos en tiempo real con la nube municipal...</span>
    </div>
  );
};
