# Auditoría integral de Espacios Comunitarios — 2026-10-08

## 1. Entorno, alcance y dictamen

**Commit auditado:** `181f7eb27789a44cd071fb18815dd56123cb6902` (`fix: restore complete reservation changes with atomic audit tracking`). HEAD se comprobó al inicio y durante el cierre. El estado inicial tenía únicamente `?? output/`; se conservó. No se modificaron archivos funcionales, reglas, configuración productiva, dependencias declaradas ni el lockfile. Se añadieron diagnósticos en `scripts/audit/` y evidencias en `outputs/`. Los recursos descargados y compilados de prueba permanecen en `work/audit-tools/` y `dist/`, ignorados por Git.

**Entorno:** Windows/PowerShell, Node 26.10.0, npm 11.19.1, Firebase SDK instalado 12.19.0, Vitest 5.0.1, Firebase CLI local 15.33.0, Firestore Emulator 1.22.0, Java JRE 21 portable y Edge 154.0.4258.62 mediante Playwright 1.62.1 del runtime de Codex. Proyecto exclusivo `demo-espacios`, Firestore `127.0.0.1:8087`, Auth `127.0.0.1:9099`. Fechas civiles y navegadores: `America/Santiago`.

No se encontraron instrucciones `AGENTS.md` aplicables en el proyecto ni sus ancestros inspeccionados. Se revisaron el historial reciente, README, documentación de persistencia, permisos, correo y rendimiento, e informes anteriores. Las referencias archivo:línea siguientes corresponden al commit indicado; los diagnósticos son archivos nuevos.

**Dictamen: el checkout auditado no está preparado para producción.** Hay un hallazgo crítico, siete altos y dos medios confirmados. El bloqueo principal es la falta de autorización en Firestore. La existencia de sesiones firmadas y controles de interfaz/API no impide acceder directamente a la base. El estado efectivo del despliegue queda pendiente: no se consultó el despliegue ni se alteraron sus datos, reglas, credenciales, índices o configuración.

La auditoría se ejecutó, incluido el recorrido integrado. Sus límites se detallan abajo; ninguna prueba aprobada se interpreta como ausencia general de errores.

## 2. Resumen ejecutivo y mejoras contrastadas

Los principales riesgos son:

- Escrituras y lecturas directas sin sesión sobre cuentas, reservas, disponibilidad y auditoría; un lector autenticado también puede escribir.
- Credenciales predeterminadas recuperables del código y hashes incorporados al bundle; cambiar una contraseña no revoca la sesión firmada anterior.
- Eliminación desde una selección antigua que borra una edición posterior, sin proteger la versión que vio el usuario.
- Respaldos que anuncian éxito restaurando solo reservas y que aceptan contenido alterado sin verificar su checksum.
- Recuperación de importaciones parciales que confirma todos los datos pero omite el registro de auditoría.
- Reservas autorizadas en feriados que se guardan correctamente y luego se ocultan en la caché.
- Duplicados de despacho entre instancias y tras reinicios con fallos al guardar la marca; estadísticas cuyo total refleja el conjunto cargado sin indicar su alcance temporal.

Se verificaron mejoras ya implementadas y **no se presentan como trabajo pendiente**:

| Mejora actual | Evidencia y alcance comprobado |
|---|---|
| Sesiones HMAC, rechazo de tokens antiguos/manipulados y revisión de permisos en API | Suite existente de `AppSessions` y peticiones HTTP reales: anónimo/falsificado 401, lector 403, cambio de permisos 403, cuenta eliminada 401 |
| Versiones e idempotencia del writer | Integración existente y carrera con dos SDK independientes: una edición gana; reintentar una operación confirmada no duplica reservas ni slots |
| Reemplazo vinculado y movimiento que omite conflictos | Recorrido con hooks reales: original cancelado, excepción enlazada, dos futuras movidas y una conflictiva conservada |
| Journal durable en IndexedDB | Script existente en Edge aprobado; cuota superior a localStorage, recarga, abortos y migración incompleta cubiertos |
| Restauración atómica de auditoría del último commit | Dos clientes dejan una sola revisión, marca de reversión y nuevo log; edición posterior bloqueada; snapshots fragmentados reales restaurados; manifiesto incompleto rechazado |
| Respaldo desde consultas completas del servidor | La prueba existente incluye historia no presente en caché; el recorrido restauró 504 reservas con igualdad de campos de negocio |
| Coordinación de respaldos | Dos clientes adquieren una sola reserva de ejecución; expiración y finalización por propietario comprobadas con Firestore real |
| Listeners compartidos y carga histórica bajo demanda | Suites existentes aprobadas salvo incidencia inicial de pruebas descrita abajo; no se mantienen las antiguas afirmaciones de descarga global del scheduler |
| Conservación de historial remoto | `purgeAuditLogs` ahora rechaza la purga; ya no intenta borrar la colección. Las antiguas consultas del servidor a `reservas_comunitarias_v2` y los helpers de descarga global señalados por el informe del 07-10 no están en el servidor actual |

## 3. Hallazgos confirmados

### C-01 — Crítico: Firestore permite eludir la autorización y falsificar el autor

