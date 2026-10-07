# Política de ahorro de lecturas

La carga en tiempo real incluye los últimos 30 días y las reservas futuras. El historial anterior se consulta al navegar por los meses del calendario. No se borran documentos del servidor.

Los usuarios sin permisos de crear, editar ni eliminar reservas usan una consulta en tiempo real acotada al mes visible en calendario y agenda móvil. Horario diario y timeline consultan el día seleccionado y el anterior para reservas nocturnas. El calendario incluye los días de las semanas adyacentes y el día previo. Navegar cambia la suscripción; el historial visible de estos usuarios también se actualiza en tiempo real, sin una consulta histórica adicional. Antes de iniciar sesión no se suscriben reservas ni bloqueos. Los bloqueos de lectores se filtran por fecha de término para conservar intervalos largos que intersecten la vista; administración y editores conservan el historial completo de bloqueos.

Las vistas generales (estadísticas, espacios, topamientos y administración), las búsquedas sin un rango completo de fechas y los modales de exportación, impresión o despacho conservan la carga general de la ventana activa. Al ampliar desde una consulta mensual, las vistas generales y esos modales esperan confirmación del servidor para evitar presentar o exportar una lista parcial. Los filtros con ambas fechas amplían el rango mensual para incluir el intervalo solicitado. Los permisos siguen sincronizados en vivo y un cambio de permisos actualiza la política de consulta; no hay una lista fija de tres editores.

El equipamiento se suscribe al abrir el formulario de reserva o su pestaña administrativa. Para lectores, las evaluaciones se suscriben en las vistas y modales que las muestran; los editores conservan su sincronización para el aviso de reporte del lunes. Los lectores no ejecutan la migración automática de reservas ni las comprobaciones periódicas de respaldo y purga de slots. Las transacciones y comprobaciones de concurrencia al guardar siguen activas.

Configuración en `.env` (requiere volver a compilar):

| Variable | Valor predeterminado | Rango |
| --- | --- | --- |
| `VITE_FIRESTORE_ACTIVE_WINDOW_DAYS` | `30` | 1–365 días |
| `VITE_FIRESTORE_HISTORY_CACHE_MINUTES` | `60` | 1–1440 minutos |
| `VITE_FIRESTORE_PERSISTENT_CACHE` | `true` | `false` desactiva la persistencia del SDK |

El SDK conserva hasta 40 MiB de caché IndexedDB y coordina las pestañas. En pruebas locales y entornos sin IndexedDB se usa memoria. Las suscripciones de reservas, usuarios, configuración, equipamiento, auditoría, evaluaciones y bloqueos comparten un listener cuando la referencia es igual. El listener se libera un segundo después de salir el último consumidor para evitar reconexiones durante remontajes breves.

Las consultas históricas del mismo intervalo comparten la petición en curso. Una consulta confirmada se reutiliza durante el plazo configurado, incluso después de recargar cuando la caché local está disponible. Durante ese plazo, los cambios remotos del historial pueden tardar en aparecer. Los errores y respuestas sin conexión no marcan un intervalo como sincronizado. La ventana activa sigue recibiendo actualizaciones en tiempo real.

También se reutiliza un intervalo confirmado que contenga el solicitado; los intervalos solo parcialmente solapados mantienen consultas propias. Las lecturas simultáneas de una reserva relacionada comparten la petición, sin sustituir las lecturas transaccionales de versión y ocupación por caché.

La configuración general escucha exclusivamente `espacios`, `tipos_prestamo` y `tipos_actividad`, sin descargar documentos de credenciales, respaldos o despacho. El estado privado de Gmail comparte una lectura de credenciales por instancia durante 60 segundos, con actualización inmediata al conectar, renovar, revocar o desconectar en esa instancia. Entre instancias la frescura máxima depende de ese plazo. El formulario de configuración de despacho también deduplica cargas y reutiliza respuestas confirmadas durante 60 segundos.

El scheduler mantiene un único listener de configuración en el servidor; sus ticks no hacen una nueva lectura de ese documento. Las respuestas cacheadas/offline no autorizan despachos y los errores tienen reintentos acotados. El despacho y su preview consultan solo las fechas solicitadas, conservando todos los candidatos de esas fechas. Los envíos fallidos se reintentan cada cinco minutos; un envío confirmado no se repite en el mismo proceso aunque falle guardar la marca diaria. El envío manual explícito conserva su opción de forzar un despacho. La protección de confirmación en memoria no garantiza entrega única entre réplicas ni tras reiniciar con una marca remota ausente.

