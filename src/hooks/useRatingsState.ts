import { useState, useEffect, useCallback } from 'react';
import { Reservation, SpaceRating } from '../types';
import {
  subscribeToRatings,
  saveSpaceRating,
  deleteSpaceRating,
  getLocalRatingsCache,
  checkAutomaticMondayEmail,
  isRatingAllowedForReservation
} from '../services/ratingService';
import { showToast } from '../services/toastNotificationService';

export interface UseRatingsStateReturn {
  ratings: SpaceRating[];
  setRatings: React.Dispatch<React.SetStateAction<SpaceRating[]>>;
  handleSaveRating: (rating: SpaceRating, targetReservation?: Reservation | null) => Promise<void>;
  handleDeleteRating: (ratingId: string) => Promise<void>;
  checkRatingAllowed: (reservation: Reservation) => { allowed: boolean; reason?: string };
}

export function useRatingsState(reservations: Reservation[], {
  enabled = true, automaticEmailEnabled = true,
}: { enabled?: boolean; automaticEmailEnabled?: boolean } = {}): UseRatingsStateReturn {
  const [ratings, setRatings] = useState<SpaceRating[]>(() => getLocalRatingsCache());

  // Subscribe to Space Ratings from Firestore & Local Storage
  useEffect(() => {
    if (!enabled) return;
    const unsubRatings = subscribeToRatings(
      (data) => {
        setRatings(data);
      },
      (error) => {
        console.warn('Ratings sync notice:', error);
      }
    );

    return () => {
      if (typeof unsubRatings === 'function') {
        unsubRatings();
      }
    };
  }, [enabled]);

  // Automated Monday Email Check for Birthday Loans
  useEffect(() => {
    if (enabled && automaticEmailEnabled && (ratings.length > 0 || reservations.length > 0)) {
      checkAutomaticMondayEmail(ratings, reservations, (report) => {
        console.log(
          `[Envío Automático Lunes] Reporte generado para ${report.recipients.join(', ')} con ${report.ratingsCount} calificaciones de cumpleaños.`
        );
        showToast.info('Reporte de Cumpleaños Disponible', {
          description: `Se detectaron ${report.ratingsCount} evaluaciones de cumpleaños listas para informar a coordinación.`,
          duration: 10000,
          action: {
            label: 'Abrir Correo',
            onClick: () => {
              try {
                const mailtoAnchor = document.createElement('a');
                mailtoAnchor.href = report.mailtoUrl;
                mailtoAnchor.target = '_blank';
                mailtoAnchor.rel = 'noopener noreferrer';
                document.body.appendChild(mailtoAnchor);
                mailtoAnchor.click();
                document.body.removeChild(mailtoAnchor);
              } catch (err) {
                console.warn('[Envío Automático Lunes] Error al abrir cliente de correo:', err);
              }
            }
          }
        });
      });
    }
  }, [ratings, reservations, enabled, automaticEmailEnabled]);

  const handleSaveRating = useCallback(async (rating: SpaceRating, targetReservation?: Reservation | null) => {
    await saveSpaceRating(rating, targetReservation || undefined);
  }, []);

  const handleDeleteRating = useCallback(async (ratingId: string) => {
    await deleteSpaceRating(ratingId);
  }, []);

  const checkRatingAllowed = useCallback((reservation: Reservation) => {
    return isRatingAllowedForReservation(reservation);
  }, []);

  return {
    ratings,
    setRatings,
    handleSaveRating,
    handleDeleteRating,
    checkRatingAllowed
  };
}
