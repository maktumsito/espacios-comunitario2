# IA gratuita para solicitudes de reserva

La opción «Crear Reserva Automática desde Solicitud» consulta Gemini al pulsar crear.
Después muestra el resultado editable y exige «Confirmar y crear reserva» antes de guardar.
La disponibilidad, las mantenciones, los feriados y el aforo se comprueban con las reglas
de la aplicación, incluyendo la validación del servidor al guardar.

## Configuración

1. Crear o seleccionar un proyecto en https://aistudio.google.com/api-keys.
2. Verificar en https://aistudio.google.com/projects que su nivel sea **Free** y que no
   tenga una cuenta de facturación vinculada. No reutilizar una clave de un proyecto de pago.
3. Guardar su clave en el secreto de servidor `GEMINI_API_KEY` y reiniciar el servicio.
   En desarrollo puede configurarse en el `.env` privado. Nunca compartirla, guardarla en
   el repositorio ni utilizar un nombre `VITE_*`.
4. Revisar las cuotas reales del proyecto en https://aistudio.google.com/rate-limit.
5. Probar una solicitud ficticia, revisar los datos y confirmar la creación.

Se utiliza exclusivamente `gemini-3.5-flash-lite` mediante la API REST, sin búsquedas,
servicios alternativos ni reintentos automáticos. La gratuidad depende del nivel del
proyecto en Google; la aplicación no puede verificarlo ni convertir una clave de pago
en una clave gratuita. Los límites varían por proyecto y se comparten entre usuarios.
El costo de alojamiento existente de la aplicación es independiente.

## Datos y fallos

El navegador oculta los datos personales detectados (nombre, RUT, teléfono, correo y
domicilio). El historial y la ficha del solicitante permanecen en la aplicación. Google
recibe el texto filtrado, catálogos de nombres/identificadores y contexto de fecha de
Santiago; no recibe la lista de reservas. El servidor vuelve a filtrar identificadores
comunes y no registra el texto ni las respuestas. El filtrado no garantiza anonimizar
información personal escrita en formas desconocidas: no incluir datos sensibles en el
texto libre. El nivel Free puede usar contenido para mejorar productos de Google.

Sin clave, al alcanzar la cuota, con errores o después de 20 segundos, aparece un aviso
y se permite revisar y confirmar los datos del detector local. No se guarda ninguna
reserva durante el análisis. Cambiar el texto o cerrar el modal cancela la consulta y
descarta cualquier respuesta tardía. Los ajustes manuales se conservan durante el análisis.

Referencias: [precios](https://ai.google.dev/gemini-api/docs/pricing),
[cuotas](https://ai.google.dev/gemini-api/docs/rate-limits) y
[datos y condiciones](https://ai.google.dev/gemini-api/terms).

Se actualizó a Gemini 3.5 Flash-Lite porque la API rechaza 2.5 Flash-Lite para usuarios nuevos. La elección es fija; no existe cambio automático a otros modelos.
