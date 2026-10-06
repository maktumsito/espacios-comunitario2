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

export interface UseRatingsStateReturn {
  ratings: SpaceRating[];
  setRatings: React.Dispatch<React.SetStateAction<SpaceRating[]>>;
  handleSaveRating: (rating: SpaceRating, targetReservation?: Reservation | null) => Promise<void>;
  handleDeleteRating: (ratingId: string) => Promise<void>;
  checkRatingAllowed: (reservation: Reservation) => { allowed: boolean; reason?: string };
}

export function useRatingsState(reservations: Reservation[]): UseRatingsStateReturn {
  const [ratings, setRatings] = useState<SpaceRating[]>(() => getLocalRatingsCache());

  // Subscribe to Space Ratings from Firestore & Local Storage
  useEffect(() => {
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
  }, []);

  // Automated Monday Email Check for Birthday Loans
  useEffect(() => {
    if (ratings.length > 0 || reservations.length > 0) {
      checkAutomaticMondayEmail(ratings, reservations, (report) => {
        console.log(
          `[Envío Automático Lunes] Generando correo para ${report.recipients.join(', ')} con ${report.ratingsCount} calificaciones de cumpleaños.`
        );
        try {
          const mailtoAnchor = document.createElement('a');
          mailtoAnchor.href = report.mailtoUrl;
          mailtoAnchor.target = '_blank';
          mailtoAnchor.rel = 'noopener noreferrer';
          document.body.appendChild(mailtoAnchor);
          mailtoAnchor.click();
          document.body.removeChild(mailtoAnchor);
        } catch (err) {
          console.warn('[Envío Automático Lunes] Error al disparar cliente de correo:', err);
        }
      });
    }
  }, [ratings, reservations]);

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
