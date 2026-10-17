import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export interface WizardStepsBarProps {
  wizardStep: 1 | 2 | 3 | 4 | 5;
  isStep1Completed: boolean;
  isStep2Completed: boolean;
  isStep3Completed: boolean;
  isStep4Completed: boolean;
  isStep5Completed?: boolean;
  descripcion?: string;
  espacio?: string;
  responsable?: string;
  equipamientoCount?: number;
  onSelectStep: (step: 1 | 2 | 3 | 4 | 5) => void;
}

export const WizardStepsBar: React.FC<WizardStepsBarProps> = React.memo(({
  wizardStep,
  isStep1Completed,
  isStep2Completed,
  isStep3Completed,
  isStep4Completed,
  isStep5Completed,
  descripcion,
  espacio,
  responsable,
  equipamientoCount = 0,
  onSelectStep
}) => {
  const steps = [
    {
      num: 1 as const,
      label: 'Actividad',
      sublabel: descripcion || 'Nombre y tipo',
      isCompleted: isStep1Completed
    },
    {
      num: 2 as const,
      label: 'Fecha y espacio',
      sublabel: espacio || 'Horario y lugar',
      isCompleted: isStep2Completed
    },
    {
      num: 3 as const,
      label: 'Solicitante',
      sublabel: responsable || 'Contacto',
      isCompleted: isStep3Completed
    },
    {
      num: 4 as const,
      label: 'Recursos',
      sublabel: equipamientoCount > 0 ? `${equipamientoCount} equipos` : 'Equipos y documentos',
      isCompleted: isStep4Completed
    },
    {
      num: 5 as const,
      label: 'Confirmación',
      sublabel: 'Revisión final',
      isCompleted: Boolean(isStep5Completed)
    }
  ];

  const currentStepObj = steps.find(s => s.num === wizardStep) || steps[0];

  return (
    <nav id="reservation-wizard-stepper" aria-label="Pasos del registro" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <p className="font-medium text-slate-700" aria-live="polite">Paso {wizardStep} de 5 <span className="text-slate-400">·</span> {currentStepObj.label}</p>
        <p className="hidden text-slate-500 sm:block">Los campos con * son obligatorios</p>
      </div>
      <ol className="grid grid-cols-5 gap-1 sm:gap-2">
        {steps.map((st) => {
          const isActive = wizardStep === st.num;
          const isDone = st.isCompleted && st.num < wizardStep;

          return (
            <li key={st.num} className="min-w-0">
            <button
              type="button"
              id={`wizard-step-tab-${st.num}`}
              onClick={() => onSelectStep(st.num)}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Paso ${st.num}: ${st.label}`}
              title={st.sublabel}
              className={`flex h-full min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg border p-1 text-center transition-colors min-[380px]:min-h-16 sm:min-h-16 sm:flex-row sm:justify-start sm:gap-2 sm:p-2.5 sm:text-left ${
                isActive
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : isDone
                  ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                  : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'
              }`}
            >
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 font-semibold text-xs ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : isDone
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : st.num}
              </div>
              <div className="hidden w-full min-w-0 min-[380px]:block sm:w-auto sm:flex-1">
                <span
                  className={`text-[10px] font-semibold block leading-tight sm:text-xs ${
                    isActive ? 'text-white' : isDone ? 'text-slate-800' : 'text-slate-600'
                  }`}
                >
                  <span className="sm:hidden">{st.num === 5 ? 'Revisión' : st.num === 2 ? 'Fecha y lugar' : st.label}</span>
                  <span className="hidden sm:inline">{st.label}</span>
                </span>
                <span
                  className={`hidden text-[11px] sm:mt-0.5 sm:block truncate ${
                    isActive ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {st.sublabel}
                </span>
              </div>
            </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