La purga solo pagina slots con ID anterior a la fecha de corte y vuelve a verificar en transacción que estén vacíos. El arranque, timer y peticiones de editores comparten una comprobación exitosa por día de Santiago y plazo en cada instancia. Los fallos no se marcan como comprobaciones completadas. No se elimina ocupación histórica.

Los respaldos automáticos adquieren una reserva de ejecución en `backup_schedule_config` antes de descargar la base. Otro dispositivo espera en vez de repetir la copia; la reserva dura 30 minutos y se libera al completar o fallar, conservando cambios de configuración ajenos. Una copia de más de 30 minutos puede superar esa protección y debe revisarse si el volumen crece. Los respaldos normales leen reservas, evaluaciones y cuentas completas del servidor, junto con los cuatro documentos de catálogo/equipamiento; esto evita exportar solo la ventana activa o las 150 evaluaciones del listener. Esas lecturas legítimas de integridad se presupuestan aparte. El modo explícito `customReservations` sigue disponible para conjuntos suministrados por el llamador.

Las evaluaciones se validan contra `reservas/{id}` en el servidor, incluyen el término del día siguiente para eventos nocturnos y se escriben una sola vez. El cliente utiliza el registro confirmado; un fallo conserva el formulario/cola para reintentar. Ya no se consulta la colección antigua cerrada ni se acepta el payload cliente como reserva autoritativa. La auditoría no ofrece una purga remota que contradiga su regla de conservación.

Las APIs aceptan sesiones firmadas emitidas tras verificar la cuenta en el servidor. El login Google requiere identidad verificada y email registrado exacto, conserva los permisos asignados y no crea administradores para cuentas desconocidas. Las cuentas de solo lectura no pueden usar APIs de escritura. Configurar `AUTH_SESSION_SECRET` privado, de al menos 32 caracteres, igual en todas las instancias; nunca usar `VITE_*` para ese secreto. Si falta se deriva de un secreto privado de Gmail disponible, o se usa una clave efímera que requiere nuevo login tras reiniciar. Las sesiones antiguas sin firma deben renovarse iniciando sesión. Publicar frontend y backend de la misma versión juntos.

La renovación de la sesión también se confirma en el servidor y mantiene el límite absoluto de doce horas. Los permisos y la contraseña no se reutilizan desde una caché positiva de backend: las peticiones protegidas los verifican contra la cuenta actual, compartiendo solo lecturas simultáneas. Esta lectura esencial se presupuestará, sin sustituirla por permisos obsoletos para ahorrar.

Estas sesiones de API no se convierten en Firebase Auth para el SDK de Firestore: las reglas públicas del repositorio aún necesitan una migración de identidad y autorización antes de poder considerar el proyecto protegido frente a accesos directos. Las cuentas almacenadas tampoco quedan protegidas contra modificación directa hasta cerrar esas reglas. Endurecerlas sin esa migración bloquearía a los usuarios actuales. No se desplegaron reglas ni se modificaron datos de producción durante esta optimización.

El contador registra una estimación de lecturas observadas del servidor en esta sesión, con reinicio al cambiar el día en `America/Los_Angeles`. Excluye eventos de caché y escrituras pendientes; cuenta cambios en vez de sumar toda la lista en cada actualización. No incluye todas las consultas administrativas, transacciones, lecturas de reglas o índices, ni otros usuarios, dispositivos o accesos desde la consola.

Firestore Standard tiene una cuota gratuita de 50.000 lecturas diarias en la base elegible. No existe una garantía global desde este frontend: hay que verificar el consumo agregado en Firebase → Firestore → Uso. Si el volumen de usuarios todavía supera la cuota, se necesita controlar el acceso desde el servidor o ajustar el plan. Reducir la ventana no limita la cantidad de reservas futuras.

Referencias oficiales: [cuotas](https://firebase.google.com/docs/firestore/quotas), [facturación de listeners](https://firebase.google.com/docs/firestore/pricing), [persistencia](https://firebase.google.com/docs/firestore/manage-data/enable-offline).
