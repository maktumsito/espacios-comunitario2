// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SpaceRatingModal } from '../SpaceRatingModal';
import type { Reservation, SpaceRating } from '../../types';
vi.mock('../../services/ratingService',()=>({isWeekend:()=>true,isBirthdayReservation:()=>true,isRatingAllowedForReservation:()=>({allowed:true})}));
afterEach(cleanup);
const reservation:Reservation={id:'rating-event',fecha:'2026-09-20',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',tipoActividad:'CUMPLEAÑOS',descripcion:'Cumpleaños',actividadRecurrente:'No'};
const rating:SpaceRating={id:'rating-event',reservationId:'rating-event',fecha:reservation.fecha,espacio:reservation.espacio,tipoActividad:reservation.tipoActividad,responsable:reservation.responsable,esCumpleanos:true,auxiliarName:'Evaluador',puntajeGeneral:5,limpieza:5,puntualidad:5,cuidadoInstalaciones:5,comportamiento:5,huboDanos:false,dejoBasura:false,excedioHorario:false,observaciones:'Comentario conservado',createdAt:'2026-09-20T12:00:00Z'};
it('waits for rating confirmation and prevents repeated submissions',async()=> {
  let confirm:()=>void=()=>{};const save=vi.fn(()=>new Promise<void>(resolve=>confirm=resolve));const close=vi.fn();
  const {baseElement}=render(<SpaceRatingModal isOpen reservation={reservation} existingRating={rating} onClose={close} onSaveRating={save} />);
  fireEvent.submit(baseElement.querySelector('form')!);fireEvent.submit(baseElement.querySelector('form')!);
  expect(save).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
  await act(async()=>confirm());expect(close).toHaveBeenCalledTimes(1);
});
it('preserves rating data and shows a rejected write',async()=> {
  const close=vi.fn();const {baseElement}=render(<SpaceRatingModal isOpen reservation={reservation} existingRating={rating} onClose={close} onSaveRating={async()=>{throw new Error('Guardado rechazado');}} />);
  await act(async()=>fireEvent.submit(baseElement.querySelector('form')!));
  expect(close).not.toHaveBeenCalled();expect(screen.getByText('Guardado rechazado')).toBeTruthy();
  expect((screen.getByDisplayValue('Comentario conservado') as HTMLTextAreaElement).value).toBe('Comentario conservado');
});
