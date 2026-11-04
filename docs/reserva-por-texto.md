# Detección de reservas por texto

La detección funciona en el navegador, sin enviar solicitudes a un servicio de IA ni agregar dependencias.

## Librerías evaluadas

| Opción | Licencia | Decisión |
| --- | --- | --- |
| [Fuse.js](https://github.com/krisk/Fuse) | Apache-2.0 | Ya estaba instalado. Se utiliza para reconocer nombres de espacios con errores leves, con umbral 0,2 y separación mínima entre candidatos de 0,08. Los números de sala deben coincidir exactamente. |
| [Chrono](https://github.com/wanasit/chrono) | MIT | Su documentación declara soporte parcial de español. No se agrega: las reglas locales permiten controlar fechas chilenas, recurrencias y ambigüedades de horario. |
| date-fns | MIT | Ya estaba instalado. Se conserva para validar fechas reales y calcular períodos. |

La búsqueda aproximada solo completa espacios existentes en el catálogo. No se utiliza para identificar personas ni completar RUT o contactos por semejanza.

## Formatos cubiertos

- Fechas ISO, día/mes/año, año corto y día/mes sin año. Sin año explícito se usa el año de la fecha seleccionada en el calendario.
- Meses escritos o abreviados: `20 noviembre`, `20 de noviembre de 2026`, `20 nov. 2026`.
- Mes compartido: `del 10 al 30 de noviembre`, `10, 17 y 24 de noviembre`.
- `hoy`, `mañana`, `pasado mañana`, `este miércoles`, `próximo viernes`. Estas expresiones usan el día actual; `referenceDate` permite fijarlo en pruebas.
- Horarios de 24 horas, AM/PM, puntos o dos puntos, `de 6 a 8 pm`, `entre las 6 y las 8 de la tarde`, `de seis y media a ocho de la tarde`.
- Inicio y duración: `a las 18 por 2 horas`, `a las 9:15 durante 90 minutos`. Sin duración se conserva la propuesta de una hora.
- Presentaciones como `soy María Soto`, `me llamo Juan Pérez`, y aforo como `seremos 25`.
- Días semanales y rangos como `de lunes a viernes`. Se excluyen los feriados de las series.
- Negaciones de equipamiento como `sin proyector ni micrófono, necesito 20 sillas`.

## Revisión y límites

Las fechas imposibles, horarios invertidos, salas numeradas no reconocidas y series inválidas generan avisos que impiden la creación directa hasta corregirlos. Las series se limitan a 366 días para evitar expansiones accidentales; los períodos mayores se revisan en el formulario completo. Varias fechas sin un patrón semanal requieren revisión explícita en ese formulario.

La búsqueda de salas alternativas descarta espacios inactivos, con capacidad insuficiente, ocupados o bloqueados. La vista previa vuelve a comprobar fecha, horario, aforo, feriados y conflictos después de los ajustes manuales. Si cambia el inicio de una serie, se regeneran sus sesiones.

Se conservan los valores predeterminados cuando no se menciona un dato; los campos detectados aparecen en las etiquetas de la vista previa. El resultado requiere revisión del usuario: las reglas no interpretan todas las formas posibles del español.

## Rendimiento

Los índices de nombres de sala, solicitantes históricos y reservas por fecha se almacenan en `WeakMap` usando la referencia del catálogo o del historial. Los datos deben actualizarse mediante nuevos arrays, como en el estado de React. El índice por fecha incluye reservas que cruzan medianoche. Se buscan alternativas solo cuando no hay sala seleccionada o la seleccionada no está disponible; cada sala se comprueba una vez por análisis.

## Verificación

```sh
npm test -- src/utils/__tests__/requestTextTemporal.test.ts src/utils/__tests__/requestTextParser.test.ts src/components/__tests__/quickRequestParsing.test.tsx src/components/__tests__/reservationContextMenu.test.tsx
npm run lint
npm run build
```
