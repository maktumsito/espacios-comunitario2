# Reducción de código — 8 de octubre de 2026

El código de la aplicación se redujo en **1.502 líneas netas**, conservando el formulario actual de cinco pasos, la vista continua y las interfaces existentes.

## Cambios

- Se retiraron tres componentes antiguos sin consumidores: ReservationStep1DateTime, ReservationStep2Applicant y ReservationStep3Details (1.354 líneas).
- Se eliminaron importaciones, bindings, un estado y declaraciones sin uso en la aplicación principal y el formulario de reservas.
- Se retiraron dos declaraciones duplicadas de carga de vistas; las vistas de mantenimiento y solicitantes continúan disponibles desde Administración.
- La navegación entre pasos verifica los mismos requisitos en orden y muestra el primer error. Conserva el paso actual al fallar y desplaza el formulario hacia arriba al avanzar.
- Se añadieron 15 pruebas de regresión para saltos entre pasos, validaciones, desplazamiento y conservación del borrador al cambiar de modo.

## Validación

- Comprobación de tipos y compilación de cliente y servidor: aprobadas.
- Suite completa: **352 pruebas aprobadas, 27 omitidas**, sin fallas. Las omitidas requieren el emulador o ya estaban deshabilitadas.
- Casos existentes de reservas, recurrencias, segundo espacio, conflictos, guardados, recuperación, documentos y navegación por teclado: incluidos en la suite.
- Navegador Edge con conexiones externas bloqueadas: los cinco pasos y la vista continua se comprobaron a 390 y 1.200 píxeles de ancho.
- **12 capturas comparadas antes/después: cero píxeles diferentes**, sin errores de JavaScript registrados. El estado del botón de guardar y el destino del foco tras Tab se conservaron en el entorno aislado.

La ejecución inicial de la suite, antes de los cambios, tuvo cinco fallas por agotamiento del tiempo de importación y sus efectos sobre las pruebas siguientes. La validación final se ejecutó con un trabajador y un límite de 30 segundos por prueba; las aserciones y la configuración del proyecto se conservaron.

## Tamaño generado

| Medición | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| JavaScript total | 3.579.121 bytes | 3.578.464 bytes | 657 bytes |
| JavaScript comprimido con gzip | 985.690 bytes | 985.539 bytes | 151 bytes |
| CSS | 147.023 bytes | 146.968 bytes | 55 bytes |

El beneficio principal es la reducción del código fuente y de las duplicaciones. La compilación ya descartaba gran parte del código sin uso, por lo que la reducción de descarga es pequeña.

Los informes completos y las capturas permanecen en la carpeta local `work/code-reduction`, excluida de Git. No se realizaron escrituras en servicios de producción ni un despliegue.
