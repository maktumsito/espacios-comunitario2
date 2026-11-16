import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Cake } from 'lucide-react';
import { dataRequest } from '../firebase/gateway';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { CAKE_END, CAKE_START, CAKE_STOCK_CHANGED, type CakeStock } from '../utils/reservationCakes';

export function AdminCakeStock() {
  const [stock, setStock] = useState<CakeStock | null>(null);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{ key: string; id: string } | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStock(await dataRequest('/api/reservations/cake-stock', {}));
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo consultar el stock.');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(CAKE_STOCK_CHANGED, onChange);
    window.addEventListener('focus', onChange);
    return () => {
      window.removeEventListener(CAKE_STOCK_CHANGED, onChange);
      window.removeEventListener('focus', onChange);
    };
  }, [refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const count = Number(quantity);
    if (!stock || saving || !Number.isSafeInteger(count) || count < 1) return;
    const delta = direction === 'add' ? count : -count;
    const key = JSON.stringify([delta, reason.trim()]);
    const operationId = pending.current?.key === key ? pending.current.id : crypto.randomUUID();
    pending.current = { key, id: operationId };
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await dataRequest('/api/reservations/cake-stock/adjust', { operationId, delta, reason });
      setStock(updated);
      pending.current = null;
      setQuantity('');
      setReason('');
      setNotice('Stock actualizado. El aviso quedó programado por correo.');
      window.dispatchEvent(new Event(CAKE_STOCK_CHANGED));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo confirmar el ajuste.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-900"><Cake size={22} aria-hidden="true" /></span>
        <div>
          <h2 className="font-bold text-slate-950">Tortas</h2>
          <p className="text-sm text-slate-600">Actividades municipales del {formatDateDDMMYYYY(CAKE_START)} al {formatDateDDMMYYYY(CAKE_END)}</p>
        </div>
      </header>
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950" aria-live="polite">
        {stock ? <><strong className="text-lg tabular-nums">{stock.available} de {stock.capacity}</strong> tortas disponibles · {stock.capacity - stock.available} asignadas</> :
          error ? <button type="button" className="font-semibold underline" onClick={() => void refresh()}>Volver a consultar el stock</button> : 'Consultando stock…'}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={!stock || saving} className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <label className="grid gap-1 text-sm font-medium text-slate-800">Ajuste
            <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" value={direction} onChange={e => setDirection(e.target.value as 'add' | 'remove')}>
              <option value="add">Agregar al stock</option>
              <option value="remove">Retirar del stock</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-800">Cantidad
            <input type="number" className="min-h-11 min-w-0 rounded-lg border border-slate-300 px-3" min={1} step={1} required
              value={quantity} onChange={e => setQuantity(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-800 sm:col-span-2">Motivo (opcional)
            <input className="min-h-11 rounded-lg border border-slate-300 px-3" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
          </label>
        </fieldset>
        {error && <p role="alert" className="text-sm font-medium text-rose-800">{error}</p>}
        {notice && <p role="status" className="text-sm font-medium text-emerald-800">{notice}</p>}
        <button type="submit" disabled={!stock || saving || !quantity} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar ajuste'}
        </button>
      </form>
    </section>
  );
}