- **Archivos:** `firestore.rules:121`, `:135`, `:149`, `:156`, `:203`; contraste con `server/appSession.ts:76`.
- **Evidencia:** `audit-2026-10-08-contracts.json`, `audit-2026-10-08-observations.json`, escenarios SEC-01/02/03. Las reglas cargadas rechazaron la colección de control cerrada. Aun así, cuatro escrituras anónimas fueron aceptadas: cuenta privilegiada, reserva, slot arbitrario y log con autor proporcionado por el cliente. PATCH REST sin Authorization devolvió 200; el SDK autenticado como lector también escribió.
- **Reproducción:** ejecutar SEC-01/02/03 contra los emuladores con las reglas del repositorio. No emitir una sesión de aplicación para SEC-01/02; crear una identidad Firebase local y una cuenta de lectura para SEC-03.
- **Esperado / observado:** negar acceso anónimo y escritura del lector; se acepta. El log registra el autor inventado. El formato de los documentos se valida parcialmente, pero no la identidad, el rol ni la coherencia transaccional entre reserva y disponibilidad.
- **Impacto:** escalamiento de privilegios, lectura de hashes, alteración/eliminación de datos, manipulación de disponibilidad e identidad de auditoría. Las garantías del writer no protegen escrituras que lo eluden.
- **Corrección propuesta:** establecer una frontera de confianza en el servidor para las mutaciones, validar cada permiso y derivar allí el autor. Cerrar escrituras directas; integrar una identidad Firebase verificable para lecturas autorizadas o servirlas mediante API. Separar perfiles visibles de hashes y configuración privada. Una sesión HMAC propia no crea automáticamente `request.auth` en Firestore: endurecer reglas sin adaptar los flujos legítimos rompería el acceso.
- **Aceptación:** SEC-01/02/03 rechazan los accesos indebidos; cuentas legítimas operan con sus permisos actuales; ninguna solicitud puede modificar rol propio, versiones, slots o autor fuera del flujo autorizado. Revisar además las reglas efectivamente desplegadas en cada base.

### A-01 — Alto: credenciales predeterminadas expuestas y hashes de contraseña rápidos

- **Archivos:** `src/services/authService.ts:44`, `:46`, `:127`; `server/appSession.ts:134`.
- **Evidencia:** `audit-2026-10-08-static-security.json`: cinco cuentas con comentarios que revelan la contraseña, cinco verificaciones criptográficas coincidentes y cinco hashes encontrados en assets de navegador. El informe omite nombres, contraseñas y hashes. Se emplea SHA-256 con una sal compartida; el backend mantiene compatibilidad con valores antiguos sin hash.
- **Reproducción:** inspeccionar localmente las cuentas predeterminadas, verificar sus comentarios contra el algoritmo y buscar los hashes en `dist/assets/*.js`, sin imprimir valores. El diagnóstico registra únicamente cantidades y booleanos.
- **Esperado / observado:** credenciales administradas fuera del cliente y un derivador de contraseña con coste; material verificable expuesto en código y bundle.
- **Impacto:** compromiso de cuentas que conserven esos valores y ataques offline facilitados por C-01. No se probó ninguna contraseña contra producción.
- **Corrección propuesta:** retirar material de autenticación del frontend, eliminar defaults privilegiados de arranque, sustituir el derivador por Argon2id/scrypt en servidor con sal individual y migración explícita; rotar credenciales afectadas y retirar compatibilidad insegura tras la transición.
- **Aceptación:** compilación sin hashes/credenciales, cuentas creadas mediante flujo autorizado, credenciales anteriores rechazadas y pruebas del esquema nuevo. La vigencia real de las cuentas predeterminadas requiere comprobación de despliegue.

### A-02 — Alto: cambiar una contraseña no invalida la sesión anterior

- **Archivo:** `server/appSession.ts:57`, `:76`.
- **Evidencia:** `audit-2026-10-08-session.json` y `audit-2026-10-08-api.json`. Tras cambiar el hash de una cuenta sintética, el token previo sigue autorizando una petición protegida: HTTP 200. La misma prueba confirma que revocar permisos produce 403 y eliminar la cuenta produce 401.
- **Reproducción:** iniciar sesión, cambiar la contraseña persistida y reutilizar el token inicial en `/api/email/send` con el modo local simulado.
- **Esperado / observado:** el token anterior pierde validez; permanece aceptado. Las claims contienen usuario y tiempos, sin revisión de credenciales/sesión contrastada con la cuenta.
- **Impacto:** un token obtenido antes de una rotación continúa útil durante su vigencia y puede renovarse dentro del límite absoluto existente.
- **Corrección propuesta:** incorporar una revisión de sesión o fecha de revocación comprobada en cada petición y renovación; incrementarla al cambiar contraseña o revocar sesiones.
- **Aceptación:** SEC-04 pasa; token viejo y refresh reciben 401 tras rotar, mientras una nueva autenticación funciona. Mantener las pruebas existentes de vencimiento y techo de doce horas.

### A-03 — Alto: la eliminación no protege la versión seleccionada en la interfaz

- **Archivos:** `src/hooks/useReservationCrud.ts:173`, `src/services/reservationService.ts:998`, `src/services/reservationWriter.ts:249`.
- **Evidencia:** CON-02: el cliente A guarda su selección de versión 1; B confirma versión 2; A elimina por ID y la reserva editada desaparece. El writer sí compara contra una versión de preflight, pero esa lectura ya contiene la edición de B, no la versión que A seleccionó.
- **Reproducción:** crear, leer desde A, editar desde el segundo SDK y ejecutar `deleteReservationById` desde A sin recargar su selección.
- **Esperado / observado:** rechazar la selección antigua; eliminación aceptada. El hook puede conservar un snapshot anterior al documento realmente eliminado para su auditoría.
- **Impacto:** pérdida de cambios confirmados por otro usuario y restauración basada en un estado anterior incorrecto.
- **Corrección propuesta:** pasar obligatoriamente las versiones seleccionadas de todos los objetivos de eliminación mediante `expectedVersions`, y capturar el estado eliminado confirmado para auditoría. Extenderlo a eliminaciones de serie y autorizaciones de solicitudes.
- **Aceptación:** CON-02 rechaza la operación sin modificar reserva/slots/logs; eliminación desde versión actual funciona; una carrera posterior al preflight también se rechaza.

