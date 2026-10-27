import type { RoomSetupType } from '../types';
import { SETUP_LABELS } from '../utils/roomDistribution';

/** Conceptual layout only: no room dimensions, fixed fixtures or seat counts are inferred. */
export function RoomSetupPreview({ tipo }: { tipo: RoomSetupType }) {
  const positions: [number, number][] = tipo === 'circulo'
    ? Array.from({ length: 8 }, (_, i) => [80 + Math.cos(i * Math.PI / 4) * 48, 53 + Math.sin(i * Math.PI / 4) * 32])
    : tipo === 'u' ? [[35, 28], [35, 50], [35, 72], [60, 80], [85, 80], [110, 80], [125, 50], [125, 28]]
    : tipo === 'mesas' ? [[40, 38], [55, 38], [105, 38], [120, 38], [40, 75], [55, 75], [105, 75], [120, 75]]
    : tipo === 'despejado' ? [] : Array.from({ length: 12 }, (_, i) => [35 + i % 4 * 30, 37 + Math.floor(i / 4) * 22]);
  return <figure className="max-w-48 space-y-1">
    <svg viewBox="0 0 160 105" role="img" aria-label={`Esquema conceptual: ${SETUP_LABELS[tipo]}, sin escala`} className="w-full rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
      {tipo === 'despejado' ? <text x="80" y="55" textAnchor="middle" fontSize="11" fill="currentColor">Área libre</text> : <>
        {tipo !== 'circulo' && <rect x="59" y="9" width="42" height="7" rx="2" fill="#94a3b8" />}
        {positions.map(([x, y], i) => <rect key={i} x={x - 4} y={y - 4} width="8" height="8" rx="2" fill="#64748b" />)}
        {tipo === 'mesas' && [[48, 48], [112, 48], [48, 85], [112, 85]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 16} y={y - 4} width="32" height="8" fill="#cbd5e1" />)}
      </>}
    </svg>
    <figcaption className="text-[11px] text-slate-500">Conceptual, sin escala ni cantidades.</figcaption>
  </figure>;
}
