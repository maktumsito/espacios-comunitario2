import type { DistributionRequest, DistributionResult } from '../types';
import { SETUP_LABELS } from '../utils/roomDistribution';
import { normalizeSpace } from '../utils/conflictDetector';
import { RoomSetupPreview } from './RoomSetupPreview';

export function DistributionProposalTable({ result, requests }: { result: DistributionResult; requests: DistributionRequest[] }) {
  return <section className="space-y-4" aria-labelledby="distribution-result-title" aria-live="polite">
    <div>
      <h4 id="distribution-result-title" className="text-lg font-semibold text-slate-900">Distribución propuesta</h4>
      <p className="mt-1 text-sm text-slate-600">{result.proposals.length} de {requests.length} actividades ubicadas. Revisa salas, horarios y montaje antes de aplicar.</p>
      <p className="mt-2 text-xs text-slate-500 sm:hidden">Desliza la tabla horizontalmente para ver montaje, recursos y criterios.</p>
    </div>
    {result.searchLimitReached && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Se alcanzó el límite de búsqueda. Se muestra la mejor combinación encontrada; puede haber otras soluciones.</p>}
    {!!result.activationRecommendations?.length && <aside aria-label="Recomendaciones de activación" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
      <h5 className="font-semibold">Se recomienda activar espacios desactivados</h5>
      <p>Estas salas permiten ubicar actividades que no pudieron resolverse usando solo las salas activas en el análisis.</p>
      <ul className="space-y-1">{result.activationRecommendations.map(space => <li key={space.spaceId}><strong>{space.name}</strong>: permite ubicar {space.requestIds.length} {space.requestIds.length === 1 ? 'actividad' : 'actividades'}. Requiere confirmar su activación.</li>)}</ul>
    </aside>}
    {result.unresolved.length > 0 && <ul className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {result.unresolved.map(item => <li key={item.requestId}><strong>{requests.find(r => r.id === item.requestId)?.descripcion || 'Actividad sin completar'}:</strong> {item.reason}</li>)}
    </ul>}
    {!!result.proposals.length && <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Comparación de reservas actuales con la distribución propuesta</caption>
        <thead className="bg-slate-50 text-xs text-slate-600"><tr>
          <th scope="col" className="p-3">Actividad</th><th scope="col" className="p-3">Sala y horario</th><th scope="col" className="p-3">Montaje y recursos</th><th scope="col" className="p-3">Criterios</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-200">{result.proposals.map(proposal => {
          const row = proposal.reservation, source = requests.find(r => r.id === proposal.requestId)?.source;
          const roomChanged = Boolean(source && normalizeSpace(source.espacio) !== normalizeSpace(row.espacio));
          const timeChanged = Boolean(source && (source.horaInicio !== row.horaInicio || source.horaFin !== row.horaFin));
          return <tr key={proposal.requestId} className="align-top">
            <th scope="row" className="p-3 min-w-40 font-medium text-slate-900">
              {row.descripcion}
              <span className="mt-1 block text-xs font-normal text-slate-500">{row.cantidadParticipantes} participantes · {row.responsable || 'Falta responsable'}</span>
            </th>
            <td className="p-3 min-w-40">
              <div className="flex flex-wrap items-center gap-1.5">
                <strong>{row.espacio}</strong>
                {proposal.requiresActivation && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950">Requiere activación</span>}
                {!source ? (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">Nueva</span>
                ) : roomChanged || timeChanged ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                    {roomChanged && timeChanged ? 'Cambia sala y hora' : roomChanged ? 'Cambia de sala' : 'Cambia horario'}
                  </span>
                ) : (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">Sin cambio</span>
                )}
              </div>
              <span className="block font-mono text-xs mt-1">{row.horaInicio}–{row.horaFin}</span>
              {source && <span className="mt-2 block text-xs text-slate-500">Actual: {source.espacio}, {source.horaInicio}–{source.horaFin}</span>}
            </td>
            <td className="p-3 min-w-52 space-y-2"><strong className="block">{SETUP_LABELS[row.montaje!.tipo]}</strong><RoomSetupPreview tipo={row.montaje!.tipo} /><p className="text-xs text-slate-600">{row.montaje!.instrucciones}</p><p className="text-xs">{row.equipamientoSolicitado?.length ? row.equipamientoSolicitado.map(item => `${item.equipmentName}: ${item.quantity}`).join(' · ') : 'Sin equipamiento móvil solicitado.'}</p></td>
            <td className="p-3 min-w-44"><ul className="space-y-2 text-xs text-slate-600">{proposal.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