### A-04 — Alto: la restauración de respaldo solo aplica reservas

- **Archivo:** `src/services/backupService.ts:295`, `:693`, `:711`.
- **Evidencia:** BAK-01: se respaldan catálogo y evaluación; se alteran; restaurar devuelve `success: true`, pero ambos siguen modificados. El payload contiene espacios, tipos, equipamiento, perfiles y calificaciones; la restauración aplica únicamente `data.reservas`.
- **Reproducción:** crear un respaldo de una reserva, un catálogo y una evaluación; cambiar estos últimos; restaurar y comparar sus documentos.
- **Esperado / observado:** recuperación de las entidades incluidas con sus relaciones; se restauran solo reservas. Los bloqueos y la auditoría tampoco están incluidos en el payload actual. Los índices de disponibilidad se reconstruyen mediante el writer, no mediante una copia de índices desplegados.
- **Impacto:** falsa expectativa de recuperación completa y relaciones/catálogos incompatibles con las reservas restauradas.
- **Corrección propuesta:** definir y aplicar un contrato versionado de recuperación para todas las entidades respaldadas, con informe por colección y plan de ejecución recuperable. Incorporar bloqueos o declarar expresamente su exclusión. Preservar auditoría append-only y no exportar/restaurar hashes de contraseña mediante backups del navegador.
- **Aceptación:** BAK-01 pasa; round trip de campos y referencias de cada colección soportada; exclusiones explícitas; errores parciales no producen éxito global; slots finales corresponden a las reservas restauradas.

### A-05 — Alto: la lectura/restauración de respaldos no verifica integridad

- **Archivo:** `src/services/backupService.ts:309`, `:644`.
- **Evidencia:** BAK-02 cambia un fragmento a otro JSON válido conservando el checksum original; `fetchFullBackupRecord` devuelve el contenido alterado. El checksum se genera al crear, pero no se compara al recuperar.
- **Reproducción:** crear respaldo, alterar únicamente la descripción serializada en una parte y cargarlo por ID.
- **Esperado / observado:** rechazar la discrepancia antes de cualquier escritura; se acepta el payload alterado.
- **Impacto:** restauración de contenido corrupto o manipulado. C-01 amplía la posibilidad de alterar tanto fragmentos como metadatos.
- **Corrección propuesta:** validar cantidad, índices contiguos, pertenencia de partes, tamaño, estructura y digest de bytes antes de aplicar cambios. Proteger manifiestos y fragmentos mediante autorización; un checksum modificable por el atacante no acredita autenticidad.
- **Aceptación:** BAK-02 rechaza; casos de partes ausentes, repetidas, reordenadas, truncadas y contenido corrupto dejan la base intacta; backups antiguos tienen una política explícita de validación/compatibilidad.

### A-06 — Alto: recuperar un guardado parcial pierde la auditoría ordinaria

- **Archivos:** `src/hooks/useReservationCrud.ts:464`, `:472`, `src/services/reservationOperationJournal.ts:10`, `src/services/reservationService.ts:985`.
- **Evidencia:** `audit-2026-10-08-recovery.json`, REC-01. Se invoca el hook real de importación, inyectando una excepción después de confirmar el primer chunk real de Firestore. Reanudar deja 500 reservas confirmadas, cero pendientes y cero logs de importación. El recorrido de navegador también muestra que los logs no aumentan al completar la operación recuperada.
- **Reproducción:** ejecutar REC-01. La única sustitución del servicio añade el fallo al callback de progreso; persisten el writer, transacciones, hook y servicios reales. En navegador, la interrupción se provoca en el servicio después de un chunk confirmado con IndexedDB real.
- **Esperado / observado:** la operación recuperada conserva un registro completo e idempotente; el log se crea solamente si el hook original alcanza el código posterior al guardado. El journal ordinario no conserva contexto de auditoría. La restauración de auditoría sí tiene un contexto específico y no presenta este mismo problema.
- **Impacto:** cambios sin trazabilidad ni snapshot para restauración, incluso después de informar que ya no quedan operaciones pendientes.
- **Corrección propuesta:** persistir el contexto completo de auditoría junto con la operación, generar un ID determinista y completar su publicación al reanudar. Conservar estados previos confirmados por chunk y registrar explícitamente progreso y confirmación de operaciones grandes.
- **Aceptación:** REC-01 pasa; interrupción/recarga/reanudación producen un único log completo; un reintento no duplica el historial y no atribuye como propias ediciones posteriores de otros usuarios.

### A-07 — Alto: feriados autorizados desaparecen de la caché confirmada

