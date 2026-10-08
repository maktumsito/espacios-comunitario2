import { writeFileSync } from 'node:fs';
import { generateDailySchedulePdf, getDailySchedulePdfFilename } from '../../src/utils/dailySchedulePdf';
import type { Reservation } from '../../src/types';
const row: Reservation = { id:'pdf-current',fecha:'2026-10-13',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2 / SALA 3',responsable:'Synthetic',descripcion:'Synthetic activity',tipoActividad:'Taller',actividadRecurrente:'No',estado:'activa',terminaDiaSiguiente:false };
const doc=await generateDailySchedulePdf({dateStr:row.fecha,reservations:[row,{...row,id:'pdf-night',horaInicio:'23:00',horaFin:'01:00',espacio:'SALA 4',descripcion:'Synthetic overnight',terminaDiaSiguiente:true},{...row,id:'pdf-cancelled',descripcion:'Excluded cancellation',estado:'cancelada'},{...row,id:'pdf-other-day',fecha:'2026-10-14',descripcion:'Excluded other date'}],onlyOccupiedSpaces:true,include3DaysImportant:false,generatedBy:'Synthetic audit'});
writeFileSync('outputs/audit-2026-10-08-synthetic.pdf',Buffer.from(doc.output('arraybuffer')));
writeFileSync('outputs/audit-2026-10-08-pdf.json',JSON.stringify({date:row.fecha,filename:getDailySchedulePdfFilename(row.fecha),pages:doc.getNumberOfPages()},null,2));
