# Sesiones, confirmación del wizard y verificación de publicación

## Comportamiento

Cada pestaña queda vinculada al inicio de sesión que abrió. Un nuevo login en otra pestaña, incluso con el mismo usuario, o un cierre compartido vuelve a la selección de usuario y cierra los formularios de la pestaña anterior. Esa limpieza no elimina la sesión nueva. Las peticiones de datos, Gmail y mantenimiento usan la misma comprobación de identidad; no reutilizan tokens antiguos de `sessionStorage`. Una renovación del mismo login comparte el token y el nuevo vencimiento sin cambiar de cuenta. Las respuestas tardías de renovación no restauran una sesión anterior.

El envío del formulario guiado desde los pasos 1 a 4 valida y avanza al paso siguiente. Solo el envío desde el paso 5 ejecuta el guardado. El formulario completo y el flujo de reemplazo conservan sus controles existentes.

## Comprobar la versión publicada

`npm run build` genera una misma identificación para frontend y servidor: commit disponible, indicador de cambios locales, fecha de compilación y SHA-256 de los archivos de la aplicación. El hash normaliza CRLF/LF y funciona también en exportaciones de AI Studio sin carpeta `.git`. No contiene secretos ni depende de los datos de Firestore.

Se publica en el HTML (`app-source-hash`), `/build-info.json` y `/api/health` (`build`). El HTML y el manifiesto no se almacenan como recursos inmutables.

Después de sincronizar el código en AI Studio y republicar frontend y backend juntos:

```powershell
npm run verify:deployment -- https://espacios.ai.studio/
```

El comando solo lee URLs públicas. Sale con error si no hay identificación, si el HTML, frontend y backend no corresponden a las fuentes locales o si provienen de compilaciones diferentes. No basta con un HTTP 200: una respuesta HTML en lugar del JSON esperado también falla. Un resultado correcto verifica la versión y salud del servidor; no acredita un guardado en Firestore ni entrega de correo.

## Evidencia de la revisión del 17-10-2026

- Producción: `/api/health` y `/api/auth/users` respondieron HTTP 200; el directorio devolvió seis cuentas sin exponer contraseñas. Se abrió y cerró el wizard desde la sesión existente del navegador, sin registrar reservas.
- AI Studio: repositorio conectado `maktumsito/espacios-comunitario2`, rama `main`; el panel informó sincronización a las 17:15 antes de subir estas correcciones.
- La publicación examinada todavía no ofrece `/build-info.json`: responde el HTML de la aplicación. Por tanto, no se acredita que incluya estas correcciones ni se considera completada su validación de persistencia.
- Las pruebas de regresión cubren cierre, cambio de cuenta, nuevo login con la misma cuenta, renovación compartida, rechazo de tokens obsoletos, respuestas tardías y envío desde pasos intermedios. Los casos de reemplazo utilizan el nombre accesible del botón de revisión para admitir sus etiquetas de escritorio y móvil.
- Resultado: `npm run lint` y `npm run build` correctos; batería completa con 571 pruebas correctas y 39 omitidas que requieren su entorno de integración. La comprobación de versión pasó contra el servidor compilado local; también detectó correctamente una compilación anterior cuando cambiaron las fuentes.
- Chrome, dos pestañas sobre un origen local aislado con cuentas sintéticas: restauración de la misma sesión, cambio de cuenta, nuevo login con la misma cuenta y cierre compartido comprobados. La pestaña anterior quedó sin credencial y la nueva mantuvo su sesión. No se usaron cuentas ni datos reales para estas pruebas.

Para cerrar la validación real queda republicar esta versión y comprobar el hash. Un recorrido que guarde una reserva real requiere una reserva de prueba identificada y autorización para modificar los datos de producción.
