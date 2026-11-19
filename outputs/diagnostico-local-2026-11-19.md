# Diagnóstico local de Espacios Comunitarios
**19 de noviembre de 2026 · Revisión 18221cf3 · UX, rendimiento y funcionalidad**

## A. Resumen ejecutivo

El flujo de reservas pasó la prueba de alta, edición y cancelación. Pasaron también 929 pruebas unitarias y de componentes y 64 de integración.  
**1. Reducir la descarga inicial.** El acceso transfirió 2,47 MB en frío. Comprimir los JS y CSS ahorraría aproximadamente 1,81 MB en el servidor local.  
**2. Posponer la precarga hasta iniciar sesión.** Nueve archivos del formulario, detalle y buscador consumieron 417 kB antes de elegir usuario.  
**3. Corregir la accesibilidad del acceso.** El documento declara inglés y el icono para ver la clave tiene contraste insuficiente. Ambos ajustes son puntuales.

## B. Hallazgos

| N.º | Área | Problema detectado | Impacto en el usuario | Severidad (alta/media/baja) | Mejora propuesta (cambio seguro y puntual) | Riesgo para las funciones existentes (bajo/medio/alto) |
|---|---|---|---|---|---|---|
| 1 | Rendimiento | En frío, Express entregó 2.457.462 bytes de JS y CSS. Los mismos archivos comprimidos con gzip ocuparon 644.379 bytes. | La primera visita exige más ancho de banda, especialmente en móvil. | Alta en conexiones lentas | Comprobar primero la compresión del proxy. Si falta, servir variantes comprimidas de los estáticos con negociación por cabecera, Vary y variante original. Excluir la API y el guardado en streaming. | Bajo con esa delimitación |
| 2 | Rendimiento y manejo de errores | El efecto de precarga de App.tsx, línea 558, se ejecuta incluso en el acceso. Lanza tres importaciones sin tratar su rechazo. La cascada descargó nueve archivos. | Se transfieren funciones que todavía no pueden utilizarse. Una descarga especulativa fallida puede producir un rechazo sin gestionar. | Media | Programar la precarga al disponer de sesión, cancelar la tarea pendiente al salir y tratar el rechazo de la precarga. Mantener el cargador existente con reintento al abrir realmente la función. | Bajo |
| 3 | Accesibilidad | La página declara inglés en index.html, línea 2. La pantalla, los controles y los errores están en español. | Un lector de pantalla puede elegir una pronunciación incorrecta en todo el recorrido. | Media | Declarar español de Chile en el documento y comprobar nombre, rol y pronunciación del acceso. | Bajo |
| 4 | Accesibilidad | El ojo que muestra la clave usa un gris claro. Su contraste medido sobre el fondo blanco con el campo enfocado fue 2,63:1. La etiqueta del campo alcanzó 10,36:1. LoginScreen.tsx, líneas 219 y 251. | El único símbolo visible del botón puede pasar inadvertido. | Media | Oscurecer únicamente el icono en reposo hasta alcanzar al menos 3:1 en ambos fondos. Mantener su nombre y su acción de teclado. | Bajo |
| 5 | Fluidez | El formulario y el detalle tienen un fallback vacío mientras se descarga su módulo. App.tsx, líneas 1852 y 1904. | La primera apertura puede parecer un clic perdido. Ya con los módulos precargados, abrir el formulario tomó hasta 146 ms en escritorio. | Media | Mostrar «Abriendo reserva…» como estado discreto si la espera supera 150 ms. Retirarlo al montar el diálogo o presentar el error. | Bajo |
| 6 | Estabilidad visual | Al cargar el directorio se sustituye una línea de texto por la cuadrícula de cuentas. El selector reserva 72 px para cada botón, pero carece de espacio equivalente en carga. El observador detectó desplazamiento de un contenedor. | La tarjeta se recoloca antes de seleccionar la cuenta. El CLS local estuvo dentro de la referencia. | Baja | Reservar la altura de una primera fila solo durante la carga. Conservar el anuncio de carga y los estados vacío, error y reintento. | Bajo |
| 7 | Mantenimiento | La búsqueda de referencias en src solo encuentra ReservationStep1DateTime en su propia definición de 979 líneas. El formulario actual importa ReservationStep2DateTime. | Una corrección de fechas podría terminar en el archivo inactivo. No se acreditó un coste de ejecución por este archivo. | Baja | Identificar el componente activo en la guía de mantenimiento. Mantener el otro hasta revisar consumidores externos. | Bajo |
| 8 | Empaquetado | scripts/build.mjs produce el ejecutable del servidor y su mapa dentro del directorio que server.ts, línea 1085, usa para servir contenido estático. Hallazgo de código. | Es posible entregar artefactos internos como contenido público. La configuración del proxy desplegado queda por verificar. | Media | Excluir explícitamente esos dos artefactos de la publicación HTTP. Conservar sus rutas en disco para el proceso de inicio y validar los recursos públicos de la aplicación. | Bajo |

