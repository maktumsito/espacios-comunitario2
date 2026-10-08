# Optimización de Administración — 8 de octubre de 2026

El panel pasó de **3.171 a 2.970 líneas**: **201 líneas menos (6,34 %)**. La medición incluye las líneas del archivo y excluye las pruebas añadidas.

## Cambios

- Se eliminaron estados, importaciones, un catálogo de iconos y manejadores antiguos sin consumidores. El catálogo vigente de actividades/préstamos conserva su guardado en ambos catálogos.
- Las 11 operaciones de escritura comparten el inicio del guardado, el bloqueo de solicitudes simultáneas, el mensaje de error y la liberación del bloqueo.
- Se conservaron las validaciones síncronas y la liberación inmediata del bloqueo cuando una validación falla. Los formularios permanecen abiertos y conservan sus datos si una escritura es rechazada.
- Los formularios de espacios, actividades y equipamiento comparten botones y avisos de validación. Espacios y actividades comparten el selector de colores, con la misma estructura y apariencia.
- Se conservaron las interfaces públicas, permisos, confirmaciones, cuentas protegidas, ordenamiento y alternativas de guardado existentes.

## Verificación

- Comprobación de tipos y compilación de cliente y servidor: aprobadas.
- Suite completa: **366 pruebas aprobadas, 27 omitidas**, sin fallas. Se ejecutó con un trabajador y 30 segundos por prueba, como en la validación anterior; la configuración del proyecto no cambió.
- Se añadieron **14 pruebas** de validación, rechazo, conservación del borrador, reintento, bloqueo de duplicados, stock, eliminación, ordenamiento, permisos y guardado alternativo de equipamiento.
- Se comprobó que la lógica interna de las 11 operaciones conserva las mismas instrucciones que antes del cambio.
- Navegador Edge a 390 y 1.200 píxeles: **22 capturas antes/después, cero píxeles diferentes**. Se comprobaron pantallas, formularios, selección de colores, errores de validación y cancelación; no se registraron errores de JavaScript.
- Las pruebas de navegador bloquearon todas las conexiones externas. No se ejecutaron escrituras en producción ni un despliegue.

## Tamaño generado

| Medición | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| JavaScript total | 3.578.464 bytes | 3.574.721 bytes | 3.743 bytes |
| JavaScript comprimido con gzip | 985.539 bytes | 985.508 bytes | 31 bytes |
| CSS | 146.968 bytes | 146.968 bytes | 0 bytes |

El beneficio principal es reducir duplicaciones y facilitar el mantenimiento. Los informes completos, la referencia anterior y las capturas están en `work/admin-reduction`, excluido de Git.
