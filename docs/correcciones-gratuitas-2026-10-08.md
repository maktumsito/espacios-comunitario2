# Correcciones y operación sin servicios nuevos de pago

Las reservas, catálogos, perfiles y respaldos utilizan la API Express existente. El navegador presenta una sesión firmada; el servidor comprueba la cuenta vigente y usa Firebase Admin con IAM. Las reglas de Firestore rechazan todos los SDK y REST de clientes, incluso autenticados. Admin no depende de esas reglas: su autorización está en los endpoints y las transacciones. [Documentación de Firebase](https://firebase.google.com/docs/firestore/security/rules-conditions).

No se añadió Cloud Functions, PITR, respaldos administrados, proveedor comercial de correo, base adicional ni programación de pago. El correo utiliza Gmail OAuth o SMTP de Gmail; se eliminó el fallback a Resend. Los cambios locales no activan facturación. La configuración de `.env` existente se preservó.

Las bases creadas por AI Studio pueden usar una cuota compartida gratuita que pausa el servicio al agotarse. El archivo del proyecto no confirma el régimen actual de la base o del alojamiento. Antes de publicar, verificar que se conserva esa protección y los límites gratuitos del alojamiento; no pulsar Upgrade database, habilitar facturación ni aumentar instancias mínimas para aplicar estas correcciones. [Cuotas de AI Studio](https://firebase.google.com/docs/ai-assistance/ai-studio-integration).

## Sesiones y cuentas

Las contraseñas individuales se verifican en el servidor con scrypt y sal aleatoria. No hay usuarios o contraseñas predeterminados. No se aceptan hashes como contraseña, texto plano legado ni los hashes SHA-256 antiguos. Los perfiles públicos y la caché del navegador no contienen secretos.

Las cuentas existentes con credenciales antiguas necesitan una reasignación individual. No se realizó esa intervención en producción. La herramienta `scripts/manage-account.ts` permite preparar una cuenta en el emulador; una intervención real requiere el argumento explícito `--production` y credenciales ADC con IAM. No carga `.env`, no recibe contraseñas como argumento y no imprime el secreto. El operador suministra `ACCOUNT_PASSWORD` temporalmente y debe eliminar la variable al terminar. `--master` concede el indicador maestro únicamente cuando se solicita explícitamente.

Una rotación de contraseña o incremento de `sessionVersion` invalida las sesiones anteriores, incluida su renovación. Los permisos se consultan de nuevo al escribir. `AUTH_SESSION_SECRET` debe ser privado, aleatorio, de al menos 32 caracteres e idéntico entre instancias. Sin secreto estable, reiniciar exige volver a iniciar sesión. Google debe confirmar el email y el proveedor; el perfil debe estar registrado.

## Confirmación, recuperación y auditoría

Cada grupo confirma reservas, índices `schedule_slots`, fragmentos de auditoría y recibo de operación dentro de la misma transacción. El actor proviene de la sesión. Las eliminaciones requieren las versiones seleccionadas; el modal conserva esa selección. Colisiones y versiones antiguas se rechazan.

Las operaciones grandes conservan un diario en IndexedDB antes del primer envío. Cada usuario ve sus propias operaciones. Los recibos durables del servidor reconocen los grupos confirmados aunque se pierda la respuesta: reanudar mantiene IDs y no vuelve a escribir grupos reconocidos. Un grupo en vuelo puede terminar después de cerrar la conexión; la interfaz conserva el estado pendiente hasta recuperar la confirmación.

Las restauraciones de auditoría vuelven a leer documentos y snapshots en el servidor, comprueban modificaciones posteriores y requieren atomicidad para todas las reservas afectadas. Un alcance que excede el presupuesto transaccional se rechaza antes de escribir. La marca de reversión y su nuevo registro se confirman con reservas e índices.

Las consultas de navegador realizan peticiones breves cada 30 segundos, comparten listeners del servidor y se refrescan al recuperar foco o después de una escritura. Esto puede demorar hasta un ciclo la observación desde otro dispositivo. Los listeners inactivos se liberan. No se mantienen conexiones HTTP permanentes para observar colecciones.

## Respaldos

Los nuevos respaldos incluyen reservas, espacios, tipos de préstamo, tipos de actividad, equipamiento, perfiles, calificaciones y bloqueos. Validan SHA-256, bytes UTF-8, cantidades, IDs y manifiesto de fragmentos antes de restaurar. Los archivos CHK antiguos se verifican con su algoritmo original; esa comprobación no es una firma criptográfica. Los archivos sin checksum se rechazan.

Se restauran los campos de negocio y relaciones. Versiones y metadatos de la nueva operación pueden cambiar. Las contraseñas y contadores de sesión actuales se conservan; perfiles ausentes requieren alta individual previa. Un respaldo antiguo sin bloqueos conserva los bloqueos actuales. No se incluyen tokens Gmail/FCM, configuración privada, diarios locales ni un reemplazo del historial de auditoría. Los índices de disponibilidad se reconstruyen al confirmar reservas.

La restauración de toda la base no es una sola transacción: reservas se confirman por grupos y catálogos/perfiles en otra transacción. Solo se comunica éxito después de completar ambas fases. Catálogos/perfiles que exceden 440 escrituras o el tamaño seguro se rechazan en la validación previa. Una interrupción entre fases exige reanudar y comprobar la restauración; no existe un rollback global automático.

## Correo y diagnóstico

El scheduler usa una reserva compartida por fecha y registra el inicio de la llamada al proveedor antes del envío. Si el resultado es ambiguo o no se puede registrar su confirmación, conserva un estado que requiere reconciliación y no reenvía automáticamente. Una transacción de Firestore no puede hacer atómica una entrega externa de Gmail; revisar el buzón y el recibo antes de resolver ese estado.

`npm run test:integration` ejecuta el dominio y los endpoints reales secuencialmente contra Firestore 8087 y Auth 9099 del proyecto sintético `demo-espacios`. `scripts/corrections/browser-run.cjs` reproduce el recorrido con dos editores y un lector, bloqueando solicitudes externas. El servidor de pruebas se inicia con `scripts/audit/server-preload.cjs`, que impide cargar `.env` y bloquea HTTP externo. Las herramientas de agrupación e índices ahora requieren el emulador; no migran producción.

Los archivos de `scripts/audit` conservan diagnósticos del comportamiento anterior. Se excluyeron de la suite ordinaria porque sus fixtures daban por permitido el acceso anónimo utilizado para reproducir los fallos; las comprobaciones vigentes están en las suites normales y `trustedData.integration.test.ts`. Los informes históricos de `outputs/audit-*` no se reescribieron.
