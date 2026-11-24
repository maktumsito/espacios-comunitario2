# Segunda auditoría de Espacios Comunitarios
**19 de noviembre de 2026 · GitHub main y copia local 843c8fe9 · Comparación con 18221cf3**

## A. Resumen ejecutivo

El alta, edición y cancelación conservaron una única reserva y su historial. La carga del formulario ya da respuesta visible y el acceso declara español de Chile.

**1. Corregir el conteo por sala.** Estadísticas mostró cero reservas y cero asistentes para una sala acentuada que tenía una reserva de cuatro personas.

**2. Verificar la compresión de estáticos.** El acceso aún transfirió 2,44 MB en frío. En la compilación local, gzip ahorraría 1,80 MB de JS y CSS.

**3. Posponer la precarga hasta la sesión autenticada.** Nueve archivos del formulario, detalle y buscador sumaron 417 kB antes de elegir usuario.

## B. Tabla de hallazgos

| N.º | Área | Problema detectado | Impacto en el usuario | Severidad | Mejora propuesta (cambio seguro y puntual) | Riesgo para las funciones existentes |
|---|---|---|---|---|---|---|
| 1 | Funcionalidad de Estadísticas | En AnalyticsView.tsx, líneas 69–98, la agregación elimina tildes al procesar la reserva y conserva las del nombre al consultar el catálogo. Con dos reservas de prueba, SALÓN NORTE mostró 0 usos y 0 personas en lugar de 1 y 4. SALA 2 y SALA 3 sí mostraron por separado el uso compartido que les correspondía. | Un informe de demanda puede subestimar la ocupación y la asistencia de salas personalizadas. | Alta | Usar la misma normalización en ambos lados exclusivamente en Estadísticas. Conservar la etiqueta original, los datos guardados y el conteo de espacios compartidos. Antes de aplicar, comprobar si dos nombres del catálogo se normalizan igual. Si ocurre, resolver primero esa correspondencia en el informe. | Bajo al limitarlo a visualización |
| 2 | Arranque y transferencia | Express sirve los estáticos directamente. En la captura fría, los JS y CSS ocuparon 2.427.105 bytes de contenido. El cambio de compresión en dataApi.ts solo alcanza respuestas de datos. | Más espera y consumo de datos en la primera visita desde conexiones lentas. | Alta en redes limitadas | Comprobar primero el proxy real. Activar compresión negociada solo para estáticos si hace falta. Mantener variante original, caché versionada, tipos MIME y flujo de guardado. | Bajo |
| 3 | Trabajo anticipado | El efecto de App.tsx, alrededor de la línea 582, sigue importando tres funciones en reposo al montar el acceso. La cascada confirmó nueve archivos antes de iniciar sesión. Además, la precarga por foco/puntero usa importaciones sin tratar su rechazo. | Consumo anticipado para personas que aún no entraron. Un fallo de red especulativo puede producir un rechazo sin gestionar. | Media | Condicionar la precarga a la sesión, cancelar tareas pendientes al salir y manejar el rechazo de la precarga. Conservar el cargador con reintento ante una apertura real. | Bajo |
| 4 | Compatibilidad HTTP | Una lectura de 506 documentos devolvió gzip incluso al solicitar explícitamente “gzip;q=0, identity;q=1”. La selección busca la subcadena gzip en tres rutas de dataApi.ts. | Un cliente que rechaza gzip puede recibir un cuerpo que no puede leer. | Media | Negociar la codificación con el mecanismo de Express que respeta preferencias. Probar sin cabecera, con gzip aceptado y con gzip excluido. Mantener el umbral, el JSON y la autorización actuales. | Bajo |
| 5 | Accesibilidad visual | El icono para mostrar la contraseña mantiene contraste 2,63:1 en el campo enfocado, por debajo de 3:1. La etiqueta de contraseña alcanzó 10,36:1. LoginScreen.tsx, línea 254. | Es difícil identificar la acción para comprobar la contraseña escrita. | Media | Oscurecer solo el icono en reposo. Verificar los fondos normal y enfocado, su nombre accesible y la activación por teclado. | Bajo |
| 6 | Estabilidad | En el directorio una línea de carga se sustituye por botones de al menos 72 px. Hubo desplazamiento de un contenedor. El CLS quedó dentro de la referencia. | La tarjeta cambia de posición mientras se elige la cuenta. | Baja | Reservar el espacio de la primera fila durante la carga y comparar con una y varias cuentas. Conservar error, reintento y estado vacío. | Bajo |
| 7 | Mantenimiento | useReservationsState aún expone un aviso siempre nulo y un setter vacío. La búsqueda en src solo los encontró dentro del propio hook. También persiste ReservationStep1DateTime sin importaciones desde src. | Quien mantenga el código puede usar una función sin efecto o corregir el componente de fecha inactivo. | Baja | Marcar las interfaces obsoletas y señalar el paso activo. Antes de retirar cualquier exportación, verificar consumidores externos. | Bajo para documentación |
| 8 | Publicación | scripts/build.mjs sigue ubicando el servidor compilado y su mapa en el directorio usado por express.static en server.ts, línea 1085. Comprobación de código. | Posible publicación de artefactos internos según la configuración del alojamiento. | Media | Excluir esos dos ficheros de las respuestas públicas y conservar sus rutas de ejecución. Verificar inicio y entrega de recursos legítimos. | Bajo |

