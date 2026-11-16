import { useId } from 'react';
import { Cake, Minus, Plus } from 'lucide-react';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { CAKE_CAPACITY } from '../utils/reservationCakes';

interface ReservationCakePickerProps {
  dates: string[];
  stock: number | null;
  stockFailed: boolean;
  requested: number;
  estimatedStock: number | null;
  quantityForDate: (date: string) => number;
  onQuantityChange: (date: string, quantity: number) => void;
  onRefresh: () => void;
}

const stepButton = 'grid size-11 place-items-center text-slate-700 transition-colors enabled:hover:bg-amber-50 enabled:active:bg-amber-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-700 disabled:text-slate-300';

export function ReservationCakePicker({
  dates, stock, stockFailed, requested, estimatedStock, quantityForDate, onQuantityChange, onRefresh,
}: ReservationCakePickerProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-xl border border-amber-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-amber-200 bg-amber-50 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-900">
            <Cake size={22} aria-hidden="true" />
          </span>
          <div>
            <h3 id={titleId} className="font-bold text-slate-950">Tortas</h3>
            <p className="text-sm text-slate-700">Elige la cantidad para cada fecha.</p>
          </div>
        </div>
        <div className="text-sm text-amber-950" aria-live="polite">
          {stockFailed ? (
            <button type="button" className="min-h-11 font-semibold underline underline-offset-4" onClick={onRefresh}>
              Reintentar consulta de stock
            </button>
          ) : stock === null ? (
            <span>Consultando stock…</span>
          ) : (
            <><strong className="text-lg tabular-nums">{stock} de {CAKE_CAPACITY}</strong> disponibles</>
          )}
        </div>
      </header>
      <ul className="divide-y divide-slate-200 px-4">
        {dates.map(date => {
          const quantity = quantityForDate(date);
          const displayDate = formatDateDDMMYYYY(date);
          const inputId = `${titleId}-${date}`;
          return (
            <li key={date} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <label htmlFor={inputId} className="text-sm font-semibold tabular-nums text-slate-800">{displayDate}</label>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white">
                <button type="button" className={`${stepButton} rounded-l-lg`} disabled={quantity === 0}
                  aria-label={`Quitar una torta para el ${displayDate}`} onClick={() => onQuantityChange(date, quantity - 1)}>
                  <Minus size={17} aria-hidden="true" />
                </button>
                <input id={inputId} type="number" min={0} max={CAKE_CAPACITY} step={1} inputMode="numeric"
                  aria-label={`Tortas para el ${displayDate}`} value={quantity}
                  className="h-11 w-12 appearance-none border-x border-slate-200 bg-white text-center text-base font-bold tabular-nums text-slate-950 focus:z-10 focus:outline-2 focus:-outline-offset-2 focus:outline-amber-700 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                  onChange={event => {
                    const value = event.target.value === '' ? 0 : event.target.valueAsNumber;
                    if (Number.isInteger(value) && value >= 0 && value <= CAKE_CAPACITY) onQuantityChange(date, value);
                  }}
                />
                <button type="button" className={`${stepButton} rounded-r-lg`} disabled={quantity === CAKE_CAPACITY}
                  aria-label={`Agregar una torta para el ${displayDate}`} onClick={() => onQuantityChange(date, quantity + 1)}>
                  <Plus size={17} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {(requested > 0 || (estimatedStock !== null && estimatedStock < 0)) && (
        <footer className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-sm" aria-live="polite">
          <span className="font-semibold text-slate-900">{requested} {requested === 1 ? 'torta seleccionada' : 'tortas seleccionadas'}</span>
          {estimatedStock !== null && (estimatedStock < 0
            ? <span className="font-semibold text-rose-800">El stock no alcanza para esta selección.</span>
            : <span className="text-slate-700">Saldo estimado al guardar: {estimatedStock}</span>)}
        </footer>
      )}
    </section>
  );
}
