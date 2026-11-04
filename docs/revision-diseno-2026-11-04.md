# Revisión de diseño y usabilidad

Fecha: 4 de noviembre de 2026.

Alcance: agenda, filtros y formulario de reservas. Diagnóstico basado en la inspección del código y la revisión visual de los componentes en un entorno local con datos de prueba. No corresponde a un estudio con usuarios ni a una auditoría completa de accesibilidad.

## Diagnóstico: cinco problemas por impacto

1. **Los filtros interrumpían el orden de lectura.** El panel se insertaba antes del contenido principal y antes del botón de la agenda que lo abría. Esto obligaba a buscar hacia arriba y separaba el control de su resultado.
2. **El bloqueo del avance no siempre explicaba qué corregir.** El botón Siguiente podía estar deshabilitado sin una indicación junto a él. Además, “Borrador al día” podía confundirse con una reserva ya confirmada.
3. **La agenda tenía poca jerarquía visual.** El título competía con el resumen y las vistas usaban botones de 28 píxeles de alto en escritorio. Costaba distinguir el contexto, los controles y los resultados.
4. **El formulario exigía interpretar textos innecesarios.** Encabezados como “Identificación y Tipo de Actividad”, etiquetas extensas y expresiones como “aforo esperado” aumentaban el esfuerzo de lectura.
5. **Las pantallas pequeñas perdían contexto y legibilidad.** El indicador de pasos ocultaba las etiquetas por debajo de 380 píxeles; algunas descripciones se truncaban. Los campos de filtros tenían texto de 14 píxeles, susceptible de provocar zoom automático en ciertos navegadores móviles.

## Propuesta aplicada, paso a paso

1. **Ubicarse:** título Agenda y resumen del período al inicio del contenido principal, antes de los avisos operativos.
2. **Elegir la presentación:** Mes, Día o Lista en un grupo con estado seleccionado y controles de al menos 44 píxeles de alto.
3. **Acotar los resultados:** el panel se abre debajo del control Filtros y antes del calendario o la lista. Se explica que los cambios se aplican automáticamente. Se conservan la búsqueda, todos los filtros y las acciones para corregir fechas o limpiar la selección.
4. **Registrar una reserva:** se mantiene la secuencia Actividad → Fecha y espacio → Solicitante → Recursos → Revisión. Los encabezados y las instrucciones son más breves. Las etiquetas cortas en celular se complementan con el nombre completo del paso actual y las etiquetas accesibles.
5. **Corregir y confirmar:** una indicación junto a Siguiente explica qué revisar cuando está bloqueado. El error del nombre se asocia al campo para lectores de pantalla. El borrador se identifica como guardado en el dispositivo y la reserva requiere confirmación explícita al final.

No se eliminaron campos obligatorios ni validaciones. La reducción de esfuerzo se concentra en la lectura, la localización de controles y la corrección de errores. Se conserva el acceso existente al formulario completo.

## Entregable final

Código editable implementado en:

- `src/App.tsx`: nueva posición de la agenda, filtros y avisos.
- `src/components/AgendaToolbar.tsx`: jerarquía, tamaños y vínculo accesible con el panel.
- `src/components/FilterBar.tsx`: instrucciones, presentación y lenguaje.
- `src/components/ReservationModalFooter.tsx`: explicación de bloqueos y estado del borrador.
- `src/components/ReservationStep1Activity.tsx` a `ReservationStep5Review.tsx`: textos más directos y error del nombre asociado al campo.
- `src/components/WizardStepsBar.tsx`: etiquetas breves visibles en celular.
- `src/index.css`: campos legibles en filtros y respeto de la preferencia de movimiento reducido.

Se conserva la paleta existente, la identidad, los permisos y las funciones. No se agregaron funciones de producto ni dependencias. Los cambios están en el proyecto local.

## Validación

- Comprobación de tipos y compilación de producción.
- Pruebas existentes de navegación de agenda, pasos del formulario, teclado, navegación del calendario y colores de reservas. Se actualizó una referencia a la etiqueta simplificada del tipo de actividad.
- Verificación local en 1366 × 900, 390 × 844 y 320 × 640: orden botón–panel, cierre de filtros, ausencia de desbordamiento horizontal, acción principal visible y guardado únicamente tras la confirmación final.
- Capturas y registro de comprobación en `output/revision-ux-2026-11-04/`. Las capturas muestran componentes aislados con datos de prueba.

## Resumen

La agenda sigue el orden contexto → vista → filtros → resultados.
Los controles principales son más legibles y cómodos de pulsar.
El formulario explica los bloqueos y distingue borrador de reserva confirmada.
Los textos son más breves y el progreso conserva contexto en celular.
Se mantienen la marca y las funciones existentes.
