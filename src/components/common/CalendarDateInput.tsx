import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { CalendarDays } from 'lucide-react';
import { clampAndFixCalendarDate, validateStrictCalendarDate } from '../../utils/validationUtils';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max'> & {
  value: string; onValueChange: (iso: string) => void; min?: string; max?: string;
};
const display = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;

/** Keep the manual draft readable: native date inputs erase impossible days before change handlers can correct them. */
export function CalendarDateInput({ value, onValueChange, min, max, className = '', disabled, readOnly, onBlur, onKeyDown,
  'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }: Props) {
  const generatedId = useId();
  const id = props.id || generatedId;
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const emitted = useRef(value);
  const [draft, setDraft] = useState(display(value));
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value; setDraft(display(value)); setFeedback(''); setError('');
      textRef.current?.setCustomValidity('');
    }
  }, [value]);
  const change = (raw: string) => {
    const text = /^\d{8}$/.test(raw) ? `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}` : raw;
    const fixed = clampAndFixCalendarDate(text);
    const valid = validateStrictCalendarDate(fixed.correctedIso, 1, 9999);
    const failure = raw.trim() ? !valid.isValid ? 'Completa una fecha válida en formato DD/MM/AAAA.'
      : min && valid.isoString < min ? `La fecha debe ser desde el ${display(min)}.`
      : max && valid.isoString > max ? `La fecha debe ser hasta el ${display(max)}.` : '' : '';
    const iso = !failure && valid.isValid ? valid.isoString : '';
    setDraft(iso ? display(iso) : raw);
    setFeedback(iso && fixed.wasAdjusted ? `Fecha corregida automáticamente a ${display(iso)}.` : '');
    setError('');
    textRef.current?.setCustomValidity(failure);
    if (emitted.current !== iso) { emitted.current = iso; onValueChange(iso); }
    return !failure;
  };
  return <span className={`min-w-0 flex-col align-middle ${className.includes('w-full') ? 'flex w-full' : 'inline-flex'}`}>
    <span className="relative inline-flex min-w-0">
      <input size={10} {...props} id={id} ref={textRef} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" autoComplete="off"
        value={draft} disabled={disabled} readOnly={readOnly} className={className}
        style={{ ...props.style, paddingRight: '2.5rem', minWidth: '9rem' }}
        aria-invalid={!!error || invalid} aria-describedby={[describedBy, (feedback || error) && `${id}-date-feedback`].filter(Boolean).join(' ') || undefined}
        onChange={event => change(event.target.value)}
        onBlur={event => { setError(event.currentTarget.validationMessage); onBlur?.(event); }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.currentTarget.checkValidity()) {
            setError(event.currentTarget.validationMessage); event.preventDefault(); event.stopPropagation();
          }
          onKeyDown?.(event);
        }} />
      <input ref={pickerRef} type="date" value={value} min={min} max={max} disabled={disabled || readOnly}
        tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        onChange={event => change(event.target.value)} />
      <button type="button" disabled={disabled || readOnly} className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-slate-500 hover:text-blue-700 disabled:opacity-40"
        aria-label={`Abrir calendario${props['aria-label'] ? `: ${props['aria-label']}` : ''}`}
        onClick={() => {
          try { if (pickerRef.current?.showPicker) pickerRef.current.showPicker(); else pickerRef.current?.click(); }
          catch { textRef.current?.focus(); setFeedback('Escribe la fecha en formato DD/MM/AAAA.'); }
        }}><CalendarDays aria-hidden="true" className="h-4 w-4" /></button>
    </span>
    {(feedback || error) && <span id={`${id}-date-feedback`} role={error ? 'alert' : 'status'} className={`mt-1 text-xs font-medium ${error ? 'text-rose-700' : 'text-blue-700'}`}>{error || feedback}</span>}
  </span>;
}
