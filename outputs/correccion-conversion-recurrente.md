# Conversión de reserva individual a recurrente

## Falla reproducida

La ruta de guardado decidía el alcance según el tipo original de la reserva. Aunque el formulario pasara a recurrente y se omitieran días con topamiento, una reserva originalmente individual seguía guardándose mediante edición individual. Esa ruta descartaba las demás fechas y restauraba la metadata recurrente de la reserva original.

Tres pruebas fallaron antes del cambio: guardar todas las fechas libres, mover la reserva original cuando se omite su fecha y convertir cuando queda una sola sesión. Las otras tres comprobaban conservación ante fallos, ausencia de fechas y edición individual de una serie existente.

## Corrección

- La conversión usa una actualización de serie con todas las fechas restantes, incluso si la opción interna de creación completa estaba desactivada al abrir la reserva individual.
- Conserva el ID y la versión de la reserva original. Si su fecha se omite, mueve esa reserva a la primera fecha disponible y retira su disponibilidad anterior junto con la escritura confirmada.
- Crea las otras sesiones con IDs estables y asigna serie, índices, cantidad y fechas de recurrencia consistentes.
- Respeta horarios específicos y segundo espacio. No recrea fechas omitidas a partir de un análisis previo de feriados.
- Conserva el formulario ante rechazo o cuando no queda ninguna fecha. La edición de una sola ocurrencia de una serie existente sigue siendo individual.
- La vista previa y el texto de guardado se activan para todas las sesiones al convertir una reserva normal.

## Verificación

Ocho pruebas específicas aprobadas. Suite completa: **180 pruebas unitarias y 25 pruebas de integración aprobadas**, sin fallos. La ejecución unitaria omite los 25 casos de emulador, que se ejecutan por separado y no se cuentan dos veces. La integración local reproduce una reserva individual, otra actividad que ocupa el nuevo horario de su fecha original y dos fechas restantes; confirma dos sesiones persistidas, la versión incrementada del ID original, la retirada de su índice anterior y la conservación de la actividad ajena.

Se entregan los resultados completos en `conversion-unit-tests.json` y `conversion-integration-tests.json`. TypeScript y build aprobados. Las pruebas de persistencia usan únicamente Firestore local `demo-espacios`; no se escribieron datos de producción ni se ejecutaron migraciones. No se atribuye una ganancia porcentual de velocidad a esta corrección: se verificó el resultado funcional del guardado.

Esta corrección no modifica retroactivamente reservas ya guardadas. Los cambios deben desplegarse mediante el flujo habitual antes de usarlos en la aplicación publicada.
