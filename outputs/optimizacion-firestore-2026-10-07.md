# Correcciones y optimización de Firestore

7 de octubre de 2026. Implementación para el uso informado: seis personas, tres con acceso total y tres de lectura. Los permisos continúan derivados de las cuentas configuradas; no se introdujo una lista fija de tres editores. Se modificó el código local, sin desplegar ni consultar o alterar datos de producción.

## Cambios aplicados

| Hallazgo | Resultado |
|---|---|
| READ-001: despacho descarga toda la base | Despacho y preview consultan exclusivamente sus fechas. Una sola suscripción mantiene la configuración del scheduler; sus ticks no vuelven a leer ese documento. Los fallos de entrega tienen pausa de cinco minutos. Un envío confirmado no se repite en el proceso aunque falle guardar su marca remota. |
| READ-002: tokens API falsificables / Google concede admin | Login con contraseña verificado en servidor, sesiones HMAC con vencimiento, renovación y límite absoluto de doce horas. Google se verifica con Firebase y email registrado exacto; no crea administradores ni cambia roles asignados. APIs de escritura rechazan cuentas de lectura. La parte de reglas públicas sigue pendiente, según la sección de límites. |
| READ-004: purga completa y repetida | Query de IDs anteriores al corte, páginas de 400 y cursor. Se conserva el recheck transaccional de slots vacíos. Arranque, timer y editores comparten una comprobación exitosa por día y plazo en cada instancia; errores permiten reintentar. |
| READ-005: respaldos duplicados por dispositivo | Reserva transaccional de ejecución compartida en la programación. Tres dispositivos no descargan tres copias del mismo ciclo. Finalización conserva cambios de configuración ajenos; una operación fallida libera únicamente su propia reserva. |
| Respaldo incompleto / colisión de IDs | Reservas, evaluaciones y usuarios completos desde servidor; catálogo/equipamiento explícitos. IDs únicos y deduplicación que también considera checksum, para no ocultar datos distintos con igual cantidad/tamaño. No exporta hashes de contraseñas. |
| READ-006: polling Gmail lee credenciales repetidamente | Lectura privada compartida por instancia, TTL de 60 segundos, petición en curso compartida e invalidación al conectar, renovar o revocar. Errores no se cachean como una desconexión válida. |
| READ-007: catálogo descarga documentos ajenos | Una consulta de los tres IDs de catálogo. Equipamiento conserva carga por demanda y deja de duplicarse con la colección general. |
| READ-008: bloques previos al login e históricos en lectores | Sin listener antes del login. Lectores con rango omiten bloqueos que ya terminaron antes de la vista, conservando los que abarcan un intervalo largo. Editores y administración mantienen datos completos. |
| READ-010: purga de auditoría prohibida | Retirado el botón. El servicio rechaza el borrado sin leer ni vaciar datos. Conserva la regla append-only. |
| READ-012: colección antigua / doble escritura de evaluaciones | Lectura autoritativa de reservas/id; sin fallback a datos del cliente en producción. Una escritura y respuesta con el esquema completo. Cliente usa el registro confirmado y mantiene formulario/cola ante fallo. Se contempla término nocturno al día siguiente. |
| READ-013: historial repetido | Un intervalo confirmado puede satisfacer otro contenido en él durante el TTL. Se mantienen validación de fuente, caducidad y reintento tras fallo. |
| READ-014: usuario ausente exige leer colección | Cambio de contraseña consulta el ID concreto cuando falta localmente. Login y confirmación usan verificación backend; no descargan nuevamente todos los usuarios como fallback de contraseña fallida. |
| Lecturas de originales relacionados | Solicitudes simultáneas del mismo ID comparten petición, sin cachear una decisión de concurrencia. |
| Vista diaria del lector | Horario y timeline consultan día visible más día previo para nocturnas; calendario/móvil conservan su período completo. |
| Query de rango con orden adicional | Orden de hora se resuelve localmente después de consultar por fecha, manteniendo resultado ordenado y evitando un segundo campo de rango innecesario. |

Se mantuvieron las lecturas transaccionales de reservas, versiones, reemplazos y ocupación; los cambios no las sustituyen por memoria. Las referencias de la auditoría original corresponden al código anterior a esta implementación.

## Evidencia de reducción

