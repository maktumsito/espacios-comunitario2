# Asistente de distribución

En **Espacios → Planificar distribución**, elige una jornada desde la fecha actual y agrega hasta 12 actividades nuevas o reservas existentes. Define participantes, salas permitidas, preferencia de sala, horario fijo o franja flexible, montaje y equipamiento móvil.

En PC, abre **Mostrar menú lateral** si el menú está oculto y selecciona **Espacios**. En móvil, entra por **Más → Espacios**. No requiere activar una clave de IA; el botón aparece en la versión publicada que incluya esta actualización.

**Calcular distribución** consulta la agenda y los catálogos confirmados del servidor. Las reglas locales reconocen términos en español y buscan una combinación conjunta de salas y horarios. Los inicios flexibles se exploran cada 15 minutos desde el comienzo de la franja. El máximo es de 50.000 estados: si se alcanza, el panel lo indica y no afirma que las actividades pendientes sean imposibles de ubicar.

El análisis intenta resolver primero la jornada con las salas activas. Si quedan actividades sin ubicar, compara una alternativa con los espacios desactivados, respetando aforo, reservas, mantenimiento y equipamiento. Recomienda activar salas solo cuando esa alternativa ubica más actividades, procurando activar la menor cantidad de salas. Las dos búsquedas comparten el límite total de 50.000 estados. La misma lógica se aplica al desocupar salas y reubicar actividades automáticamente.

Las propuestas condicionadas se marcan **Requiere activación** y muestran los espacios recomendados. Para confirmarlas, una cuenta de administración o coordinación debe marcar **Confirmo activar los espacios recomendados** y pulsar **Activar y aplicar todo el plan**. La activación, las reservas y la auditoría se guardan en la misma transacción: ante un conflicto no se activa ninguna sala. Los reintentos conservan la selección aprobada y no duplican los cambios. Activar una sala vuelve a mostrar sus reservas en la agenda de todos los PC.

Las reservas no seleccionadas continúan ocupando sus salas y recursos. Para fijar una sala, márcala como la única permitida. Los aforos desconocidos se señalan para revisión. Los montajes son esquemas orientativos, sin escala, dimensiones ni mobiliario fijo inferido; las cantidades solicitadas corresponden al inventario móvil registrado.

Revisa la tabla completa y pulsa **Aplicar todo el plan**. Se guardan las nuevas actividades y los cambios seleccionados en una sola transacción, incluyendo su auditoría. Las demás ocurrencias de una serie conservan sus datos. Si faltan actividades por ubicar, datos obligatorios, autorización de feriado o permisos, no se puede completar el guardado.

El servidor vuelve a comprobar versiones, ocupación, mantenimiento, capacidad e inventario. Los registros internos por recurso y fecha coordinan el equipamiento entre todas las operaciones normales de reservas, aunque dos equipos soliciten el mismo recurso para salas diferentes. No se necesita migrar reservas anteriores: las comprobaciones incluyen registros existentes y ocupaciones del día anterior que cruzan medianoche.

Si se pierde la confirmación, **Reintentar confirmación** conserva el mismo identificador y contenido de operación. Una respuesta definitiva de conflicto libera la propuesta para corregir y recalcular. Los borradores se conservan por cuenta en el navegador utilizado y las operaciones enviadas también quedan en el registro de recuperación existente.

El asistente funciona en el navegador de cualquier PC que utilice la misma versión publicada de la aplicación. Las reservas y catálogos son compartidos; los borradores de planificación no se editan en colaboración ni se sincronizan entre PC. No requiere proveedor, clave ni consumo de modelos de IA. Los accesos al servidor siguen utilizando la infraestructura y los permisos de la aplicación.