- **Archivo:** `src/services/reservationService.ts:478`, `:545`, `:645`.
- **Evidencia:** HOL-01 y `audit-2026-10-08-browser-checks.json`: reserva autorizada en 25-12-2026 persistida, ausente de `getLocalCache()`. El writer acepta la autorización, pero los filtros de caché eliminan incondicionalmente todo feriado.
- **Reproducción:** guardar una reserva sintética autorizada en un feriado y comparar documento, caché y estados de interfaz tras guardado/recarga.
- **Esperado / observado:** conservar la reserva autorizada; se oculta. Durante la sesión, el evento de progreso puede insertarla en la interfaz y la exportación aun cuando la caché la excluye, por lo que los conjuntos difieren.
- **Impacto:** agenda incompleta, desaparición al recuperar la caché y decisiones de edición/consulta basadas en distintos conjuntos. Los slots del servidor siguen protegiendo el horario.
- **Corrección propuesta:** separar validación de autorización de visibilidad y usar una regla consistente en hidratación, suscripciones, caché y recuperación; no eliminar silenciosamente reservas persistidas válidas.
- **Aceptación:** HOL-01 pasa; autorización válida se conserva tras guardar, recargar, abrir otra pestaña y consultar por fecha; creación no autorizada sigue rechazada.

### M-01 — Medio: despacho duplicado entre instancias y después de un reinicio

- **Archivos:** `server.ts:445`, `:509`, `:615`, `:626`, `:641`; `server/scheduledDispatch.ts:12`.
- **Evidencia:** `audit-2026-10-08-scheduler.json`: dos instancias de módulo ejecutan con éxito el mismo ciclo; con fallo al guardar la marca, la segunda llamada del mismo proceso se omite, pero una instancia reiniciada vuelve a despachar.
- **Reproducción:** ejecutar `scheduler-run.cjs` sin otro backend scheduler activo. Compila las declaraciones del servidor sin su arranque automático, usa el simulador local y una barrera antes de la entrega para que ambas instancias alcancen el mismo punto. Inyecta un fallo únicamente en la escritura de la marca posterior a la entrega.
- **Esperado / observado:** coordinación compartida del ciclo y reconciliación del resultado confirmado; protección local por proceso y lectura/escritura separadas permiten dos ejecuciones. La protección en memoria del mismo proceso funciona y se reconoce.
- **Impacto:** destinatarios reciben duplicados en despliegues con varias instancias o en recuperación. No se enviaron correos reales; se confirmó la duplicación de decisiones de despacho y generación de adjuntos simulados.
- **Corrección propuesta:** reserva transaccional compartida y registro durable de despacho con clave de ciclo y estado de entrega. Tratar explícitamente el resultado ambiguo proveedor/base y el reenvío manual; una reserva por sí sola no resuelve la ventana posterior a la entrega.
- **Aceptación:** dos instancias y reinicios completan un único ciclo o lo dejan pendiente de reconciliación; fallos antes/después de entregar no provocan omisiones silenciosas ni reenvío automático inseguro. Verificar aparte garantías del proveedor real.

### M-02 — Medio: estadísticas presentan como total un conjunto cargado parcial

- **Archivos:** `src/components/AnalyticsView.tsx:26`, `:86`; `src/services/reservationService.ts:659`, `:693`; `src/App.tsx:1180`.
- **Evidencia:** `audit-2026-10-08-browser-checks.json`: tres reservas persistidas, incluida historia anterior a la ventana activa; la tarjeta muestra `2 / Total de Reservas`. El histórico no cargado queda fuera. La caché puede incorporar historia al navegar, por lo que el alcance no es fijo.
- **Reproducción:** iniciar con caché vacía y documentos actuales e históricos; abrir estadísticas sin navegar al período histórico.
- **Esperado / observado:** un total con período y cobertura explícitos o un conjunto completo solicitado para ese cálculo; número de filas de las props sin rótulo de alcance. CSV también exporta el conjunto cargado, pero sí indica «registros actualmente disponibles»; esa exportación parcial explícita no se clasifica como respaldo completo defectuoso.
- **Impacto:** interpretación incorrecta de cantidades y diferencias entre usuarios o sesiones con distintas cargas históricas.
- **Corrección propuesta:** seleccionar un período explícito, mostrar rango/cobertura y cargar datos autoritativos de ese período antes de calcular. Ofrecer exportación completa separada de exportación del conjunto visible.
- **Aceptación:** iguales períodos y permisos producen iguales cifras con caché fría/caliente y antes/después de navegar al historial; no se presenta un subconjunto como total global.

## 4. Recorrido integrado con dos usuarios

Evidencia: `audit-2026-10-08-browser/summary.json`, JSON de cada paso y capturas sintéticas. Dos contextos independientes se autenticaron mediante la API real. Se usaron hooks/servicios originales en Edge, SDK real y IndexedDB; los pasos fueron conducidos por un puente de diagnóstico. La interrupción se inyectó en el servicio después de confirmar un chunk. No todos los pasos se hicieron mediante clics del wizard; el probe muestra el estado del hook y las capturas muestran la aplicación real. Las pruebas adicionales de lector, foco, Escape y CSV sí ejercieron controles visibles.