| Prueba local | Antes del patrón amplio | Comportamiento verificado |
|---|---|---|
| Dataset de despacho con 5.010 filas, diez en fechas pedidas | Recuperar todas para filtrar | Solo diez retornadas por la consulta selectiva: 5.000 evitables en ese escenario, 99,80%. |
| 1.440 comprobaciones de configuración | Una lectura puntual por tick | Una suscripción; datos confirmados reutilizados y cambios/deleciones remotos actualizan el estado. Eventos de caché/offline no autorizan un envío. |
| 50 peticiones de estado Gmail | Una lectura de credenciales por petición | Una lectura compartida, incluida ausencia, y revalidación al cumplir 60 segundos. |
| Tres dispositivos comprueban un respaldo vencido | Tres dispositivos podrían descargar N | Una reserva de ejecución; dos respuestas de espera. |
| Tres comprobaciones de purga el mismo día | Tres escaneos | Una ejecución compartida; comprobaciones posteriores no vuelven a escanear. |
| Historial anual seguido por un mes contenido | Otra query de ese mes | Reutiliza cobertura confirmada; consulta de nuevo al vencer TTL. |
| Evaluación aceptada online | Write backend y segundo write frontend | El cliente no vuelve a ejecutar setDoc. |

Son pruebas con mocks y funciones/HTTP locales, **no lecturas medidas en Firebase ni una promesa de ahorro global**. Los cambios de listeners, índices y otros dispositivos pueden generar consumo adicional. Un respaldo completo puede leer más evaluaciones que antes: son lecturas necesarias para evitar una copia truncada, no una regresión a ocultar.

## Verificación

- Ejecución amplia: **62 suites pasaron; 314 pruebas pasaron y 27 de integración quedaron omitidas**.
- Después de ajustar verificación de permisos y renovación, las suites afectadas volvieron a pasar. Incluyen una prueba nueva de límite absoluto de renovación: **315 pruebas únicas pasaron entre las ejecuciones**.
- TypeScript (`npm run lint`) y compilación frontend/backend (`npm run build`) completaron correctamente en la versión final.
- `git diff --check` sin errores de whitespace.
- Las pruebas nuevas verifican scope selectivo, paginación, suscripción única y recuperación offline, exclusión entre dispositivos, permisos de lectura, tokens falsificados/expirados, renovación, Google registrado, evaluación confirmada y rechazo de purga.

No se arrancó Firestore de producción ni se enviaron correos reales. El emulador local de Firestore no estaba activo y Java no estaba disponible en PATH; las 27 pruebas de persistencia/concurrencia real del SDK no se ejecutaron. Existe un JAR cacheado, pero no se instaló otro runtime para esta tarea. Las pruebas de transacciones del cambio de respaldos simulan su serialización; no certifican concurrencia distribuida en producción.

## Activación y límites pendientes

El frontend y backend deben publicarse juntos por el contrato de sesión/evaluación confirmado. `AUTH_SESSION_SECRET` quedó configurado en el `.env` local, sin mostrar ni incluir su valor en el informe. En hosting debe configurarse una clave privada estable de al menos 32 caracteres, igual en todas las instancias, nunca con prefijo VITE. Las sesiones antiguas sin firma vuelven al login al recargar. El botón de renovación confirma el nuevo vencimiento en el servidor.

**Las reglas públicas de Firestore siguen pendientes de una migración de identidad y autorización del SDK.** Una sesión HMAC de Express no crea request.auth en Firestore. Cambiar esas reglas ahora a exigir Firebase Auth dejaría sin acceso a quienes entran con las cuentas actuales. Además, mientras las cuentas sean modificables por acceso directo, la firma de API no garantiza integridad del origen de roles/credenciales. No se declara cerrado READ-002 en su totalidad ni el sistema protegido frente a accesos directos. Para completar esa parte se necesita integrar identidad Firebase de los seis usuarios y autoridad backend adecuada, después probar y desplegar las reglas coordinadas con el cliente.

La protección de despacho confirmado en memoria no garantiza entrega única entre procesos/reinicios cuando falta la marca remota; existe coordinación de checks dentro del proceso y reducción del alcance de lecturas. La reserva de respaldo dura 30 minutos: una copia excepcionalmente más larga debe extender esa reserva o trasladarse a un ejecutor coordinado.

Para preservar series, conflictos y acciones generales, los tres editores conservan su ventana general y reservas futuras completas. No se aplicaron límites arbitrarios ni se quitaron checks de versión/ocupación. No se introdujeron resúmenes agregados ni denormalización adicional para seis usuarios. El listener de evaluaciones conserva el límite previo de 150; un respaldo normal sí obtiene el conjunto completo. Los intervalos históricos solo parcialmente solapados conservan queries separadas.

El contador frontend sigue siendo una estimación parcial de eventos, no facturación del proyecto. Deben verificarse consumo agregado, volumen real, instancias y elegibilidad de la base. No se certifica un nuevo total diario a partir de las pruebas locales.
