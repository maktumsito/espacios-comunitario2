# Correcciones de Espacios Comunitarios — 8 de octubre de 2026

Se implementaron correcciones para los diez hallazgos confirmados de la auditoría. La validación local aprobó compilación, tipos, 416 pruebas unitarias, 35 pruebas de integración, cinco comprobaciones de IndexedDB y el recorrido integrado con dos editores y un lector. La revisión final de dependencias de producción no informó vulnerabilidades conocidas.

No se desplegaron reglas o código, no se migraron cuentas reales, no se enviaron correos reales y no se activó facturación. Se conservaron `.env`, el directorio preexistente `output/` y las evidencias originales de auditoría. Estos resultados no constituyen un dictamen favorable de producción.

## Base y entorno

- Commit base de auditoría y correcciones: `181f7eb27789a44cd071fb18815dd56123cb6902`. La identificación de la entrega sincronizada se conserva en el historial de Git.
- Antes de corregir, los archivos versionados estaban limpios; existían `output/` y los entregables y diagnósticos de auditoría no versionados.
- Windows, Node 26.10.0, Java 21 local, Firebase CLI 15.33.0, Playwright con Microsoft Edge.
- Proyecto sintético `demo-espacios`, Firestore `127.0.0.1:8087`, Auth `127.0.0.1:9099`, servidor `3000`, navegador de diagnóstico `8788`, `VITE_LOCAL_TEST_MODE=true`.
- `.env` bloqueado mediante preload del servidor; correo simulado y solicitudes HTTP externas bloqueadas. Datos y contraseñas exclusivamente sintéticos.

## Hallazgos corregidos y evidencia

| ID original | Corrección local | Código principal | Aceptación comprobada |
|---|---|---|---|
| C-01 | Se cerró Firestore a SDK/REST de clientes y se trasladó el acceso a endpoints autenticados. Las transacciones revalidan cuenta, permisos, bloqueos e identidad del actor. | `firestore.rules:5`, `server/dataApi.ts:183`, `server/reservationApi.ts:76` | SDK y REST anónimos rechazados; SDK con Auth también rechazado; lector puede consultar pero no escribir; autor de auditoría forjado rechazado. |
| A-01 | Se retiraron cuentas/contraseñas predeterminadas del frontend, comparación por contraseña compartida y almacenamiento de hashes en caché. El backend usa scrypt con sal aleatoria; el acceso solicita usuario explícito. | `server/passwords.ts:5`, `server/passwords.ts:30`, `src/services/authService.ts`, `scripts/manage-account.ts` | Login correcto con credenciales sintéticas; hash no aceptado como contraseña; perfiles sin secretos; herramienta de preparación ejecutada únicamente en demo. |
| A-02 | Las sesiones se vinculan a contraseña y contador de credenciales vigentes; cambiar contraseña invalida también renovación. | `server/appSession.ts:57` | Token anterior devuelve 401 después de rotación; renovación rechazada; nueva contraseña permite iniciar sesión. Manipulación y vencimiento cubiertos en suite ordinaria. |
| A-03 | Eliminación exige versión seleccionada y el modal congela la selección para no sustituirla por una actualización recibida posteriormente. | `src/services/reservationService.ts:992`, `src/hooks/useReservationCrud.ts:135` | Un editor gana la carrera; edición y eliminación antiguas se rechazan; la reserva y su disponibilidad se conservan. |
| A-04 | Se incorporó restauración de catálogos, equipamiento, calificaciones, perfiles y bloqueos, además de reservas e índices. | `server/backupApi.ts:121`, `src/services/backupService.ts:940` | Restauración de entidades y campos de negocio comprobada; relaciones y reservas comparadas en navegador. Credenciales actuales preservadas. |
| A-05 | Se verifica checksum, tamaño UTF-8, cantidades, IDs y manifiesto antes de escribir. Nuevos archivos usan SHA-256; CHK legado se verifica con su algoritmo original. | `src/utils/backupIntegrity.ts:21`, `src/services/backupService.ts:809` | Contenido manipulado rechazado antes de modificar catálogos; respaldos íntegros recuperados. |
| A-06 | Cada grupo confirma un snapshot de auditoría y un recibo durable con reservas/slots. Recuperación reutiliza IDs y reconoce grupos confirmados aunque su respuesta se haya perdido. | `server/reservationApi.ts:76`, `src/services/reservationWriter.ts`, `src/services/reservationOperationJournal.ts:23` | Lote de 500 reanudado tras interrupción y recarga; conserva edición posterior de otro cliente; auditoría completa de 500 filas; diario pendiente termina vacío. |
| A-07 | La caché ya no descarta automáticamente todos los feriados. La excepción se verifica al guardar y requiere permisos de gestión en API. | `src/services/reservationService.ts:472`, `server/reservationApi.ts` | Feriado autorizado persiste y se consulta; feriado sin autorización y conflicto en feriado rechazados en integración. |
| M-01 | Reserva compartida por ciclo y estado durable antes de contactar al proveedor; resultados ambiguos no se reenvían automáticamente. | `server/deliveryLease.ts:6`, `server.ts` | Dos instancias obtienen un solo permiso de envío; estado de entrega incierta bloquea reintento incluso tras vencer la reserva inicial. |
| M-02 | La estadística identifica el conjunto cargado y sus fechas; deja de presentarse como total de toda la base. | `src/components/AnalyticsView.tsx:78` | Etiqueta y alcance explícitos en código compilado. El total global de 10.000 reservas con esta nueva API no fue medido nuevamente. |

