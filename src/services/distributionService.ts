import { dataRequest } from '../firebase/gateway';
import type { DistributionSnapshot, DistributionProposal } from '../types';
import { commitReservationChanges } from './reservationService';
import { validateReservationWithZod } from '../schemas/reservationSchema';
import { prepareReservation } from './reservationWriter';

export async function loadDistributionSnapshot(fecha: string, signal?: AbortSignal): Promise<DistributionSnapshot> {
  const response = await dataRequest('/api/reservations/planning-snapshot', { fecha }, signal);
  if (response.snapshot?.fecha !== fecha || !Array.isArray(response.snapshot.reservations) ||
    !Array.isArray(response.snapshot.blocks) || !Array.isArray(response.snapshot.spaces) || !Array.isArray(response.snapshot.equipment))
    throw new Error('No se pudo confirmar la lectura completa de la jornada. Reintenta.');
  return response.snapshot;
}

export function validateDistributionProposals(proposals: DistributionProposal[]) {
  for (const proposal of proposals) {
    const check = validateReservationWithZod(proposal.reservation);
    if (!check.success) throw new Error(`${proposal.reservation.descripcion}: ${check.firstError}`);
    prepareReservation(proposal.reservation);
  }
}

export function commitDistribution(fecha: string, proposals: DistributionProposal[], expectedVersions: Record<string, number>, operationId: string) {
  validateDistributionProposals(proposals);
  return commitReservationChanges(proposals.map(p => p.reservation), {
    requireAtomic: true, distributionDate: fecha, expectedVersions, operationId, allowConflictOverride: false,
  });
}
