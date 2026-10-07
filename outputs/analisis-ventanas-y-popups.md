# Revisión de ventanas y popups

Revisión del 7 de octubre de 2026. Se corrigió la superposición y el comportamiento de las ventanas en el código local.

| Hallazgo | Corrección |
| --- | --- |
| Ventanas diferentes compartían el mismo `z-index`; la confirmación del buscador podía quedar debajo. | Una pila común coloca cada ventana nueva sobre las anteriores, según el orden de apertura. |
| Cada ventana bloqueaba y restauraba el desplazamiento por separado. | Un único bloqueo mantiene el fondo inmóvil hasta cerrar la última ventana, incluso si se cierra primero una inferior. |
| Los formularios personalizados no compartían manejo de foco ni de Escape. | Solo la ventana superior recibe Tab y Escape. Las inferiores y el fondo quedan inactivos; al cerrar se recupera el foco anterior. |
| Las ventanas estaban dentro de pantallas con animaciones o transformaciones. | Se renderizan mediante portales directamente en el cuerpo del documento, evitando recortes y contextos de superposición locales. |
| Varios títulos usaban el mismo identificador. | Los títulos tienen identificadores únicos para tecnologías de asistencia. |
| Una vista previa de la agenda tenía prioridad `9999`. | Las vistas previas quedan debajo de las ventanas. Los avisos usan una capa independiente. |
| La eliminación de series usaba una confirmación nativa que bloqueaba el navegador. | Se integra al sistema de confirmaciones de la aplicación, con manejo de operación pendiente y errores. |
| La impresión dependía de una clase de superposición fija. | Las reglas de impresión reconocen las ventanas gestionadas y ocultan el fondo y las ventanas inferiores. |

Se migraron 20 contenedores personalizados y el componente compartido `BaseModal`. Incluye reservas, conflictos, cartas, documentos, Gmail y su confirmación, impresión, unión de reservas, mantenimiento, usuarios, espacios, actividades, equipamiento, menú móvil y buscador. Las confirmaciones y otras ventanas que ya usan `BaseModal` heredan el mismo comportamiento.

Validación:

- Suite completa: 331 pruebas aprobadas; 27 omitidas por la configuración existente.
- Nueva prueba adicional aprobada para eliminar series mediante confirmación integrada; regresiones de teclado, Gmail, calificaciones y agenda aprobadas después de los ajustes finales.
- Revisión de tipos y compilación de producción correctas.
- Navegador Edge, pantallas de 1280 y 390 píxeles: tres ventanas apiladas, cobertura completa del viewport, Tab, Escape, devolución de foco, cierre de la ventana inferior, restauración del desplazamiento, avisos visibles e impresión.
- Componentes reales de detalle de reserva y carta de compromiso: apertura superpuesta y retorno con Escape verificados en un entorno local aislado, sin errores de JavaScript y sin operaciones en datos remotos.

Para futuras ventanas, usar `BaseModal` o `ModalOverlay`. Montar `ModalOverlay` solo mientras esté abierto y proporcionar `onClose`; conservar en ese callback las restricciones de guardado o envío. Usar `NotificationPortal` para avisos, sin incorporarlos a la pila de ventanas.
