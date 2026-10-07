# Política de ahorro de lecturas

La carga en tiempo real incluye los últimos 30 días y las reservas futuras. El historial anterior se consulta al navegar por los meses del calendario. No se borran documentos del servidor.

Los usuarios sin permisos de crear, editar ni eliminar reservas usan una consulta en tiempo real acotada al mes visible en calendario, horario diario y agenda móvil. El calendario incluye los días de las semanas adyacentes y la consulta añade el día anterior para reservas nocturnas. Navegar cambia la suscripción; el historial visible de estos usuarios también se actualiza en tiempo real, sin una consulta histórica adicional. Antes de iniciar sesión no se suscriben reservas.

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

El contador registra una estimación de lecturas observadas del servidor en esta sesión, con reinicio al cambiar el día en `America/Los_Angeles`. Excluye eventos de caché y escrituras pendientes; cuenta cambios en vez de sumar toda la lista en cada actualización. No incluye todas las consultas administrativas, transacciones, lecturas de reglas o índices, ni otros usuarios, dispositivos o accesos desde la consola.

Firestore Standard tiene una cuota gratuita de 50.000 lecturas diarias en la base elegible. No existe una garantía global desde este frontend: hay que verificar el consumo agregado en Firebase → Firestore → Uso. Si el volumen de usuarios todavía supera la cuota, se necesita controlar el acceso desde el servidor o ajustar el plan. Reducir la ventana no limita la cantidad de reservas futuras.

Referencias oficiales: [cuotas](https://firebase.google.com/docs/firestore/quotas), [facturación de listeners](https://firebase.google.com/docs/firestore/pricing), [persistencia](https://firebase.google.com/docs/firestore/manage-data/enable-offline).
