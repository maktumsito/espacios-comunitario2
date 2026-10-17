# Auditoría de diseño y experiencia de usuario

Fecha: 17 de octubre de 2026. Aplicación revisada: https://espacios.ai.studio/

## Resultado

La mejora principal consiste en organizar la aplicación alrededor de tres tareas: consultar disponibilidad, gestionar reservas y resolver pendientes. Hoy esas tareas compiten con seis secciones, herramientas, estados técnicos y acciones administrativas en el mismo nivel visual.

Conviene conservar las funciones actuales y simplificar cómo se presentan. La agenda móvil ya ofrece una base útil: fecha, cantidad de actividades y tarjetas con horario y espacio. El mayor beneficio inicial estará en navegación, legibilidad y formulario, antes de cambiar colores o incorporar animaciones.

## Alcance y evidencia

Revisión directa con la sesión administrativa existente, en escritorio y con viewport de 390 × 844. Se inspeccionaron Calificaciones, Calendario, filtros, formulario nuevo sin completar, Uso Diario, Administración y Agenda Móvil. Se contrastaron los hallazgos con el código local.

No se crearon, editaron ni eliminaron reservas; no se enviaron correos ni se cambiaron cuentas o configuraciones. El viewport se restauró y la aplicación quedó en Calificaciones, con el formulario cerrado. Este documento contiene propuestas; no se publicaron cambios funcionales.

No se efectuaron pruebas con usuarios ni se midieron tiempos de tarea. Los beneficios descritos son esperados y deben validarse. No se verificaron interactivamente todos los pasos del formulario ni otros perfiles de acceso. La versión publicada puede diferir del código local.

## Cambios prioritarios

| Prioridad | Problema observado | Cambio propuesto | Cómo comprobar el resultado |
| --- | --- | --- | --- |
| P1 | La navegación de escritorio necesita desplazamiento horizontal: unos 652 px de contenido dentro de 472 px disponibles. Calificaciones aparece cortada y Admin queda fuera del área visible. | Navegación lateral en escritorio y menú móvil con pocas entradas principales y etiquetas completas. | Todas las secciones principales se identifican sin desplazar horizontalmente a 1280, 1440 y 1920 px. |
| P1 | En 390 px, las pestañas móviles se comprimen, cortan sus nombres y compiten con dos filas de herramientas. | Accesos móviles Agenda, Reservar y Más; las restantes secciones dentro de Más. Conservar acceso directo a notificaciones y cuenta. | Etiquetas completas, controles separados y contenido sin desplazamiento horizontal de página. |
| P1 | Una reserva nueva muestra inmediatamente un aviso de topamiento en el paso 2, antes de que la persona seleccione su horario. | Mostrar la validación de disponibilidad junto al espacio y horario elegidos. Diferenciar valores sugeridos de selecciones confirmadas. | Abrir un formulario vacío no presenta un error por una elección que la persona aún no realizó. Un conflicto real sigue bloqueando el guardado. |
| P1 | “Eliminar reservas de un día” ocupa una posición prominente sobre las vistas operativas, incluso en móvil. “Restaurar Valores por Defecto” aparece en la cabecera de Administración. | Mover acciones masivas y restablecimientos a menús contextuales o configuración avanzada. Mantener sus confirmaciones y mostrar alcance y cantidad afectada. | Consultar o crear reservas no expone una acción destructiva como tarea principal. |
| P1 | Horarios y nombres usan tamaños de 9–10 px en calendario y matriz; numerosas actividades quedan truncadas. | Texto principal de 14–16 px en listas y formularios; rediseñar la densidad de la matriz y ofrecer detalle legible. | Se puede identificar actividad, hora y espacio sin depender de hover, zoom o reconocimiento del color. |
| P2 | Calendario, Uso Diario y Agenda Móvil se presentan como productos distintos para consultar la misma programación. | Agruparlos bajo Agenda, con selector Mes / Día / Lista. Mantener fecha y filtros al cambiar de vista. | Cambiar de vista conserva contexto y tiene un resultado predecible. |
| P2 | El calendario muestra dos actividades y “+N más” en días con 26–35 actividades. El detalle queda lejos, debajo del mes. | Abrir un panel del día al seleccionarlo, con todas sus actividades y acción Reservar ese día. | Un clic permite revisar la programación completa del día; no es necesario descubrir el doble clic. |
| P2 | El panel de filtros dice “Mostrando 5829 de 5829 reservas” mientras el calendario muestra un mes. | Mostrar el resultado del período visible y, aparte, el total cargado si aporta información. Añadir etiquetas visibles y chips de filtros activos. | El contador coincide con la vista y se entiende qué modifica cada filtro. |
| P2 | La matriz reúne 19 espacios y exige explorar horizontal y verticalmente. | Selector de espacios y grupos; opción Todos y alternativa Lista. Conservar encabezados y horas fijos, que ya existen. | Se puede comparar un conjunto relevante de salas sin perder fecha, horas ni selección. |
| P2 | Calificaciones dedica aproximadamente 350 px a un encabezado decorativo antes de las tareas pendientes. | Cabecera breve, pendientes primero, resumen compacto y automatización como estado secundario. | La primera evaluación pendiente aparece en el primer tramo visible de escritorio. |
| P2 | Administración usa ocho pestañas horizontales, algunas fuera de vista, y tarjetas grandes para 19 espacios. | Agrupar secciones por finalidad y ofrecer lista compacta con búsqueda. Mostrar IDs técnicos dentro del detalle. | Localizar un espacio o una configuración no requiere recorrer pestañas ocultas o numerosas tarjetas. |
| P2 | Estado de conexión, hora de sincronización, usuario y sesión aparecen repetidos o con mucha prominencia. | Un único indicador discreto de conexión; ampliar información al abrirlo. Advertir sobre la sesión cuando se acerque el vencimiento. | La persona entiende si sus cambios están guardados sin tener que interpretar varios indicadores. |

