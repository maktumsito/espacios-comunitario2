# Corrección de búsqueda y teclado

## Fallas encontradas

Escape estaba conectado únicamente al input del buscador rápido. Al cambiar el foco a otro control, no cerraba la ventana. Una prueba de regresión reprodujo ese fallo antes de corregirlo.

El panel de filtros no tenía manejador de Escape. Los atajos globales tampoco protegían todos los formularios abiertos: Alt+N podía activarse durante la escritura y Ctrl+K detrás de otro diálogo. Varios diálogos podían responder al mismo Escape. El indicador «Atajo: N» no coincidía con la combinación implementada, Alt+N.

## Cambios

- Escape cierra el buscador desde cualquier control, incluso sin resultados. Hay un botón explícito para cerrarlo.
- Escape oculta el panel de filtros y confirma el texto local antes de desmontarlo, conservando lo escrito aunque no haya terminado el debounce.
- Flechas y Enter seleccionan comandos desde el campo de búsqueda; las opciones también son botones accesibles mediante Tab y Enter.
- Tab y Shift+Tab permanecen en el diálogo superior. El buscador devuelve el foco al control que lo abrió y conserva el bloqueo de scroll anterior.
- Escape afecta únicamente al diálogo superior. Se ignoran eventos consumidos y composición de texto; mantener Escape pulsado no encadena cierres por repetición.
- Ctrl+K/Cmd+K y `/` abren el buscador en los contextos apropiados. Alt+N crea una reserva fuera de campos editables y diálogos. Se ignoran repeticiones, composición y combinaciones de modificadores ajenas al atajo.
- Los atajos se desactivan sin usuario autenticado y no abren ventanas detrás de formularios existentes, incluidos contenedores modales antiguos.
- Enter y Espacio sobre una reserva del calendario mantienen la acción del botón, sin activar también la navegación del día contenedor.
- Los avisos muestran Alt+N y Ctrl/⌘ K de forma consistente con el comportamiento.

## Verificación

- 12 pruebas específicas de regresión y navegación de teclado aprobadas.
- Suite completa: 172 pruebas unitarias aprobadas; 24 de integración omitidas por requerir emulador. No se volvieron a ejecutar las pruebas de persistencia porque este cambio es de interacción.
- Edge headless: 17 comprobaciones aprobadas, distribuidas entre ventanas de 1.200 y 390 px; ninguna excepción de página. Conexiones fuera del servidor estático local bloqueadas y datos de prueba locales.
- TypeScript, build y comprobación del diff aprobados.

Una primera ejecución simultánea con el build hizo fallar una aserción de tiempo de búsqueda preexistente (6,66 ms frente a 6,56 ms). La suite repetida por separado pasó completa. Las comprobaciones de teclado no presentan fallos; estos tiempos de prueba no constituyen una medición de rendimiento de producción.

Datos del navegador: `verificacion-teclado-navegador.json`. Se probaron Ctrl+K, Cmd+K, `/`, Alt+N, Escape con foco en otro control, flechas, Enter desde el input y desde un botón, Tab/Shift+Tab, conservación del filtro y bloqueo durante la edición. Esto no implica una auditoría completa de accesibilidad de todas las pantallas ni pruebas en todos los navegadores o lectores de pantalla.
