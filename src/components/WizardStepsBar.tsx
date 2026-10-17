import React from 'react';
import {
  Sparkles,
  Calendar,
  User,
  Package,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

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
      label: '1. Actividad',
      sublabel: descripcion || 'Nombre y tipo',
      isCompleted: isStep1Completed,
      icon: Sparkles
    },
    {
      num: 2 as const,
      label: '2. Fecha y Espacio',
      sublabel: espacio || 'Horario y lugar',
      isCompleted: isStep2Completed,
      icon: Calendar
    },
    {
      num: 3 as const,
      label: '3. Solicitante',
      sublabel: responsable || 'Contacto',
      isCompleted: isStep3Completed,
      icon: User
    },
    {
      num: 4 as const,
      label: '4. Recursos',
      sublabel: equipamientoCount > 0 ? `${equipamientoCount} equipos` : 'Equipos y Carta',
      isCompleted: isStep4Completed,
      icon: Package
    },
    {
      num: 5 as const,
      label: '5. Confirmación',
      sublabel: 'Revisión final',
      isCompleted: Boolean(isStep5Completed),
      icon: CheckCircle2
    }
  ];

  const currentStepObj = steps.find(s => s.num === wizardStep) || steps[0];

  return (
    <div id="reservation-wizard-stepper" className="bg-slate-50/90 p-2 sm:p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1.5">
      {/* Mobile view: Compact progress pill */}
      <div className="flex sm:hidden items-center justify-between px-1">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
            {wizardStep}
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 block leading-tight">
              {currentStepObj.label}
            </span>
            <span className="text-[10px] text-slate-500 block truncate max-w-[190px]">
              {currentStepObj.sublabel}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
            {wizardStep} de 5
          </span>
        </div>
      </div>

      {/* Desktop / Tablet view: 5 interactive step tabs */}
      <div className="hidden sm:grid grid-cols-5 gap-2">
        {steps.map((st) => {
          const isActive = wizardStep === st.num;
          const isDone = st.isCompleted && st.num < wizardStep;

          return (
            <button
              key={st.num}
              type="button"
              id={`wizard-step-tab-${st.num}`}
              onClick={() => onSelectStep(st.num)}
              aria-current={isActive ? 'step' : undefined}
              className={`flex items-center space-x-2 p-2 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                  : isDone
                  ? 'bg-white border-emerald-300 text-slate-800 hover:bg-emerald-50/50'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/80'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-black text-xs ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : isDone
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {isDone ? '✓' : st.num}
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={`text-sm font-bold block leading-tight break-words ${
                    isActive ? 'text-white' : 'text-slate-800'
                  }`}
                >
                  {st.label}
                </span>
                <span
                  className={`text-[10px] block truncate ${
                    isActive ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {st.sublabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});