## C. Velocidad y fluidez

**Cómo se midió.** La huella de dist era distinta de la del código actual. Se compiló la revisión en un directorio temporal, con la configuración de producción de Vite, y se ejecutó Express con Firestore y Auth emulados. Se usaron una cuenta sintética para el acceso y un lote inicial de 500 reservas. Edge 157 sin interfaz gráfica, red de bucle local sin limitación de caudal ni latencia añadida. Escritorio de 1366 × 844 y CPU normal. Perfil móvil de 390 × 844 y CPU ralentizada 4×. Cada perfil tuvo cinco contextos nuevos con una visita fría y una segunda visita con la caché del mismo contexto. Medianas con mínimo–máximo. Los controles de tiempo incluyen la carga concurrente del equipo de pruebas. [Muestras y resultados](./diagnostico-local-2026-11-19-mediciones.json)

**Qué significa “usable”.** Se registró cuándo apareció el botón habilitado de la cuenta. Se comprobó en las veinte visitas que al seleccionarlo el foco pasó a la contraseña. El peso incluye el HTML y los recursos observados hasta 450 ms después de esperar el botón, incluida la precarga en reposo. El número de solicitudes cuenta las transferencias con bytes registrados por el navegador. La inspección funcional posterior de la agenda usa una sesión autenticada.

### Métricas del acceso

| Métrica | Valor actual (medido o estimado) | Meta recomendada | Brecha |
|---|---|---|---|
| TTFB del HTML | Frío, escritorio 4 ms (4–34), móvil 7 ms (4–7). Con caché, 4 ms (4–6) y 6 ms (5–15). | Referencia de campo ≤800 ms | Dentro en local. Falta la latencia de Internet. |
| Carga inicial, evento load | Frío, escritorio 215 ms (196–416), móvil 1.063 ms (979–1.214). Con caché, 94 ms (84–94) y 497 ms (462–545). | Conservar o mejorar las medianas con el mismo perfil | Línea base. El directorio aún puede estar cargando al terminar este evento. |
| LCP | Frío, escritorio 336 ms (304–832), móvil 1.584 ms (1.480–1.868). Con caché, 140 ms (132–148) y 776 ms (732–832). | ≤2.500 ms en p75 de campo | Las 20 muestras estuvieron por debajo. Falta p75 real. |
| Cuenta disponible para interactuar | Frío, escritorio 336 ms (315–565), móvil 1.802 ms (1.691–2.148). Con caché, 158 ms (150–169) y 953 ms (930–1.036). | Objetivo local propuesto ≤2 s en cada visita fría del perfil móvil | La muestra más lenta excedió el objetivo en 148 ms. |
| Clic sobre cuenta a dos cuadros de animación | Frío, escritorio 22 ms (21–23), móvil 66 ms (51–67). Con caché, 26 ms (25–27) y 45 ms (45–56). Aproximación de laboratorio. | Respuesta visible ≤200 ms | El gesto probado quedó dentro. INP de campo pendiente. |
| CLS de la carga inicial | Escritorio 0,0075 y móvil 0,0282, tanto en frío como con caché. Ventana corta, sin interacción. | ≤0,1 en p75 de campo | Dentro en esta pantalla con una cuenta. |
| Peso y solicitudes de red | En ambos perfiles, 2.468.981 bytes y 25 transferencias en frío. Con caché, 3.199 bytes y 2 transferencias. | Evitar las 9 transferencias anticipadas antes de iniciar sesión. Validar compresión en el entorno final. | Hasta 416.771 bytes diferibles en el escenario sin compresión. |
| Hilo principal | Mayor tarea larga de cada arranque frío móvil, mediana 868 ms (781–1.030). En escritorio, 129 ms (121–165). | Identificar y reducir el tramo mayor en una traza comparable | Existe bloqueo en el arranque. El observador de tareas largas por sí solo no atribuye el coste a un módulo. |