P1: resolver primero por alcance, esfuerzo de uso o exposición a errores. P2: siguiente etapa de orden y eficiencia. La prioridad no equivale a una estimación de desarrollo.

## Estructura propuesta

```text
ESCRITORIO
┌──────────────────┬────────────────────────────────────────────┐
│ CCD Diaguitas    │ Buscar                  + Nueva reserva    │
│                  ├────────────────────────────────────────────┤
│ Agenda           │ Agenda · fecha / período                   │
│ Reservas         │ Mes | Día | Lista     Espacios · Filtros   │
│ Pendientes       ├────────────────────────────────────────────┤
│ Informes         │                                            │
│ Administración   │ Programación / disponibilidad              │
│                  │                                            │
│ Cuenta · Conexión│ Detalle del día o reserva seleccionada     │
└──────────────────┴────────────────────────────────────────────┘

MÓVIL
┌────────────────────────────────────┐
│ Agenda              Avisos · Cuenta│
│ Fecha · Hoy · Anterior / Siguiente │
│ Buscar · Filtros activos           │
│                                    │
│ Lista de actividades del día       │
│ Hora · Actividad · Espacio · Estado│
│                                    │
│ Agenda       + Reservar       Más  │
└────────────────────────────────────┘
```

Las entradas deben respetar los permisos existentes. “Reservas” representa búsqueda y gestión; no requiere duplicar los datos de Agenda. “Pendientes” puede agrupar calificaciones y conflictos conservando sus reglas y permisos. “Informes” reúne métricas y exportaciones.

En Administración, agrupar: Catálogos (espacios, tipos y equipos), Operación (mantención y recurrencias), Personas (solicitantes y usuarios) y Sistema (correo y respaldos).

## Formulario de reserva

Mantener el flujo guiado existente y mejorar su presentación antes de cambiar la lógica de negocio:

1. **Actividad:** nombre y tipo. Un único control de categoría; las opciones frecuentes pueden complementar el selector sin duplicar el estado.
2. **Fecha, espacio y horario:** disponibilidad y conflictos junto a los campos correspondientes. Si se abre desde una celda libre o día, conservar ese contexto y mostrarlo claramente.
3. **Solicitante:** búsqueda y selección con información suficiente para distinguir coincidencias.
4. **Recursos y documentos:** indicar que es opcional; una sola ubicación para activar la carta de compromiso.
5. **Revisión:** resumen de qué se reservará, fechas afectadas, documentos requeridos y acción final inequívoca.

El código local contiene cinco pasos, pero el cambio de modo aún dice “Modo Guiado (3 Pasos)” y su ayuda habla de tres. Corregir esa inconsistencia. En la revisión en vivo no quedó confirmado el cambio efectivo al formulario completo; no se considera demostrado un fallo de funcionamiento.

Reservas recurrentes deben mostrar siempre el alcance de una modificación: una fecha, fechas seleccionadas o toda la serie. Mantener las validaciones actuales y la protección de concurrencia.

## Criterios visuales comunes

