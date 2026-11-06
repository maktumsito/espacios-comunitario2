# Importación de talleres CCD desde Excel

En **Importar, exportar y respaldos → Excel, Planilla y CSV → Importar talleres desde Excel**, selecciona el archivo `.xlsx`. Disponible para los perfiles con permiso de carga masiva.

La primera hoja debe incluir `NOMBRE TALLER`, `HORARIO 1` y `PROFESOR`; se admiten otras columnas `HORARIO 2`, `HORARIO 3`, etc. Los horarios tienen el formato `LUN 16:00-17:00`. Se reconocen los siete días abreviados, mayúsculas/minúsculas, tildes y espacios alrededor del guion. Un horario vacío se omite; los datos inválidos muestran la fila y detienen la lectura.

Selecciona un espacio activo por fila de taller. Ese espacio se aplica a todos sus horarios. La importación mantiene separados los talleres con el mismo nombre y distintos horarios. No solicita contactos ni participantes ni les asigna valores inventados.

Los valores de esta importación son:

- Actividad: `TALLER CCD`.
- Descripción: `NOMBRE TALLER`.
- Responsable: `PROFESOR`.
- Recurrencia semanal del **1 de marzo de 2027 al 30 de noviembre de 2027**, ambos incluidos.
- Una serie por fila, conservando la hora específica de cada día.
- Feriados omitidos según el calendario del sistema, detallados en la vista previa.

Pulsa **Revisar importación** para ver nuevas sesiones, sesiones ya ingresadas y feriados omitidos. Los topamientos entre talleres, con otras reservas y con bloqueos de mantención impiden guardar. Cambia los espacios y vuelve a revisar. El guardado usa la validación, permisos, auditoría y recuperación de operaciones existentes.

Los identificadores son estables respecto del nombre, profesor, horarios y período, sin depender del nombre del archivo ni del orden de las filas. Volver a cargar el mismo archivo no genera copias de las sesiones confirmadas. Cambiar el espacio de un taller ya importado requiere editar su serie existente. No se reactivan sesiones canceladas por recargar el Excel. Las filas exactamente repetidas se rechazan.

La revisión no escribe en la base de datos. Las reservas se envían al pulsar **Guardar sesiones recurrentes**. Si falla una carga, vuelve a revisar y reintenta: la persistencia existente conserva su diario de recuperación y los identificadores permiten reconocer las sesiones confirmadas.