Las referencias de LCP, INP y CLS se evalúan en el percentil 75 de usuarios reales. TTFB tiene un umbral orientativo independiente. [Web Vitals](https://web.dev/articles/vitals) · [TTFB](https://web.dev/articles/ttfb)

### Operaciones de agenda

| Métrica | Valor actual (medido o estimado) | Meta recomendada | Brecha |
|---|---|---|---|
| Cargar listado completo | HTTP autenticado, mediana 189 ms (97–467), cinco lecturas intercaladas con altas. Volumen aproximado de 500 filas. | Objetivo local propuesto ≤500 ms para ese volumen | Dentro. Mide solicitud y respuesta JSON completa, incluida la red local. |
| Guardar / editar / cancelar | Cinco operaciones independientes por tipo. Medianas de 133 ms (119–170), 109 ms (91–114) y 117 ms (105–179), respectivamente. | Objetivo local propuesto ≤300 ms para una reserva simple | Dentro. El cronómetro termina al recibir la confirmación HTTP. |
| Buscar | 200 ms (172–246), diez búsquedas desde el evento de entrada hasta observar el contador en cero. Vista de día, 18 filas del período. Cero peticiones API en cada ventana observada. | ≤300 ms para actualizar resultados con este volumen | Dentro. Incluye los 150 ms de espera deliberada del filtro. |
| Abrir formulario | Clic a detección del cuerpo visible, mediana 45 ms (40–146), cinco aperturas. | ≤200 ms o indicación de espera si falta el módulo | Dentro con precarga. Falta el primer uso sobre red lenta. |
| Uso de memoria | Tras recolección forzada, 8.864 KiB antes de abrir, 11.414 tras seis ciclos y 11.631 tras doce. El DOM volvió a 1.489 nodos en los tres puntos. | DOM estable al cerrar y ausencia de crecimiento sostenido en pruebas largas | DOM estable. Los 217 KiB entre ciclos 6 y 12 no permiten diagnosticar una fuga. |

Las operaciones HTTP incluyen autenticación, lógica de servidor, emulador y transporte local. No aíslan el tiempo interno de la base. La búsqueda local tiene otro comportamiento si se pasa de una vista acotada a una consulta global. Los presupuestos locales son propuestas de aceptación para repetir el ensayo.

### Cuellos de botella y verificación

| Flujo o pantalla | Causa | Mejora propuesta | Mejora estimada | Esfuerzo (bajo/medio/alto) |
|---|---|---|---|---|
| Primera visita al acceso | Estáticos sin compresión en Express local | Verificar Content-Encoding en el proxy y servir JS/CSS comprimidos si hace falta. Comparar en Network con caché desactivada. | 2,46 → 0,64 MB de contenido JS/CSS, aproximadamente 74% menos. Estimación con los mismos archivos. | Bajo si el proxy ya lo admite |
| Acceso antes de autenticar | Precarga ociosa del formulario, detalle y paleta de comandos | Trasladar la misma precarga a la sesión autenticada. Repetir cascada de red y primera apertura después del acceso. | Hasta 9 solicitudes menos en el acceso frío, de 25 a 16 en la muestra. Los bytes pasan al momento de uso. El ahorro se solapa con la compresión. | Bajo |
| Arranque con CPU móvil | El HTML precarga React, Firebase y utilidades. El bloque de Firestore pesa 424 kB sin comprimir. Hay tareas largas aun con red local. | Aplicar primero los ajustes anteriores y perfilar el trabajo restante en DevTools Performance. Separar inicialización o SDK requeriría verificar autenticación, sesión restaurada y sincronización. | Ahorro de CPU pendiente de atribución. Comprimir reduce transferencia, no el trabajo de ejecutar el mismo JS. | Bajo para perfilar |
| Primera apertura de reserva o detalle | La vista suspendida puede quedar sin indicación si el archivo aún está en tránsito | Añadir un estado temporal con el patrón ya usado por el editor de talleres. Simular red lenta y error de descarga. | La espera obtiene explicación a partir de 150 ms. La duración de descarga se mantiene. | Bajo |
| Aparición de cuentas | El mensaje breve se sustituye por tarjetas de mayor altura | Reservar una fila y comparar en Performance → Layout Shifts con 0, 1 y varias cuentas. | La parte del CLS asociada a la primera fila podría bajar. El máximo observado total en móvil fue 0,0282. | Bajo |

**Fluidez percibida.** Mostrar el estado de apertura solo cuando haga falta evita un destello en aperturas de 40–45 ms. Mantener el foco en el disparador mientras carga y trasladarlo al diálogo una sola vez. Conservar el contador accesible de resultados del filtro y el texto de validación durante el acceso. En reservas, mantener separados «Borrador guardado en este dispositivo», «Guardando…» y la confirmación del servidor. Un éxito optimista podría ocultar un conflicto concurrente.

### Recorridos funcionales y accesibilidad

| Recorrido | Comprobación y resultado |
|---|---|
| Acceso, error y recuperación | Tres acciones principales con contraseña: elegir cuenta, escribir clave y enviar. Enter sobre la cuenta enfocó el campo. Una clave errónea mostró «Usuario o contraseña incorrectos». Al interrumpir la carga del directorio se anunció el error y «Reintentar» recuperó la lista. Recargar con sesión válida recuperó la agenda. |
| Reserva y disponibilidad | Se completó el asistente de cinco pasos, se hizo doble clic en guardar y apareció una sola reserva. Se abrió desde Lista, se editó en el formulario continuo y se confirmó la cancelación. Firestore conservó un único registro, cancelado, versión 3. Las pruebas de integración verificaron conflictos de horario, dos clientes concurrentes, ediciones obsoletas y liberación de recursos al cancelar. |
| Búsqueda, teclado y móvil | Con 2.100 registros sintéticos, el filtro devolvió 1.050 coincidencias y limpiar restauró 2.100. La lista virtual mantuvo navegación con 30 avances de Tab y un retroceso. Montó 5 elementos a 320 y 390 px y 20 a 1366 px. Las vistas Día y Lista probadas con una reserva conservaron el ancho del documento. Enter seleccionó la reserva en Día. |
| Talleres, exportación y estadísticas | Se cargó un CSV sintético de talleres. Apareció la fila para asignar espacio y categoría antes de guardar. Las pruebas unitarias cubrieron columnas ausentes, horas inválidas, feriados y reimportación. El respaldo CSV descargó 505 registros, 61.766 bytes. Estadísticas abrió los cuatro apartados de ocupación, espacios, actividades y responsables. La generación de PDF pasó sus pruebas automatizadas. |
| Lectores de pantalla, contraste y movimiento | Se inspeccionaron idioma, etiquetas, estados y foco. El acceso tiene nombre de cuenta y estado de selección, la contraseña tiene etiqueta asociada y el error usa aviso accesible. El CSS respeta la preferencia de movimiento reducido. La prueba de teclado y la inspección semántica no sustituyen una sesión con lector de pantalla. |
| Calidad de código | TypeScript pasó sin errores. Se comprobaron reintentos de carga, limpieza de efectos del directorio, búsqueda diferida, referencias a componentes y correspondencia entre directorio de publicación y salida de compilación. Las 993 pruebas pasaron. |

El contraste de referencia para texto normal es 4,5:1 y para la información visual necesaria para identificar un control activo es 3:1. [WCAG, contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [WCAG, contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

## D. Plan priorizado

1. **Comprobar la entrega de estáticos.** En Network, verificar si el alojamiento real ya comprime. Si lo hace, cerrar el hallazgo 1 para ese entorno. Si falta, activar solo en estáticos y comparar bytes, caché fría/caliente, respuesta original y tipos MIME. En la misma revisión, verificar la exclusión de los artefactos internos del hallazgo 8.
2. **Mover la precarga y dar respuesta al primer clic.** Medir por separado acceso, acceso → agenda y primera apertura con clic inmediato. Aceptar si desaparecen del acceso los nueve archivos identificados y el formulario, el detalle y la paleta siguen abriendo con sesión nueva o restaurada. Simular un fallo transitorio y recuperar. Mantener el orden actual de las escrituras.
3. **Corregir idioma y contraste.** Son dos cambios independientes que se pueden entregar en paralelo a los anteriores. Verificar con el árbol de accesibilidad, contraste calculado y NVDA o VoiceOver. Comprobar también selección con Enter, mostrar/ocultar clave y foco visible.
4. **Estabilizar el selector si sigue habiendo movimiento.** Repetir las veinte navegaciones y contrastar una cuenta frente a varias. Conservar visible el reintento en pantallas pequeñas. Descartar el ajuste si añade un hueco mayor que el desplazamiento que evita.
5. **Perfilar antes de modificar lógica compartida.** Capturar el tramo largo con CPU móvil y separar evaluación de JS, React y estilo/layout. Repetir memoria durante 100 ciclos con la misma colección. Documentar qué paso de fecha usa el formulario. Una refactorización de Firestore, del cálculo de conflictos o del asistente queda fuera de estas mejoras puntuales.

## E. Funciones que NO se deben tocar

- **Transacciones, control de versiones y permisos por rol.** El emulador confirmó rechazo de escrituras obsoletas y de operaciones sin permiso, exclusión entre clientes y reanudación de una serie de 75 sesiones sin duplicados. Son controles necesarios aunque aumenten la latencia de una escritura.
- **Cancelación con confirmación e historial.** La reserva editada quedó cancelada en la versión siguiente. La operación mantiene una pista verificable y libera la ocupación según las pruebas de persistencia.
- **Filtros locales, búsqueda diferida y virtualización.** La búsqueda observada no requirió consultar el servidor. La lista larga conservó navegación por teclado y montó una fracción de sus tarjetas. Añadir otra espera o paginar por defecto cambiaría el comportamiento sin beneficio demostrado.
- **Validación previa de talleres, borradores y exportación.** Preservar la revisión de horarios, duplicados y espacios, el guardado explícito y la diferencia entre borrador local y reserva confirmada. Mantener el alcance completo del respaldo.
- **Caché de estáticos versionados, reintentos, reducción de movimiento y estados del acceso.** La caché dejó solo dos transferencias de red en la segunda visita. La recuperación del directorio, las etiquetas y el movimiento reducido ya resuelven necesidades concretas.

## F. Datos pendientes

- **¿El proxy del despliegue ya aplica Brotli o gzip?** Una captura de Network sin credenciales, con tamaño transferido y Content-Encoding de un JS y un CSS, basta para decidir si el hallazgo 1 se aplica allí.
- **¿Qué latencias y volúmenes tienen las sedes?** Medir p75 de LCP, INP y CLS por dispositivo, tiempos de listado/guardado por operación, tamaño de agenda y cantidad de cuentas. La línea base local no predice los tiempos de los teléfonos en terreno.
- **¿Qué tecnologías de asistencia usan los operadores?** Quedan pendientes una escucha con lector de pantalla y una prueba táctil en dispositivo físico. También quedan fuera del ensayo local el proveedor real de Google, la entrega de correo y la impresión física.
- **¿Hay sesiones prolongadas o una vista particularmente lenta?** Con ese recorrido y su volumen se puede verificar memoria retenida y atribuir las tareas largas. La prueba actual no justifica cambiar la estrategia de caché ni las transacciones.
