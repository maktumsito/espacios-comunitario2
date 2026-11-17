import { useEffect, useState, type FormEvent } from 'react';
import { dataRequest } from '../firebase/gateway';
import { ConfirmationModal } from './common/ConfirmationModal';

type Location = { id: string; name: string; generation: string };
type Article = { id: string; name: string; quantity: number; minimumQuantity: number | null };

const field = 'min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3';
const button = 'min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la operación. Vuelve a intentar.';
}

function includeRecord<T extends { id: string; name: string }>(records: T[], record: T) {
  return [...records.filter(entry => entry.id !== record.id), record]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function InventoryArticles({ location, locked, saving, setSaving, onRemove }: {
  location: Location;
  locked: boolean;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onRemove: (location: Location) => Promise<void>;
}) {
  const [items, setItems] = useState<Article[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [reading, setReading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Article | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [minimumQuantity, setMinimumQuantity] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    dataRequest('/api/inventario/articulos', { locationId: location.id, generation: location.generation }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setItems(result.items); })
      .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [location.id, location.generation, revision]);

  function reload() {
    setEditing(null);
    setName('');
    setQuantity('');
    setMinimumQuantity('');
    setError('');
    setNotice('');
    setReading(true);
    setRevision(value => value + 1);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || reading || locked || !name.trim() || !quantity.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { item } = await dataRequest('/api/inventario/guardar-articulo', {
        locationId: location.id, generation: location.generation, name,
        quantity: Number(quantity), previousQuantity: editing?.quantity ?? null,
        minimumQuantity: minimumQuantity === '' ? null : Number(minimumQuantity),
        previousMinimumQuantity: editing?.minimumQuantity ?? null,
      });
      setItems(current => includeRecord(current ?? [], item));
      setEditing(null);
      setName('');
      setQuantity('');
      setMinimumQuantity('');
      setNotice('Artículo guardado.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-4 border-t border-slate-200 pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold text-slate-900">Artículos de {location.name}</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={reading || saving || locked} onClick={reload}>Actualizar listado</button>
        <button type="button" disabled={reading || saving || locked || !items}
          className="min-h-11 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          onClick={() => setConfirmRemoval(true)}>Eliminar lugar</button>
      </div>
    </div>
    <form onSubmit={save} className="space-y-3">
      <fieldset disabled={reading || saving || locked || !items} className="grid gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[1fr_9rem_11rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-slate-700">Nombre del artículo
          <input className={field} required maxLength={120} readOnly={Boolean(editing)}
            value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Cantidad actual
          <input className={field} type="number" min={0} step={1} required
            value={quantity} onChange={event => setQuantity(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Mínimo de alerta (opcional)
          <input className={field} type="number" min={0} step={1} placeholder="Sin alerta"
            value={minimumQuantity} onChange={event => setMinimumQuantity(event.target.value)} />
        </label>
        <button type="submit" className={button}>{saving ? 'Guardando…' : editing ? 'Guardar artículo' : 'Agregar artículo'}</button>
      </fieldset>
      {editing && <button type="button" className={secondary} disabled={saving} onClick={() => {
        setEditing(null);
        setName('');
        setQuantity('');
        setMinimumQuantity('');
        setError('');
      }}>Cancelar edición</button>}
    </form>
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {reading && <p role="status" className="text-sm text-slate-600">Cargando artículos…</p>}
    {items?.length === 0 && !reading && <p className="text-sm text-slate-600">Este lugar todavía no tiene artículos.</p>}
    {Boolean(items?.length) && <table className="w-full table-fixed border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-slate-700"><tr>
        <th scope="col" className="p-2">Artículo</th>
        <th scope="col" className="w-20 p-2 text-right">Cantidad</th>
        <th scope="col" className="w-28 p-2"><span className="sr-only">Acción</span></th>
      </tr></thead>
      <tbody>{items?.map(item => <tr key={item.id} className="border-b border-slate-200">
        <th scope="row" className="break-words p-2 font-medium text-slate-900">
          {item.name}
          {item.minimumQuantity != null && item.quantity <= item.minimumQuantity && (
            <span className="mt-1 block w-fit rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Stock bajo</span>
          )}
        </th>
        <td className="break-all p-2 text-right tabular-nums">
          {item.quantity}
          {item.minimumQuantity != null && <span className="block text-xs text-slate-600">Mín. {item.minimumQuantity}</span>}
        </td>
        <td className="p-2 text-right"><button type="button" disabled={saving || reading} className={secondary}
          aria-label={`Editar ${item.name}`} onClick={() => {
            setEditing(item);
            setName(item.name);
            setQuantity(String(item.quantity));
            setMinimumQuantity(item.minimumQuantity == null ? '' : String(item.minimumQuantity));
            setNotice('');
            setError('');
          }}>Editar</button></td>
      </tr>)}</tbody>
    </table>}
    <ConfirmationModal isOpen={confirmRemoval} title={`¿Eliminar ${location.name}?`}
      message={`${items?.length === 1 ? 'Hay 1 artículo' : `Hay ${items?.length ?? 0} artículos`} en el listado. El lugar y sus artículos se archivarán y dejarán de aparecer en Inventario.`}
      variant="danger" confirmLabel="Eliminar lugar"
      onConfirm={() => onRemove(location)} onCancel={() => setConfirmRemoval(false)} />
  </div>;
}

export function AdminInventory() {
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const [reading, setReading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [articleSaving, setArticleSaving] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const location = locations?.find(place => place.id === selected) ?? locations?.[0];

  useEffect(() => {
    const controller = new AbortController();
    dataRequest('/api/inventario/lugares', {}, controller.signal)
      .then(result => { if (!controller.signal.aborted) setLocations(result.locations); })
      .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [revision]);

  async function createLocation(event: FormEvent) {
    event.preventDefault();
    if (saving || articleSaving || reading || !name.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { location } = await dataRequest('/api/inventario/crear-lugar', { name });
      setLocations(current => includeRecord(current ?? [], location));
      setSelected(location.id);
      setName('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeLocation(place: Location) {
    setSaving(true);
    setNotice('');
    try {
      await dataRequest('/api/inventario/eliminar-lugar', { locationId: place.id, generation: place.generation });
      setLocations(current => current?.filter(entry => entry.id !== place.id) ?? null);
      setSelected('');
      setError('');
      setNotice(`Lugar eliminado del inventario. ${place.name} quedó archivado.`);
    } finally {
      setSaving(false);
    }
  }

  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="font-bold text-slate-900">Inventario</h2>
    <form onSubmit={createLocation}>
      <fieldset disabled={reading || saving || articleSaving || !locations} className="grid max-w-xl gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm font-medium text-slate-700">Nombre del nuevo lugar
          <input className={field} required maxLength={120} placeholder="Ej. Bodega principal"
            value={name} onChange={event => setName(event.target.value)} />
        </label>
        <button type="submit" className={button}>{saving ? 'Guardando…' : 'Crear lugar'}</button>
      </fieldset>
    </form>
    {reading && <p role="status" className="text-sm text-slate-600">Cargando lugares…</p>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {!locations && !reading && <button type="button" className={secondary} onClick={() => {
      setError('');
      setReading(true);
      setRevision(value => value + 1);
    }}>Volver a cargar lugares</button>}
    {locations?.length === 0 && <p className="text-sm text-slate-600">Crea un lugar para empezar a registrar sus artículos.</p>}
    {location && <label className="grid max-w-xl gap-1 text-sm font-medium text-slate-700">Lugar de inventario
      <select className={field} disabled={saving || articleSaving} value={location.id} onChange={event => setSelected(event.target.value)}>
        {locations?.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
      </select>
    </label>}
    {location && <InventoryArticles key={`${location.id}:${location.generation}`} location={location} locked={saving || reading}
      saving={articleSaving} setSaving={setArticleSaving} onRemove={removeLocation} />}
  </section>;
}