## C. Velocidad y fluidez

**Método.** Se recompiló la revisión publicada en un directorio temporal. Express, Auth y Firestore se ejecutaron localmente con datos sintéticos. Edge 157.0.4341.60, escritorio 1366 × 844 con CPU normal y móvil simulado 390 × 844 con CPU ralentizada 4×, ambos en bucle local sin limitación de red. Por perfil se hicieron cinco visitas con contexto nuevo y cinco con la caché de ese contexto. Se anotó cuándo apareció la cuenta habilitada, se comprobó el foco en la contraseña tras el clic y se contaron las transferencias con bytes hasta la captura posterior a la aparición de la cuenta. Las muestras incluyen precarga ociosa. Los tiempos resumen medianas y, entre paréntesis, mínimo–máximo. [Mediciones de esta revisión](./diagnostico-843c8fe9-mediciones.json) · [Diagnóstico anterior](./diagnostico-local-2026-11-19.md)

### Métricas del acceso

En cada celda, el orden es **escritorio / móvil**. Las metas de producción de LCP, INP y CLS corresponden al percentil 75 de visitas reales. La aproximación de clic utiliza dos cuadros de animación. [Web Vitals](https://web.dev/articles/vitals) · [Referencia de TTFB](https://web.dev/articles/ttfb)

| Métrica | Valor actual medido en frío | Valor actual con caché | Meta recomendada | Brecha |
|---|---|---|---|---|
| TTFB del HTML | 8 (5–31) / 6 (4–8) ms | 6 (4–8) / 5 (5–7) ms | ≤800 ms como referencia de campo | Dentro en local. Falta red real. |
| Evento de carga inicial | 248 (227–371) / 1.114 (1.021–1.420) ms | 112 (89–118) / 633 (548–748) ms | Conservar o mejorar la línea base del perfil | En móvil frío, +51 ms frente a los 1.063 ms anteriores. |
| LCP | 376 (360–840) / 1.864 (1.828–2.200) ms | 160 (132–176) / 908 (836–1.076) ms | ≤2.500 ms | Dentro en laboratorio. La mediana móvil fría anterior fue 1.584 ms. |
| Cuenta disponible para elegir | 375 (361–542) / 2.161 (2.129–2.649) ms | 183 (164–205) / 1.120 (1.045–1.337) ms | ≤2.000 ms en cada visita fría móvil, presupuesto local del informe anterior | Las cinco visitas móviles frías lo superaron. Mediana +161 ms sobre el presupuesto y +359 ms sobre la revisión anterior. |
| Clic en cuenta a dos cuadros | 19 (18–21) / 80 (75–122) ms | 22 (18–24) / 54 (50–67) ms | Reacción visible ≤200 ms | Dentro para el gesto probado. INP real pendiente. |
| CLS del acceso | 0,0075 / 0,0282 | 0,0075 / 0,0282 | ≤0,1 | Igual a la revisión anterior en estas condiciones. |
| Bytes y solicitudes con transferencia | 2.438.251 B y 24 en ambos perfiles | 3.126 B y 2 en ambos | Evitar las 9 transferencias anticipadas, además de verificar la compresión | Frente a 2.468.981 B y 25 anteriores, se ahorraron 30.730 B (1,24%) y una solicitud fría. |
| Mayor tarea larga por visita | 141 (117–173) / 856 (783–1.124) ms | 75 (60–83) / 457 (397–561) ms | Reducir las tareas que bloquean la respuesta móvil | Antes, 868 ms de mediana móvil fría. Una traza adicional detectó una tarea de 1.481 ms. Su desglose no permite atribuir el total a React ni a Firebase. |

**Interpretación.** El archivo JS principal bajó de 552 a 432 kB de contenido y las vistas de agenda se cargan según necesidad. El conjunto frío bajó mucho menos: el archivo de Firebase Core pasó de unos 260 a 350 kB transferidos y Firestore sigue precargándose. Los tiempos de dos tandas con cinco visitas pueden variar con la carga del equipo. El dato más estable para comparar versiones es la cascada de archivos y bytes.

**Control adicional de la diferencia móvil.** Al terminar las pruebas concurrentes se alternaron ambas compilaciones en el mismo equipo, con el mismo directorio sintético servido en memoria, CPU 4× y cinco contextos fríos por versión. La cuenta apareció en 1.744 ms de mediana en la versión anterior y 1.539 ms en la actual (205 ms antes). El LCP pasó de 1.504 a 1.340 ms. El ensayo completo con backend superó el presupuesto, pero este control favorece al frontend nuevo. Para atribuir la diferencia entre tandas hace falta repetir con el backend real aislado y carga del equipo equivalente.

### Operaciones clave

| Métrica | Valor actual medido | Meta recomendada | Brecha |
|---|---|---|---|
| Listar reservas por HTTP | 86 ms (73–195). Cinco lecturas autenticadas de alrededor de 500 documentos, incluyendo transporte, servidor y decodificación. Antes, 189 ms. | ≤500 ms en el mismo entorno | Dentro. La mejora observada de tiempo no se atribuye íntegramente a gzip. |
| Crear / editar / cancelar por HTTP | Cinco casos por operación. Crear 117 ms (86–139), editar 80 ms (71–82), cancelar 76 ms (69–95). Antes, 133 / 109 / 117 ms. | ≤300 ms por reserva simple, con confirmación | Dentro en emulador. |
| Filtrar agenda | 220 ms (191–259) para que el contador pasara de 18 a 0, cinco intentos. Cero peticiones API en las cinco ventanas. Antes, 200 ms. | ≤300 ms para esta consulta | Dentro. Incluye los 150 ms deliberados de espera del filtro. |
| Abrir formulario de reserva | 68 ms (64–196) en cinco aperturas de escritorio. Antes, 45 ms (40–146). | ≤200 ms o indicación de carga | Dentro. Al retener temporalmente el módulo, apareció «Cargando ventana…» y desapareció al abrirse el formulario. |
| Memoria tras abrir/cerrar el formulario | Tras recolección forzada, 8.787 KiB al inicio, 11.445 tras seis ciclos y 11.646 tras doce. DOM estable en 1.494 elementos. | Recuperar el número de elementos al cerrar y descartar crecimiento persistente | +201 KiB entre ciclos 6 y 12. La muestra no demuestra una fuga. |

### Cuellos de botella y ganancias verificables

| Flujo o pantalla | Causa | Mejora propuesta | Mejora estimada | Esfuerzo |
|---|---|---|---|---|
| Primera visita | JS y CSS locales sin comprimir | Verificar Content-Encoding en el alojamiento y, si corresponde, servir versiones comprimidas con negociación | Los archivos observados pasan de 2.427.105 a 628.039 B al comprimirlos con gzip. Ahorro potencial del 74% en esos archivos. | Bajo si lo admite el proxy |
| Acceso sin sesión | Precarga del editor, detalle y paleta | Mover la tarea ociosa después de autenticar y mantener la precarga por intención | Hasta 416.653 B y 9 transferencias diferidas. En la misma ventana se pasaría de 24 a 15. Este ahorro se solapa con el de compresión. | Bajo |
| Arranque móvil | Trabajo de hilo principal en módulos y montaje, incluso con caché | Medir de nuevo tras retirar trabajo especulativo. Aislar en una traza evaluación, montaje y primera consulta antes de cambiar dependencias compartidas. | La duración recuperable aún no está aislada. Validar contra el presupuesto de 2 s y contra la primera apertura posterior. | Bajo para medir |
| Directorio de acceso | Sustitución del mensaje por la fila de cuentas | Reservar una fila durante la espera | Puede eliminar el desplazamiento de esa fila. El CLS total móvil observado fue 0,0282. | Bajo |
| Listado grande | La API comprime sincrónicamente en el hilo de Node | Preservar el ahorro actual. Medir demora del bucle de eventos con lecturas concurrentes antes de plantear gzip asíncrono. | Beneficio ya medido en 506 documentos: 155.776 → 7.531 B, 95,2% menos. No se ha demostrado saturación por compresión. | Bajo para medir |

**Fluidez percibida**

- Conservar la indicación de carga del diálogo y el traspaso de foco cuando ya está listo. Si una grabación con red rápida muestra un destello, retrasar solo la aparición visual del indicador.
- Mantener el aviso accesible del filtro, la escritura inmediata y la actualización diferida de los resultados. Añadir otra espera prolongaría una búsqueda que ya cumple el presupuesto.
- Mantener separados el borrador local, el guardado en curso y la confirmación del servidor. La comprobación de conflictos puede rechazar una escritura después del clic.

### Pruebas funcionales y de accesibilidad

| Recorrido | Evidencia de esta revisión |
|---|---|
| Acceso y recuperación | Elegir cuenta, escribir contraseña y enviar. Enter enfocó la clave. Clave incorrecta mostró un error. Al fallar la carga del directorio, «Reintentar» recuperó la lista. La sesión sobrevivió a una recarga. El documento devolvió es-CL en las veinte visitas. |
| Reservas y disponibilidad | Asistente de cinco pasos, doble clic al enviar, edición y cancelación confirmada. Se observaron tres escrituras en total y un único registro final en el emulador, cancelado y en versión 3. Integración cubrió concurrencia, conflictos, permisos, cambios obsoletos y reintentos. |
| Uso móvil y teclado | Doce comprobaciones de componentes a 320, 390 y 1366 px. Con 2.100 registros, filtrar devolvió 1.050 y limpiar restauró 2.100. Tab avanzó 30 elementos y retrocedió uno. Se montaron 5 tarjetas en ambos anchos móviles y 20 en escritorio. En las vistas Día y Lista probadas no hubo desbordamiento del documento y Enter seleccionó una reserva en Día. |
| Talleres y exportación | Un CSV de prueba llegó a revisión de fila, espacio y categoría. La exportación produjo un CSV de 61.101 bytes para los 500 registros que indicaba el botón. Los tiempos y tamaños de exportación no se comparan con el informe anterior porque difirió el conjunto visible. |
| Estadísticas | Abrieron los cuatro apartados de indicadores. En la vista «Lista / Barras Simples» se reprodujo el error de sala acentuada y se verificó el reparto de la reserva compuesta entre dos salas. |
| Estados, accesibilidad y movimiento | Se probaron selección con teclado, foco, contraste del acceso y estados de carga/error. El CSS mantiene la preferencia de movimiento reducido. La confirmación auditiva con tecnología de asistencia queda pendiente. |
| Calidad de código y pruebas | La compilación de producción y TypeScript pasaron. Pasaron 929 pruebas unitarias y de componentes y 64 de integración con los emuladores. El fallo de Estadísticas se encontró al probar el catálogo acentuado fuera de esa suite. |

## D. Plan de acción priorizado

1. **Reparar el indicador de salas.** Limitar el cambio a la clave de agregación de Estadísticas. Repetir con un nombre acentuado, una sala simple, una reserva compuesta y un catálogo histórico. Aceptar cuando SALÓN NORTE muestre 1 reserva y 4 personas y las otras dos sigan mostrando 1 y 4 cada una.
2. **Comprobar la compresión en el entorno de entrega y corregir la negociación de la API.** En Network comparar bytes transferidos y descomprimidos. Contra la API, solicitar identidad, gzip válido y gzip excluido, y verificar la igualdad del JSON decodificado. Mantener permisos, caché privada y guardado progresivo. [Negociación HTTP de codificación](https://www.rfc-editor.org/rfc/rfc9110.html#name-accept-encoding)
3. **Diferir la precarga del acceso y corregir el contraste.** Son ajustes independientes. Repetir las cinco visitas por perfil y caché, incluyendo acceso seguido de apertura inmediata, red lenta y descarga fallida. Verificar el ojo de la contraseña en reposo, en foco y con teclado contra el mínimo 3:1. [WCAG, contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
4. **Revisar publicación, estabilidad y memoria.** Verificar los límites públicos del paquete del servidor, probar el directorio con varias cuentas y comparar Layout Shifts. Si se observa deterioro en jornadas largas, repetir 100 ciclos y comparar instantáneas de memoria retenida. Dejar la limpieza de código sin consumidores para una revisión separada.

## E. Funciones que NO se deben tocar

- **Autorización, transacciones y reintentos.** Conservar el control de versiones, el rechazo de conflictos, el historial de cancelación y la idempotencia. Son más importantes que ahorrar una llamada de confirmación.
- **Búsqueda y agenda.** Mantener la referencia estable del subconjunto filtrado, la actualización diferida y la virtualización con teclado. El filtro local no necesita una consulta adicional. Conservar el cálculo por cada sala integrante en reservas compartidas.
- **Carga y recuperación.** Preservar la caché de estáticos versionados, los esqueletos de agenda, la nueva respuesta visible al abrir diálogos y la recuperación de sesión. Las vistas de calendario ahora se cargan por demanda.
- **Integridad de importaciones y respaldos.** Conservar revisión previa, validaciones de horario y duplicados, separación entre borrador y reserva confirmada y alcance de la exportación. Mantener para clientes compatibles la compresión que ya ahorra tráfico en la API.

## F. Datos pendientes

- ¿El proxy real comprime los estáticos y excluye los artefactos del servidor? Una captura de cabeceras y tamaños del despliegue permitiría cerrar ambos puntos.
- ¿Qué salas personalizadas o históricas tienen tildes o nombres equivalentes al normalizarlos? Basta una lista de nombres para estimar el alcance real del error de Estadísticas.
- ¿Cuál es el p75 de LCP, INP y CLS en dispositivos de las sedes, y cuántos registros y cuentas cargan? Los ensayos locales permiten comparar versiones. Falta la experiencia de campo y el desglose interno de las latencias del backend.
- Quedan pendientes lector de pantalla real, prueba táctil en teléfono físico, autenticación con el proveedor externo, entrega real de correo e impresión física. El alcance acordado fue local con datos de prueba.
