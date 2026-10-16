# Ahorro adicional de lecturas y escrituras de Firestore

16 de octubre de 2026. Cambios implementados y comprobados localmente. No se desplegaron cambios, no se accedió a datos de producción ni se modificó el plan.

## Cambios

- **Ocupación:** cada transacción compara los slots leídos con su resultado. Una edición de descripción, contacto u otros campos ajenos a la ocupación evita reescribirlos. El orden de campos o reservas no provoca diferencias. Cambios de horario, responsable o estado sí actualizan el índice cuando corresponde. Se mantienen versiones, conflictos, reservas nocturnas, salas compuestas y limpieza de entradas antiguas.
- **Documentos vacíos:** no se crean slots ausentes sin ocupación ni se elimina una reserva ya ausente. Los slots vacíos existentes se conservan para evitar una eliminación adicional; su purga programada sigue disponible.
- **Auditoría:** una operación que cabe completa en una transacción y tiene un snapshot de hasta 16.000 bytes guarda ese snapshot en su manifiesto. Evita el documento de partes adicional. Las operaciones grandes o de varias transacciones conservan partes. La respuesta usa el manifiesto confirmado, evitando una lectura adicional después de guardar. El respaldo y la restauración siguen funcionando.
- **Mantenimiento:** consulta transaccional por `fechaFin >= primera fecha del grupo`. Los bloques terminados antes del grupo dejan de descargarse; se conservan intervalos largos y bloqueos del día siguiente para reservas nocturnas. Cancelar, eliminar y usar override autorizado no ejecuta esa consulta.
- **Cuentas:** guardar o eliminar devuelve los perfiles obtenidos en la propia transacción, con sus cambios confirmados. Evita leer el perfil por separado y descargar todas las cuentas otra vez. Guardar un perfil idéntico omite la escritura después de validarlo. Los cambios de contraseña siguen escribiéndose y revocando sesiones; se mantiene la protección del último administrador y de perfiles maestros.
- **Lecturas transaccionales repetidas:** cuando una reserva relacionada también es una condición de versión, se lee una sola vez dentro del mismo intento transaccional. Cada reintento crea un mapa nuevo. Las consultas explícitas de servidor conservan su propia lectura para garantizar frescura después de una escritura.
- **FCM:** un registro confirmado se reutiliza durante 24 horas si coinciden dispositivo, usuario, token y navegador. Inicializaciones simultáneas comparten escritura. Cambios de usuario/token se registran inmediatamente. Los fallos no quedan confirmados. `lastActive` representa la renovación diaria; no es presencia en vivo. Borrar remotamente un registro puede demorar su reparación hasta la siguiente renovación. Sin almacenamiento local la deduplicación no persiste entre recargas.

Se conservan las optimizaciones previas: listeners compartidos en servidor, sondeo agrupado y pausado en pestañas ocultas, reservas por ventana/fecha, historial bajo demanda, equipamiento por demanda y respaldos coordinados. No se sustituyen verificaciones de acceso ni lecturas transaccionales por permisos en caché.

## Comparaciones reproducibles

Estos valores cuentan operaciones/documentos en escenarios concretos del código. No son una medición de unidades facturadas en producción.

| Escenario | Antes de esta revisión | Ahora |
| --- | --- | --- |
| Editar solo descripción de una reserva en una sala, auditoría pequeña | 4 escrituras: reserva, slot, parte, manifiesto | 2: reserva y manifiesto |
| Editar solo descripción en dos salas, sin slot compuesto antiguo existente | 6 escrituras, incluyendo el slot compuesto vacío | 2: reserva y manifiesto |
| Crear una reserva sencilla, auditoría pequeña | 4 escrituras | 3 escrituras |
| Respuesta de guardado confirmado | 1 lectura posterior del manifiesto | 0 lecturas posteriores |
| Guardar perfil con N cuentas existentes | N + 1 lecturas transaccionales y N posteriores | N transaccionales |
| Eliminar perfil existente con N cuentas | N transaccionales y N − 1 posteriores | N transaccionales |
| Guardar perfil idéntico | 1 escritura | 0 escrituras, tras validación |
| 20 inicializaciones simultáneas del mismo registro FCM | 20 llamadas de escritura | 1 escritura confirmada |
| Reintentar una reserva ya confirmada con el mismo operationId | Podía reescribir slots | Sin escrituras de reserva ni slots |