| Paso | Reservas persistidas | Documentos de slots | Logs | Pendientes | Resultado |
|---|---:|---:|---:|---:|---|
| Crear serie de cuatro sesiones | 4 | 4 | 1 | 0 | Aprobado |
| Reemplazar primera sesión | 5 | 4 | 2 | 0 | Fuente cancelada y vínculos bilaterales; excepción ocupa su horario |
| Mover futuras omitiendo un conflicto | 6 | 4 | 3 | 0 | Dos sesiones movidas; una conservada con su horario anterior |
| Editar desde el segundo cliente | 6 | 4 | 4 | 0 | Nueva revisión confirmada |
| Interrumpir lote de 500 objetivos | 230 | 228 | 4 | 1 | 225 objetivos confirmados y 275 pendientes; operación conservada |
| Editar otra vez desde B, recargar A y recuperar | 505 | 503 | 4 | 0 | Mismos IDs, sin duplicados; edición de B preservada; auditoría ordinaria ausente |
| Restaurar desde auditoría | 504 | 503 | 5 | 0 | Movimiento bloqueado por edición posterior; reemplazo independiente revertido atómicamente |
| Crear, cargar y restaurar respaldo | 504 | 503 | 7 | 0 | Reservas iguales en campos de negocio; versiones y metadatos de persistencia cambian legítimamente |

Se comprobó la correspondencia de IDs de caché con las reservas activas en todos los pasos. Las canceladas permanecen en el servidor y tienen otra política de visibilidad. Se compararon campos, versiones, vínculos y auditoría en los JSON, no solo cantidades. Los slots son documentos por día/espacio y pueden contener varias reservas adyacentes; su número no tiene que igualar el de reservas.

## 5. Matriz de verificación y límites

| Escenario | Estado | Evidencia / límite |
|---|---|---|
| Acceso anónimo SDK/REST, cuenta privilegiada, slot y autor falsificado | Fallido | SEC-01/02, C-01; reglas actuales cargadas, control cerrado rechazado |
| Escritura directa por lector Firebase autenticado | Fallido | SEC-03; no se verificó un despliegue real |
| API anónima/falsificada, lector, revocación y cuenta eliminada | Aprobado | HTTP real 401/403/401 en `audit-2026-10-08-api.json` |
| Cambio de contraseña revoca token | Fallido | SEC-04, A-02; reproduce también en backend real local |
| Vencimiento, renovación, límite absoluto, Google verificado y rate limit | Aprobado con alcance unitario | Suite existente; integración Google real pendiente |
| Dos clientes crean el mismo horario | Aprobado | Suite existente de emulador: un ganador |
| Dos clientes editan la misma revisión | Aprobado | CON-01: versión final 2 y una entrada de disponibilidad |
| Selección antigua seguida de eliminación | Fallido | CON-02, A-03 |
| Cancelación, borrado, slots nocturnos y salas compuestas | Aprobado | Integración existente; no demuestra protección de la versión seleccionada al borrar |
| Intervalos adyacentes y conflictos históricos permitidos | Aprobado | Integración existente; se respeta la exención histórica explícita, sin clasificarla como colisión nueva |
| Feriados: autorización y rechazo de creación no autorizada | Aprobado en persistencia / fallido en caché | Integración existente y HOL-01 |
| Bloqueos de mantenimiento en movimientos | Aprobado con alcance de hooks | Suite existente; carrera de creación de bloqueo durante una transacción de reserva no verificada |
| Una sesión, siguientes, serie pendiente; conversión/agrupación/ampliación | Aprobado con cobertura mixta | Suites existentes, integración de conversión y recorrido; no todas las combinaciones vía wizard real |
| Límites inclusivos y cambios horarios de Santiago | Aprobado | Suite existente y DATE-01 en `TZ=America/Santiago` y `TZ=UTC`, ambos cambios de 2026 |
| Restauración simultánea, edición posterior y presupuesto atómico | Aprobado | AUD-01/02, transacciones reales; una revisión restaurada y un nuevo log |
| Snapshots fragmentados, adjuntos y manifiesto incompleto | Aprobado | AUD-03: tres adjuntos sintéticos de 300.000 caracteres, restauración y rechazo sin escrituras |
| Registros antiguos / historial / doble clic local | Aprobado con alcance unitario | Suites existentes de plan de restauración y servicio; inventario histórico real pendiente |
| IndexedDB: recarga, cuota y abortos | Aprobado | Script existente de navegador y recorrido; no se acredita tolerancia a todos los fallos de sistema operativo |
| Reanudar sin sobrescribir filas confirmadas posteriormente editadas | Aprobado | Integración existente y recorrido con B |
| Auditoría de importación recuperada | Fallido | REC-01, A-06 |
| Cambio de cuenta / otra pestaña | Aprobado para autorización de reanudación | Journal compartido por origen, filtrado por actor en UI y bloqueo del servicio; no se afirma separación física de datos |
| Round trip de reservas de respaldo | Aprobado | 504 filas comparadas, mismos campos de negocio y disponibilidad reconstruida |
| Round trip de catálogos/evaluaciones | Fallido | BAK-01, A-04 |
| Checksum de respaldo | Fallido | BAK-02, A-05 |
| Adquisición simultánea, expiración y propietario de respaldo | Aprobado | BAK-03, dos clientes reales |
| Backup de duración superior a 30 minutos / relojes divergentes | No verificado | No hay renovación visible de lease; riesgo plausible descrito abajo |
| Correo manual con permisos y transporte simulado | Aprobado | Backend real local, ninguna entrega externa |
| Scheduler concurrente / marca fallida y reinicio | Fallido | M-01; entrega local simulada con barrera reproducible |
| Reintentos y consultas compartidas del scheduler | Aprobado con alcance unitario | Suites existentes de `scheduledDispatch` y `SharedServerDocument` |
| PDF: fecha, salas compuestas, noche, cancelación y otra fecha | Aprobado para fixture | jsPDF real, extracción pypdf y render Poppler inspeccionado; una página legible sin recortes |
| Gmail OAuth/SMTP real, dos procesos desplegados y entrega | No verificado | El modo local omite rutas OAuth; pruebas unitarias no equivalen a intercambio con Google |
| Listeners compartidos y liberación de suscripciones | Aprobado con alcance unitario | Suite existente; consumo facturado y fuga sostenida de varias horas no medidos |
| Caché histórica fría/caliente y TTL | Aprobado en repetición aislada | Dos fallos iniciales de la suite general no se reprodujeron ejecutándola sola; no se elevan a defecto funcional confirmado |
| CSV y estadísticas completos/rotulados | Parcial | CSV declara registros disponibles; estadísticas no explicitan su alcance, M-02 |
| Rendimiento 500/2.500/10.000 | Ejecutado | Core, interfaz y consultas reales al emulador; facturación no medida |
| Móvil/escritorio, foco y Escape | Aprobado para controles ejercidos | Edge a 390/1.200 px; lector no abre creación, foco dentro del modal y Escape cierra |
| Modales superpuestos y formularios ante errores | Aprobado con alcance DOM/unitario | Suites existentes; no se recorrieron todas las superposiciones y errores de red mediante clics reales |
| Reglas, IAM, índices, secretos y backups nativos desplegados | No verificado | Fuera del entorno autorizado; no se conectó a producción |