Las correcciones no convierten los snapshots antiguos incompletos en datos completos. Las restauraciones de auditoría conservan las comprobaciones de modificaciones posteriores y rechazan alcances que exceden el presupuesto de una transacción.

## Validación reproducible

| Comando o recorrido | Resultado final | Evidencia |
|---|---|---|
| `npm.cmd run lint` | Aprobado | TypeScript sin errores. |
| `npm.cmd test -- --reporter=json --outputFile=outputs/correcciones-2026-10-08-unit.json` | 416 aprobadas, 0 fallidas, 35 omitidas | `correcciones-2026-10-08-unit.json`. Las 35 omitidas son integración, ejecutada aparte. |
| `npm.cmd run build` | Aprobado | Frontend y servidor compilados. Advertencias no fatales de anotaciones Zod y de importación dinámica/estática de un módulo. |
| `npm.cmd run test:journal` | 5 comprobaciones aprobadas | Migración, carga superior al límite de localStorage, concurrencia, aborto de transacción y recuperación tras migración abortada. |
| `npm.cmd run test:integration -- --reporter=json --outputFile=outputs/correcciones-2026-10-08-integration.json` | 35 aprobadas, 0 fallidas u omitidas | `correcciones-2026-10-08-integration.json`; ejecución secuencial con transacciones reales y reglas cargadas. |
| `node scripts/corrections/browser-run.cjs` | Recorrido completado | `correcciones-2026-10-08-browser/summary.json`, JSON y capturas por etapa. |
| `bun audit --production --json` | Sin avisos conocidos | `correcciones-2026-10-08-dependencies.json` contiene `{}`. |
| `git diff --check` | Comprobado | Sin conflictos ni whitespace incorrecto al cierre. |

Durante la implementación se detectaron incompatibilidades de mocks con el adaptador, fixtures de credenciales retiradas y timeouts de carga/contención. Se corrigieron los mocks y fixtures, y se asignó un límite de 30 segundos a integración y a la carga fría del módulo Gmail; las aserciones de invariantes se conservaron. Los resultados finales sustituyen los resultados transitorios de correcciones, no los informes históricos de auditoría.

Los diagnósticos de `scripts/audit` reproducen el comportamiento anterior con fixtures de acceso anónimo. Quedaron fuera de la suite ordinaria; las negativas actuales de autorización y las positivas de transacciones se ejecutan en `trustedData.integration.test.ts` y `reservationPersistence.test.ts`. No se usó la aprobación de mocks como evidencia de atomicidad.

## Recorrido integrado observado

| Etapa | Reservas persistidas | Documentos de slots | Registros de auditoría | Operaciones pendientes |
|---|---:|---:|---:|---:|
| Crear serie | 4 | 4 | 1 | 0 |
| Reemplazar sesión | 5 | 4 | 2 | 0 |
| Mover futuras omitiendo conflicto | 6 | 4 | 4 | 0 |
| Editar desde otro cliente | 6 | 4 | 5 | 0 |
| Interrumpir lote | 423 | 421 | 6 | 1 |
| Recuperar tras recarga | 505 | 503 | 7 | 0 |
| Restaurar desde auditoría | 504 | 503 | 9 | 0 |
| Crear y restaurar respaldo | 504 | 503 | 13 | 0 |

