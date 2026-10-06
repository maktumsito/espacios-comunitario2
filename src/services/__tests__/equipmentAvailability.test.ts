// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { calculateEquipmentAvailability } from '../equipmentService';
import type { Reservation, EquipmentItem } from '../../types';
const item:EquipmentItem={id:'chairs',name:'Sillas',category:'Mobiliario',totalQuantity:10};
const row:Reservation={id:'overnight',fecha:'2026-10-13',horaInicio:'23:00',horaFin:'02:00',terminaDiaSiguiente:true,espacio:'SALA 2',responsable:'Vecino',descripcion:'Actividad',tipoActividad:'Taller',actividadRecurrente:'Sí',equipamientoSolicitado:[{equipmentId:item.id,equipmentName:item.name,quantity:4}]};
beforeEach(()=>localStorage.clear());
it('counts borrowed equipment on both days of an overnight reservation',()=>{
  expect(calculateEquipmentAvailability('2026-10-13',1380,1440,[row],[item])[0].availableQuantity).toBe(6);
  expect(calculateEquipmentAvailability('2026-10-14',60,120,[row],[item])[0].availableQuantity).toBe(6);
  expect(calculateEquipmentAvailability('2026-10-14',120,180,[row],[item])[0].availableQuantity).toBe(10);
});
it('releases cancelled sessions and excludes the session being edited',()=>{
  expect(calculateEquipmentAvailability('2026-10-14',60,120,[{...row,estado:'cancelada'}],[item])[0].usedQuantity).toBe(0);
  expect(calculateEquipmentAvailability('2026-10-14',60,120,[row],[item],row.id)[0].usedQuantity).toBe(0);
});
it('adds legacy numeric quantities numerically instead of concatenating strings',()=>{
  const legacy={...row,equipamientoSolicitado:[{equipmentId:item.id,equipmentName:item.name,quantity:'4' as any}]};
  expect(calculateEquipmentAvailability('2026-10-14',60,120,[legacy,{...legacy,id:'other'}],[item])[0].usedQuantity).toBe(8);
});
