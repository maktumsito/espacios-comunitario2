# Mantención segura

En Administración → Sistema → Salud del sistema se consultan conexión, última sincronización de la agenda, operaciones pendientes del navegador, respaldos confirmados e índices de disponibilidad. Abrir o actualizar el diagnóstico no modifica reservas.

- **Caché:** Cristian Shute puede confirmar la limpieza de tres cachés antiguas identificadas. Se comprueban nuevamente las operaciones pendientes al confirmar. Se conservan sesión, borradores, importaciones, auditoría e IndexedDB. Un error al comprobar pendientes bloquea la limpieza.
- **Respaldos:** la verificación descarga y valida el contenido sin restaurarlo. Cristian puede proteger una copia; retirar esa protección requiere confirmación. El servidor impide sobrescrituras, eliminación de copias protegidas y eliminación de la última copia disponible. Las partes se eliminan junto al documento en una transacción. Las copias de más de 400 partes requieren intervención supervisada.
- **Retención:** se conservan cinco copias automáticas sin protección, además de todas las manuales y protegidas. El servidor vuelve a comprobar la política cuando recibe una petición de rotación. Proteger, retirar protección y eliminar generan un registro de conservación.
- **Posibles duplicados:** se muestran coincidencias de actividad, responsable, espacio, fecha y horario entre las reservas cargadas. Cada ficha debe revisarse individualmente. Un topamiento no demuestra que una reserva sea duplicada. Se retiraron las limpiezas automáticas por desfase de minutos y la migración de borrado por identificadores históricos.
- **Mantenciones físicas:** el historial se oculta o muestra mediante un filtro. Ocultarlo no elimina registros; se retiró la purga masiva de mantenciones concluidas.
- **Disponibilidad:** se conserva el mantenimiento periódico existente, limitado a índices antiguos vacíos. El estado mostrado corresponde a la instancia actual del servidor; reconstruir índices sigue siendo una operación supervisada.

Las acciones de conservación se autorizan nuevamente contra la cuenta vigente dentro de la transacción. Los demás administradores y coordinadores pueden consultar el diagnóstico y verificar respaldos. Los permisos de edición de reservas siguen aplicándose al abrir las fichas.

La lista del panel muestra como máximo los 50 respaldos más recientes y el diagnóstico de duplicados abarca únicamente las reservas cargadas. El historial completo de respaldos sigue disponible desde Crear o recuperar un respaldo. Comprobar integridad no sustituye una prueba de restauración en un entorno separado.