Después de la interrupción, el navegador había reconocido 214 reservas visibles y el servidor había terminado grupos adicionales hasta 423. Esa diferencia está registrada, no se interpretó como éxito ni sincronización completa. La recuperación consultó recibos durables, preservó la modificación posterior del segundo usuario y confirmó el conjunto sin duplicados. En las etapas completadas, la caché coincidió con las reservas activas. Estos conteos son observaciones sintéticas, no estimaciones de lecturas/escrituras facturadas.

## Dependencias y gratuidad

Se añadió Firebase Admin al servidor existente y se actualizaron dependencias compatibles: Nodemailer 10.0.16, grpc-js 1.14.6, proxy-addr 2.0.8, DOMPurify 3.4.16, qs 6.16.0 y source-map-js 1.2.2. `package.json` y `bun.lock` registran las versiones y overrides. La evidencia anterior a corregir dependencias se conserva en `correcciones-2026-10-08-dependencies-before.json`.

La revisión detectó, entre otros, un aviso crítico de proxy-addr y avisos de grpc-js y Nodemailer. Se actualizaron las versiones corregidas indicadas por sus mantenedores. Esto es una corrección preventiva de dependencias; no se reprodujo una explotación de esos avisos en esta aplicación. [proxy-addr](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [grpc-js](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j), [Nodemailer](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-v53p-9fqp-m79j).

No se añadieron proveedores de pago, bases nuevas, Functions, PITR, respaldos administrados ni jobs de pago. Se retiró Resend como alternativa y quedó Gmail. Las consultas de navegador comparten listeners del servidor y utilizan respuestas breves cada 30 segundos, con actualización al recuperar foco o escribir. La auditoría aumenta documentos de evidencia y consumo de cuota; no es una operación de consumo cero.

El proyecto procede de AI Studio y puede conservar su cuota compartida sin facturación, que pausa Firestore al agotarse. La configuración local no acredita el estado de esa protección ni el régimen del alojamiento. Verificarlos antes de publicar es una condición de cierre operativo; no se cambió ni activó ningún plan. [Documentación de cuota compartida](https://firebase.google.com/docs/ai-assistance/ai-studio-integration).

## Límites y orden de aplicación

1. Preparar contraseñas individuales seguras para las cuentas que aún usan SHA-256 legado. La nueva autenticación no acepta esas credenciales; la herramienta local se probó, pero no se tocó producción.
2. Confirmar que la cuota gratuita y el alojamiento existentes siguen protegidos, y que el servidor tiene IAM/ADC apropiados. Admin requiere autorización IAM independiente de las reglas. No activar facturación para continuar.
3. Revisar y aplicar conjuntamente servidor, frontend y reglas cuando se autorice la publicación. Publicar solamente las reglas dejaría sin acceso al frontend antiguo. No se hizo ningún despliegue en esta ejecución.
4. Comprobar cargas de 2.500/10.000 con la nueva ruta HTTP, alojamiento real, cuotas, OAuth real y entrega/reconciliación de correo. Las mediciones antiguas no se atribuyen a esta implementación nueva.

Restaurar toda la base ocurre por fases, no como una transacción global: grupos de reservas y una transacción de catálogos/perfiles. La validación previa rechaza catálogos de más de 440 escrituras o tamaño excesivo. Perfiles faltantes necesitan alta individual; las credenciales actuales se conservan. Una interrupción entre fases exige recuperación y comprobación; no hay rollback global. Un archivo antiguo que no contiene bloqueos conserva los actuales. Los respaldos omiten secretos, tokens, diarios locales y el reemplazo del historial de auditoría.

La solución evita reenvíos automáticos ambiguos; no puede garantizar entrega externa exactamente una vez. Los estados inciertos requieren revisar el proveedor y el recibo. La observación desde otro dispositivo puede tardar un ciclo de consulta. Las políticas de producción y los escenarios no reejecutados siguen pendientes; no se emite un dictamen favorable basado solo en estas pruebas.

**Primera acción recomendada:** revisión y preparación individual de credenciales antes de publicar el conjunto de correcciones, manteniendo el régimen gratuito existente. La guía operativa está en `docs/correcciones-gratuitas-2026-10-08.md`.