- Un título de página y una acción principal; acciones secundarias agrupadas según contexto.
- Escala tipográfica consistente. Evitar resolver la densidad reduciendo continuamente el texto.
- Azul para acciones y selección; estados de advertencia, error y éxito con texto e icono. Colores de categorías como apoyo, no como única identificación.
- Mismos términos en todos los lugares: “Agenda”, “Vista diaria”, “Nueva reserva”, “Espacio”, “Solicitante”.
- Estados vacíos con una siguiente acción útil; distinguir “sin resultados”, “sin actividades” y “cargando”.
- Conservar controles táctiles amplios donde ya existen y verificar los restantes; revisar foco visible, teclado y ampliación al 200 % en la implementación.
- Conservar la gestión de foco, Escape y capas de los modales ya trabajada; no sustituirla al cambiar su apariencia.

## Orden de implementación

1. **Base común:** navegación, cabecera, tipografía, nombres consistentes y ubicación de acciones masivas.
2. **Consulta de disponibilidad:** unificar Agenda y sus vistas; filtros del período, panel del día y selección de espacios.
3. **Reserva:** validación contextual, eliminar controles duplicados y aclarar avance y revisión.
4. **Trabajo administrativo:** pendientes primero en Calificaciones; Administración agrupada con listas consultables.

Cada etapa debe poder revisarse por separado. El orden propuesto no exige migrar la base de datos.

## Mantener el ahorro de Firestore

Los cambios de presentación deben utilizar los datos ya cargados y los selectores existentes. Cambiar Mes / Día / Lista, abrir un panel o filtrar no debería generar una nueva lectura si la información necesaria está disponible.

No agregar un listener por tarjeta o sala, consultas repetidas al escribir cada letra, recargas al abrir menús ni sincronizaciones por navegación. Mantener suscripciones compartidas y comprobar lecturas/escrituras antes y después con el mismo recorrido y datos. Cuando sea necesario cargar información adicional, hacerlo con consultas acotadas y reutilizar el resultado.

Una auditoría visual no permite afirmar una reducción porcentual de operaciones ni de tiempos de uso. Esas mejoras se deben medir tras la implementación.

## Validación de la siguiente versión

| Tarea | Resultado esperado |
| --- | --- |
| Consultar todas las actividades de un día cargado | Lista completa accesible desde la fecha, sin información esencial truncada. |
| Buscar disponibilidad de un espacio | Fecha y espacio visibles; se distinguen horario libre y ocupado. |
| Iniciar una reserva desde el calendario | Fecha contextual correcta; sin avisos prematuros de conflicto. |
| Elegir un horario ocupado | Aviso junto al horario con una explicación y corrección posible. |
| Cambiar Mes / Día / Lista | Fecha y filtros conservados; sin lectura adicional cuando los datos ya están cargados. |
| Cambiar una recurrencia | Alcance explícito antes de confirmar. |
| Usar el teléfono con una mano | Navegación reconocible, controles separados y ninguna etiqueta principal cortada. |
| Completar tareas con teclado | Foco visible y orden coherente; apertura y cierre de diálogos conservan el foco. |
| Consultar sin conexión y volver a conectar | Estado claro y conservación de las protecciones actuales de sincronización. |

Medir: finalización de tareas, errores, pasos de corrección, tiempo por tarea y operaciones de Firestore bajo recorridos comparables. No fijar porcentajes de mejora sin una línea base.

## Referencias de implementación

- `src/components/Navbar.tsx`: navegación principal con `overflow-x-auto`, herramientas y estado global.
- `src/components/CalendarView.tsx:207`: actividades del mes con texto de 10 px; horario de 9 px en la misma tarjeta.
- `src/components/FilterBar.tsx:298`: contador global de resultados.
- `src/components/DailyUsageView.tsx:1234`: matriz con desplazamiento; encabezados y columna horaria ya fijos.
- `src/components/ReservationModal.tsx:1476`: cinco pasos y aviso de conflicto mostrado en el bloque del asistente.
- `src/components/ReservationModalHeader.tsx:62`: ayuda y etiqueta que todavía mencionan tres pasos.
- `src/components/AdminView.tsx:1094`: restablecimiento con confirmación existente; la propuesta cambia su ubicación visual.

## Capturas de referencia

Las capturas de la revisión inicial se conservan localmente en `output/ux-2026-10-17/`. Algunas contienen datos operativos y no se incorporan al repositorio.

La [implementación y su validación](implementacion-ux-2026-10-17.md) incluyen capturas con datos de ejemplo que sí se pueden consultar desde el repositorio.
