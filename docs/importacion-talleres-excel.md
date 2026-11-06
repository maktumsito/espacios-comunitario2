# Importación de talleres CCD desde Excel o CSV

Cada fila dispone de **Eliminar taller de la importación**. Quita el taller y sus sesiones pendientes, actualiza los contadores y exige revisar nuevamente antes de guardar. **Deshacer última eliminación** restaura la fila con su espacio, categoría y opciones personalizadas. Esta acción no elimina reservas ya guardadas ni modifica el archivo original. Al cargar otro archivo se reinicia la lista de eliminaciones.

En **Importar, exportar y respaldos → Excel, Planilla y CSV → Importar talleres desde Excel o CSV**, selecciona el archivo `.xlsx` o `.csv`. También puedes usar el botón general **Importar Excel o CSV**: reconoce las columnas de talleres y abre su revisión, conservando la compatibilidad con respaldos CSV de reservas. Disponible para los perfiles con permiso de carga masiva.

La primera hoja de Excel o la tabla CSV debe incluir `NOMBRE TALLER`, `HORARIO 1` y `PROFESOR`; se admiten otras columnas `HORARIO 2`, `HORARIO 3`, etc. Se detectan los separadores de CSV punto y coma, coma o tabulación, comillas, saltos de línea dentro de celdas y archivos UTF-8 o Windows-1252. Los horarios tienen el formato `LUN 16:00-17:00`. Se reconocen los siete días abreviados, mayúsculas/minúsculas, tildes y espacios alrededor del guion. Un horario vacío se omite; los datos inválidos muestran la fila y detienen la lectura.

Selecciona un espacio activo y una categoría de actividad por fila de taller (por ejemplo, TALLER CCD, TALLER JJV o TALLER MUNICIPAL). Las categorías provienen del catálogo de actividades configurado. El espacio y la categoría se aplican a todas las sesiones de esa fila. Cambiar cualquiera de los selectores requiere volver a revisar antes de guardar. La importación mantiene separados los talleres con el mismo nombre y distintos horarios. No solicita contactos ni participantes ni les asigna valores inventados.

El botón **Editar todas las opciones** abre el formulario completo de la reserva para cada taller: nombre, actividad, tipo de préstamo, responsable, contactos, participantes, fechas, recurrencia, horarios, espacios por día o fecha, montaje, equipamiento, comentarios y documentos. Permite aplicar los cambios a toda la serie o al alcance seleccionado. Solo modifica un borrador local; la escritura en la base de datos ocurre al confirmar la importación. Cambiar los selectores de espacio o categoría después de personalizar aplica la selección a todas las sesiones del taller, conservando sus demás opciones. La categoría actualiza también el tipo de préstamo, igual que en el formulario de reserva.

Los valores iniciales de esta importación son:

- Actividad: `TALLER CCD`.
- Descripción: `NOMBRE TALLER`.
- Responsable: `PROFESOR`.
- Recurrencia semanal del **1 de marzo de 2027 al 30 de noviembre de 2027**, ambos incluidos.
- Una serie por fila, conservando la hora específica de cada día.
- Feriados omitidos según el calendario del sistema, detallados en la vista previa.

Pulsa **Revisar importación** para ver nuevas sesiones, sesiones ya ingresadas y feriados omitidos. Los topamientos entre talleres, con otras reservas y con bloqueos de mantención impiden guardar. Cambia los espacios y vuelve a revisar. El guardado usa la validación, permisos, auditoría y recuperación de operaciones existentes.

Los identificadores son estables respecto del nombre, profesor, horarios y período, sin depender del nombre del archivo ni del orden de las filas. Volver a cargar el mismo archivo no genera copias de las sesiones confirmadas. Cambiar el espacio de un taller ya importado requiere editar su serie existente. No se reactivan sesiones canceladas por recargar el Excel. Las filas exactamente repetidas se rechazan.

La revisión no escribe en la base de datos. Las reservas se envían al pulsar **Guardar sesiones recurrentes**. Si falla una carga, vuelve a revisar y reintenta: la persistencia existente conserva su diario de recuperación y los identificadores permiten reconocer las sesiones confirmadas.