El ahorro de slots se verifica mediante operaciones registradas en pruebas y mediante `updateTime` inalterado en el emulador. Una reserva que cambia de horario continúa actualizando sus slots de manera atómica.

## Verificación

- Suite general final: **529 pruebas aprobadas** en 87 archivos; las 39 pruebas de emulador se ejecutaron por separado.
- Pruebas de API de cuotas, incluyendo guardado idéntico y cambio de contraseña, y pruebas del escritor de reservas, incluyendo deduplicación de lecturas dentro de la transacción.
- Integración con Firestore y Auth emulados: **39 casos aprobados** entre persistencia y API, ejecutados juntos sobre la versión final.
- Incluye permisos revocados, denegación del SDK directo, concurrencia, restauración, auditoría pequeña/grande, bloques largos/nocturnos y recuperación de **220 reservas** repartidas en varias transacciones.
- TypeScript: sin errores. Compilación Vite y servidor: correcta. Tras el último cambio de servidor se regeneró su bundle correctamente.
- Log de la suite general: `work/firestore-quota-unit-tests.log` (archivo local ignorado por Git).

## Cuota gratuita y puesta en uso

Comprobación posterior del mismo día mediante la sesión de Chrome del usuario: AI Studio abre **Gestión de Espacios Comunitarios**, app `d2d6e668-cb02-4647-98d1-e8df0cf681ae`, publicada en `https://espacios.ai.studio/`. Firebase confirma el proyecto `gen-lang-client-0391852968` y la base configurada `ai-studio-gestindeespacios-d2d6e668-cb02-4647-98d1-e8df0cf681ae`: edición **Enterprise**, región `us-east1`, **CUOTA COMPARTIDA DE IA**. El proyecto figura con plan Blaze, pero la base sigue sujeta al grupo gratuito compartido. El usuario indica que Espacios es la aplicación que utilizará Firestore; esta revisión se limita a ella.

La consola también enumera una base SIGE dentro del mismo grupo. Su existencia no demuestra que tenga consumo; no se abrió su contenido ni se alteró. En **Uso → Current quota period**, la base de Espacios muestra aproximadamente **96.000 operaciones de lectura, 472 de escritura y 83 lecturas en tiempo real**. El período indicado es 16–17 de octubre GMT−7; el detalle accesible lo expresa desde el 16 de octubre a las 05:00 hasta el 17 a las 04:00 en Santiago. Son los valores mostrados en ese momento, no contadores auditados de facturación ni mediciones del código optimizado ya desplegado. [Abrir el uso de esta base](https://console.firebase.google.com/project/gen-lang-client-0391852968/firestore/databases/ai-studio-gestindeespacios-d2d6e668-cb02-4647-98d1-e8df0cf681ae/usage/last-24h).

Las cuotas documentadas de ese grupo son 50.000 unidades de lectura, 40.000 unidades de escritura y 50.000 unidades de actualización en tiempo real al día; las bases del grupo comparten el consumo. La documentación también señala 1 GiB de almacenamiento y 10 GiB de salida mensual. Véase la [documentación oficial de AI Studio y Firebase](https://firebase.google.com/docs/ai-assistance/ai-studio-integration).

Las cuotas compartidas no deben confundirse con el límite de Firestore Standard de 50.000 lecturas y 20.000 escrituras de documentos al día. El número de documentos ahorrados no determina por sí solo las unidades de cuota de otra edición. Véanse [cuotas generales](https://firebase.google.com/docs/firestore/quotas) y [facturación](https://firebase.google.com/docs/firestore/pricing).

Los cambios necesitan publicarse con frontend y backend juntos para afectar al consumo real. Después se debe comparar el mismo período y carga de trabajo en Firebase → Firestore → Uso, incluyendo otras aplicaciones del proyecto, usuarios, respaldos, transacciones y reconexiones. Las cuotas diarias se restablecen aproximadamente a medianoche del Pacífico; reducir consumo no recupera cuota ya gastada. Sin métricas agregadas de producción no se puede garantizar que todo el proyecto permanezca dentro del límite gratuito.