### Riesgos plausibles que necesitan más evidencia

- **Respaldo lento y lease:** `backupScheduleCoordinator.ts:6` usa una reserva de treinta minutos sin renovación visible. Un dispositivo lento puede seguir trabajando cuando otro adquiere la reserva vencida. BAK-03 valida recuperación y propietario, no dos backups completos de más de treinta minutos ni relojes desalineados.
- **Restauración global grande:** `seedAllToFirestore` permite varios chunks; no ofrece atomicidad global de todas las colecciones. Falta inyectar fallos en cada punto de una recuperación completa grande y comprobar su reconciliación final. La restauración desde auditoría exige atomicidad y rechaza operaciones demasiado grandes antes de empezar.
- **Publicación de auditoría ordinaria:** `auditLogService.ts:259` conserva localmente un log si falla Firestore y absorbe el error. Se debe comprobar durabilidad, visibilidad y reconciliación después de una caída completa entre reservas y publicación; el fallo confirmado A-06 es una reproducción específica distinta.
- **Historia/semilla local:** la ventana activa conserva histórico de caché y existe un dataset inicial de fallback. Una primera ejecución sin caché vacía mostró una cantidad superior a los documentos del fixture; se aisló usando caché sintética vacía. Falta validar bootstrap y limpieza histórica contra un dataset real autorizado. No se incluyeron filas de esa semilla en los entregables.
- **Límites reales:** el emulador no reproduce todas las características de producción ni exige índices compuestos. El límite interno de 450 operaciones y 8 MB es una salvaguarda de la aplicación, no una prueba de todos los límites del servicio. Referencias oficiales: [conexión y diferencias del emulador](https://firebase.google.com/docs/emulator-suite/connect_firestore), [cuotas y límites](https://firebase.google.com/docs/firestore/quotas). Firestore documenta 1 MiB por documento y 10 MiB por solicitud; no confundir el límite de transformaciones de campos con un presupuesto total de reservas.

## 6. Mediciones

### Consultas reales: servidor y caché

`audit-2026-10-08-read-performance.json`. Fixtures sintéticos creados exclusivamente por REST en el emulador; no construyen slots y no se usan para evaluar integridad de disponibilidad. Una muestra por consulta, por lo que estos tiempos no son percentiles. La caché es la caché en memoria del SDK de ese proceso, distinta de IndexedDB persistente del navegador.

| Documentos del fixture | Alcance | Documentos devueltos | Servidor ms | Caché ms |
|---:|---|---:|---:|---:|
| 500 | Completo | 500 | 228,7 | 14,7 |
| 500 | Ventana editor | 250 | 60,3 | 17,5 |
| 500 | Día lector | 125 | 24,2 | 7,0 |
| 2.500 | Completo | 2.500 | 423,6 | 59,0 |
| 2.500 | Ventana editor | 1.250 | 193,0 | 66,2 |
| 2.500 | Día lector | 625 | 106,6 | 23,3 |
| 10.000 | Completo | 10.000 | 2.244,8 | 303,0 |
| 10.000 | Ventana editor | 5.000 | 994,1 | 343,7 |
| 10.000 | Día lector | 2.500 | 522,9 | 115,8 |

Las respuestas de servidor indican `fromCache=false`; las de caché, `true`. Se observaron documentos retornados y tiempos. No se contaron todos los reintentos, verificaciones de reglas, entradas de índice, tráfico facturable ni otros clientes; **no son lecturas facturadas ni estimaciones de una factura**.

### Interfaz y cálculo local

Tres calentamientos y treinta muestras, Edge headless con CPU limitada a 4×. Browser benchmark aislado del cloud y precargado con datos sintéticos: mide renderizado/acciones, no login ni transporte de Firestore. Se adaptó en memoria el benchmark anterior para la comprobación actual del formato de sesión; no se cambió la aplicación. Resultados completos en `audit-2026-10-08-browser.json` y `audit-2026-10-08-performance.json`.

| Reservas | Abrir formulario móvil mediana/p95 ms | Abrir formulario escritorio mediana/p95 ms | Búsqueda core mediana ms | PDF core mediana ms |
|---:|---:|---:|---:|---:|
| 500 | 307,1 / 408,9 | 509,5 / 922,0 | 12,14 | 19,06 |
| 2.500 | 214,1 / 266,8 | 772,2 / 1.349,6 | 56,49 | 70,70 |
| 10.000 | 329,3 / 469,8 | 2.267,5 / 3.093,4 | 231,67 | 252,10 |

La medición general compartió el host con otras tareas de auditoría. Por la latencia observada se repitió escritorio/10.000 sin otra carga intensa: apertura **1.491,9 ms mediana / 1.984,4 ms p95**, escritura **124,7 / 143,7 ms**, cambio de vista **294,9 / 406,2 ms**, sin `pageerror`. Archivo `audit-2026-10-08-isolated-browser.json`. Es una oportunidad de optimización confirmada en este entorno, sin atribuir un SLA de producción ni un porcentaje de mejora respecto de informes anteriores.

## 7. Comandos y resultados reproducibles

Ejecutar desde la raíz. Los scripts que limpian Firestore apuntan explícitamente al proyecto demo local; **no ejecutar contra otro host/proyecto**. No ejecutar simultáneamente los diagnósticos que resetean fixtures. Mantener un único scheduler de fondo, salvo el escenario controlado que crea sus propias instancias.

### Preparación y servicios locales

Java portable se descargó de Adoptium y se verificó contra el SHA-256 del paquete. Firebase CLI se instaló solo bajo `work/audit-tools`, sin cambiar package.json/lockfile. Playwright ya estaba disponible en el runtime local:

```powershell
$env:NODE_PATH = 'C:\Users\cshute\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$auditJavaBin = Split-Path (Get-ChildItem work/audit-tools/java21 -Filter java.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName)
$env:PATH = "$auditJavaBin;$env:PATH"
$env:TZ = 'America/Santiago'
node work/audit-tools/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only firestore,auth --project demo-espacios --config firebase.json
```

En terminales separadas, cuando corresponda:

```powershell
$env:VITE_LOCAL_TEST_MODE = 'true'
$env:AUTH_SESSION_SECRET = 'synthetic-audit-secret-more-than-32-characters'
$env:EMAIL_SCHEDULER_SECRET = 'synthetic-scheduler'
node --require ./scripts/audit/server-preload.cjs --import tsx server.ts
node node_modules/vite/bin/vite.js --config scripts/audit/vite.config.ts
```

El preload evita cargar `.env` y bloquea fetch/HTTP externos del backend de prueba. El servidor usa `demo-espacios`; su rama local simula entregas y omite OAuth. Vite usa un `envDir` vacío y proxy local a la API; los contextos Playwright bloquean destinos externos. No usar `npm run dev` sin ese aislamiento para estas pruebas.

### Verificación

| Comando ejecutado | Resultado | Evidencia |
|---|---|---|
| `npm.cmd run lint` | Exit 0, antes y después de los diagnósticos | TypeScript sin errores finales |
| `npm.cmd test -- --reporter=json --outputFile=outputs/audit-2026-10-08-unit.json` | Suite inicial, antes de añadir diagnósticos: exit 1; 443 tests, 414 aprobados, 2 fallidos, 27 omitidos | Los 27 omitidos requieren emulador; los dos fallos fueron timeout/cantidad de llamadas en caché histórica |
| `node node_modules/vitest/vitest.mjs run src/services/__tests__/historicalReadCache.test.ts --reporter=json --outputFile=outputs/audit-2026-10-08-history-retest.json` | Exit 0: 4/4 | No se reproducen los dos fallos iniciales; no se alteró la prueba ni el servicio |
| `npm.cmd run build` | Exit 0 | Frontend y server.cjs construidos; advertencias de anotaciones de dependencias sin bloqueo |
| `npm.cmd run test:journal` con NODE_PATH anterior | Exit 0 | Cinco comprobaciones impresas de migración, cuota, concurrencia, aborto y reintento |
| `npm.cmd run test:integration -- --reporter=json --outputFile=outputs/audit-2026-10-08-existing-integration.json` | Exit 0: 27/27 | Integración existente en Firestore real local |
| `node node_modules/vitest/vitest.mjs run scripts/audit/integration.test.ts --reporter=json --outputFile=outputs/audit-2026-10-08-contracts.json` | Exit 1: 12 tests, 5 aprobados, 7 fallidos | Con `AUDIT_EMULATOR=true` y `FIRESTORE_EMULATOR_HOST=127.0.0.1:8087`; los fallos expresan contratos actualmente incumplidos |
| `node node_modules/vitest/vitest.mjs run scripts/audit/session.test.ts --reporter=json --outputFile=outputs/audit-2026-10-08-session.json` | Exit 1: 1 fallo | Token válido después de rotar contraseña |
| `node node_modules/vitest/vitest.mjs run scripts/audit/recovery.test.tsx --reporter=json --outputFile=outputs/audit-2026-10-08-recovery.json` | Exit 1: 1 fallo | Con flags de emulador; datos recuperados sin log de importación |
| `node node_modules/vitest/vitest.mjs run scripts/audit/dates.test.ts` | Exit 0 en Santiago y UTC | JSON separados `dates-santiago` y `dates-utc` |
| `node scripts/audit/browser-run.cjs` | Exit 0; ocho pasos completos | `audit-2026-10-08-browser/` |
| `node scripts/audit/browser-checks.cjs` | Exit 0; incluye violación observada de caché | JSON de controles visibles, estadísticas, CSV y pestañas |
| `node scripts/audit/api-checks.cjs` | Exit 0; reproduce también A-02 | HTTP real, correo local simulado |
| `node scripts/audit/scheduler-run.cjs` | Exit 0, reproduce M-01 | Ejecutarlo con el otro backend detenido; barrera de entrega e inyección de fallo de marca |
| `node scripts/audit/read-performance.cjs` | Exit 0 | Consultas de 500, 2.500 y 10.000 documentos |
| `node node_modules/tsx/dist/cli.mjs scripts/measure-performance.ts audit-2026-10-08` | Exit 0 | Cálculo local, validación, conflictos y PDF |
| `node scripts/audit/measure-browser.cjs audit-2026-10-08` | Exit 0 | 390/1.200 px, tres volúmenes; para repetición usar BENCH_WIDTHS=1200 y BENCH_COUNTS=10000 con prefijo isolated |
| `node node_modules/tsx/dist/cli.mjs scripts/audit/pdf.ts` y Python `scripts/audit/pdf-check.py` | Exit 0 | Ocho comprobaciones semánticas; PDF renderizado e inspeccionado con Poppler |

Las suites nuevas contienen expectativas de seguridad/integridad, por eso su exit 1 es evidencia y no una corrección aplicada. Los diagnósticos CJS registran observaciones y pueden devolver 0 al reproducir un defecto; su exit 0 no significa conformidad funcional.

Las pruebas existentes de persistencia emplean clientes SDK que no acreditan una identidad de escritor de la aplicación. Sus 27 aprobaciones comprueban el algoritmo actual bajo las reglas actuales; no prueban una frontera de autorización segura. Al corregir C-01 habrá que adaptar también los fixtures positivos a la identidad legítima del modelo elegido, conservando los casos negativos anónimos y de lectura.

Incidencias de infraestructura resueltas: Playwright faltaba en node_modules del proyecto y se utilizó el runtime; el benchmark antiguo carecía del formato de token exigido por la interfaz actual; Vite falló al observar el árbol local y se desactivó el watcher del diagnóstico. Hubo un timeout de limpieza del emulador mientras se preparaban fixtures voluminosos; se repitió la suite de contratos de forma secuencial. El primer arranque con el CLI de tsx leyó `.env` local; se detuvo antes de ejecutar los fixtures de navegador y se sustituyó por `--import tsx` y el preload que bloquea esa lectura. No hubo envío ni acceso a datos externos desde ese arranque. No se clasificaron estas incidencias como fallas funcionales. Java/Firebase CLI se resolvieron localmente; una dependencia de CLI avisó que Node 26 no está entre sus motores declarados, aunque los emuladores funcionaron.

Los JSON de pruebas se revisaron/redactaron para excluir identidades y credenciales predeterminadas. Las evidencias de reservas, cuentas usadas, imágenes y PDF entregadas emplean fixtures sintéticos. No se copiaron datos de producción.

## 8. Plan de corrección priorizado y aceptación de producción

| Orden | Trabajo | Dependencias y salida verificable |
|---:|---|---|
| 1 | Cerrar la elusión de autorización de Firestore, C-01 | Frontera de servidor, permisos granulares, identidad verificable para lecturas, perfiles sin hashes y autor fiable; SEC-01/02/03 pasan conservando flujos legítimos |
| 2 | Retirar credenciales expuestas y revocar sesiones, A-01/A-02 | Requiere el modelo de identidad del punto 1; derivador de contraseña adecuado, rotación y revisión de sesión; SEC-04 pasa |
| 3 | Proteger eliminaciones con las versiones seleccionadas, A-03 | Autor y snapshots confirmados del punto 1; CON-02 pasa también para series y eliminaciones autorizadas |
| 4 | Unificar visibilidad de feriados autorizados, A-07 | Mantener validación transaccional y autorización; HOL-01 pasa en sesión, recarga y otra pestaña |
| 5 | Hacer recuperable e idempotente la auditoría ordinaria, A-06 | Actor fiable y estados confirmados; REC-01 pasa y no duplica logs tras reintentos |
| 6 | Validar integridad y contrato de restauración de backups, A-05/A-04 | Validar antes de aplicar; luego recuperación por colección, exclusiones claras y conciliación de operaciones grandes; BAK-01/02 pasan, relaciones y slots coinciden |
| 7 | Coordinar despacho y reconciliar entregas ambiguas, M-01 | Registro compartido con permisos del punto 1; dos instancias y reinicio no entregan automáticamente dos veces el mismo ciclo |
| 8 | Definir cobertura de estadísticas/exportaciones y perfilar formulario, M-02 | Período explícito y carga autorizada; cifras independientes de navegación/caché; medir nuevamente con presupuesto acordado de interfaz |

Antes de declarar preparación de producción: verificar de forma autorizada las reglas/identidades y configuración desplegadas en la base efectiva; comprobar índices, secretos estables, rotación y cuentas vigentes; ejecutar los contratos fallidos con resultado aprobado; repetir el recorrido integrado tras las correcciones y comprobar la recuperación completa. Gmail real y fallos entre proveedor/base necesitan una validación separada sin reutilizar credenciales ni destinatarios de los fixtures.

**Primera corrección recomendada:** resolver C-01 con una frontera de autorización efectiva que también conserve el funcionamiento legítimo de la aplicación. Optimizar consultas o ampliar controles de interfaz no reduce este riesgo mientras permanezcan abiertas las escrituras directas.
