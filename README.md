<div align="center">

<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

  <h1>Built with AI Studio</h2>

  <p>The fastest path from prompt to production with Gemini.</p>

  <a href="https://aistudio.google.com/apps">Start building</a>

</div>


La guía de [correcciones y operación gratuita](docs/correcciones-gratuitas-2026-10-08.md) describe el acceso autenticado, la preparación de cuentas individuales, recuperación y validación local.

## Desarrollo y comprobación

Instala las dependencias con `npm ci`. Para trabajar con datos de prueba, inicia los emuladores Firestore y Auth con el proyecto `demo-espacios`, configura `VITE_LOCAL_TEST_MODE=true` y ejecuta `npm run dev`. Consulta `.env.example` para identificar las demás variables.

- `npm run lint` comprueba los tipos.
- `npm test` ejecuta las pruebas generales.
- `firebase emulators:exec --project demo-espacios --only firestore,auth "npm run test:integration"` ejecuta las pruebas de integración aisladas.
- `npm run build` genera el cliente y servidor para despliegue.

## Acceso a reservas

| Perfil | Agenda básica | Datos personales | Exportar CSV |
| --- | --- | --- | --- |
| Administración y Coordinación | Sí | Sí | Sí |
| Recepción y Gestión | Sí | Con permiso de crear o editar | |
| Auxiliar y Técnico | Sí | | |

## Programación externa de respaldos

Configura un trabajo diario de Cloud Scheduler en la zona `America/Santiago` para enviar un POST a `/api/backups/scheduled-check`. Utiliza una cuenta de servicio dedicada con autenticación OIDC. Define `BACKUP_SCHEDULER_AUDIENCE` con la audiencia configurada en el trabajo y `BACKUP_SCHEDULER_SUBJECT` con el identificador único de la cuenta de servicio. La ruta utiliza el intervalo guardado en la aplicación y reemplaza la ejecución automática del navegador cuando ambas variables están presentes. Comprueba la primera ejecución en Salud del sistema.

Las sesiones de producción requieren HTTPS. Configura una política TTL para el campo `expiresAt` de la colección `_revoked_sessions` para retirar los registros de cierre vencidos.
