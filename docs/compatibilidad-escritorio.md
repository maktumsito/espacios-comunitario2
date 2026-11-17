# Compatibilidad de escritorio

## Resultados

| Navegador | Compilación local, catálogo simulado | Sitio publicado, sin sesión |
| --- | --- | --- |
| Microsoft Edge 157.0.4341.60 | Reactivación y desactivación | Pantalla de acceso, HTTP 200 |
| Google Chrome 157.0.8103.79 | Reactivación y desactivación | Pantalla de acceso, HTTP 200 |
| Firefox 157.0 de Playwright | Reactivación y desactivación | Pantalla de acceso, HTTP 200 |
| WebKit 27.2 de Playwright | Reactivación y desactivación | Pendiente |

La comprobación local cubre el rechazo HTTP 403, el mensaje visible, el reintento, la persistencia tras recargar y el catálogo visible desde dos contextos independientes. WebKit amplía la cobertura de motores. Safari nativo en macOS requiere su propia prueba.

Ejecutar `npm run test:browsers` con Edge y Chrome instalados, además de Firefox para Playwright (`npx playwright install firefox`). Para incluir WebKit, instalarlo con `npx playwright install webkit` y ejecutar `npm run test:browsers -- edge chrome firefox webkit`. La prueba compila en un directorio temporal, intercepta la API y bloquea las conexiones externas.

El HTML, `/build-info.json` y `/api/health` del sitio publicado coincidieron entre sí en la revisión del 17 de noviembre de 2026. La huella publicada difiere de la copia local. Se puede volver a comparar con `npm run verify:deployment -- https://espacios.ai.studio/`.

## Reproducción del fallo publicado en Edge

Con la misma cuenta de administración o coordinación, abrir Edge en el perfil afectado y Chrome. En **Administración → Espacios**, usar una sala destinada a pruebas y registrar su estado inicial.

1. Abrir **F12 → Red**, conservar el registro y pulsar **Activar**. Anotar el mensaje en pantalla y el código de `POST /api/data/write`. Omitir el encabezado `Authorization` y los datos personales.
2. Si el botón no aparece, revisar el rol y la versión cargada. Si no hay una solicitud, revisar el estado de sesión y los errores de consola. Con `401`, comprobar si expiró la sesión. Con `403`, verificar el rol efectivo del servidor. Con éxito HTTP y un estado distinto del esperado, comparar la lectura remota del catálogo y el estado después de recargar.
3. Confirmar que la sala reaparece en el directorio, en los selectores y en la agenda cuando tiene reservas visibles. Comprobar la lectura desde el segundo navegador y restaurar el estado inicial de la sala de prueba.

## Recorridos pendientes con sesión y servicios reales o de prueba

| Área | Criterio de aceptación en Edge, Chrome y Firefox |
| --- | --- |
| Acceso y administración | Inicio, cierre, expiración y roles. Crear, editar y reordenar una sala. Verificar usuarios, equipamiento, tipos y bloqueos con datos de prueba. |
| Agenda y reservas | Navegar por día y mes, fechas, filtros y teclado. Crear, editar, mover y cancelar reservas de prueba. Verificar recurrencia, conflictos, distribución y recuperación tras pérdida de conexión. |
| Documentos e informes | Importar Excel y CSV, abrir adjuntos, descargar PDF, imprimir, copiar al portapapeles y restaurar un respaldo en un entorno aislado. |
| Integraciones | Verificar acceso Google, conexión Gmail y envío a un buzón de prueba, avisos push, instalación como aplicación y reserva por texto. Registrar el resultado con permisos concedidos y denegados donde corresponda. |

Registrar navegador y versión, resultado y mensaje observado. Las funciones de ventanas emergentes, almacenamiento, notificaciones e instalación dependen también de la configuración del perfil y el sitio. [Entornos de Firebase](https://firebase.google.com/docs/web/environments-js-sdk)
