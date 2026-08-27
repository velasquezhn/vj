# Flujos de WhatsApp

El bot utiliza exclusivamente WhatsApp Business Cloud API de Meta. Las respuestas interactivas usan listas o un máximo de tres botones; si Meta rechaza el formato interactivo, el sistema envía una alternativa de texto equivalente.

## Comandos disponibles en cualquier momento

- `menú`, `menu principal` o `inicio`: vuelve al menú principal y cierra el paso conversacional actual.
- `cancelar` o `salir`: cancela el paso conversacional actual y vuelve al menú principal. No cancela una reserva ya registrada.
- `volver`, `regresar` o `atrás`: vuelve al menú anterior. Dentro de un borrador de reserva reinicia la captura de fechas para evitar conservar datos parciales incoherentes.

## Menú principal

1. Alojamientos
2. Reservar ahora
3. Experiencias
4. Contacto
5. Clima
6. Preguntas frecuentes
7. Compartir experiencia
8. Mi reserva
9. Beneficios

Los identificadores de botones y listas se convierten a estas mismas opciones numéricas, por lo que el recorrido es equivalente con botones o texto.

## Reserva y confirmación

1. Escribe `hola` o `menú` y selecciona **Reservar ahora**.
2. Envía fechas futuras, por ejemplo `15/09/2026 al 18/09/2026`.
3. Confirma las fechas con el botón **Sí, confirmar**.
4. Escribe el nombre completo y la cantidad de huéspedes.
5. Revisa el resumen, alojamiento asignado y total; selecciona **Acepto**.
6. El sistema registra la solicitud como `pendiente_autorizacion` y avisa a los administradores. El huésped todavía no puede enviar un comprobante.
7. Un administrador autorizado pulsa **Autorizar pago**. El huésped recibe el anticipo, las cuentas configuradas y la habilitación para adjuntar una foto o PDF.
8. El huésped envía el comprobante. La reserva pasa a `pendiente_verificacion` y los administradores reciben la segunda revisión.
9. Un administrador pulsa **Confirmar** o **Rechazar**. El huésped recibe la decisión final por el mismo chat.

## Prueba de regresión manual

Use un número de prueba autorizado por Meta y ejecute cada caso con un identificador de mensaje nuevo:

1. Abra las nueve opciones principales y todos sus botones de regreso.
2. En alojamientos, pruebe `texto`, `0`, el primer alojamiento y los botones **Ver alojamientos**, **Reservar** y **Menú principal**.
3. En reserva, pruebe fechas inválidas, fechas válidas, `no`, `sí`, nombre inválido, nombre válido, cantidades `0`, `texto`, `11` y una cantidad válida.
4. En cada paso escriba `volver`, `cancelar` y `menú`.
5. Envíe dos mensajes consecutivos desde el mismo número y confirme que las respuestas respetan el orden.
6. Reenvíe el mismo webhook y confirme que se procesa una sola vez.
7. Antes de la autorización, envíe una foto: debe rechazarse como comprobante. Después de autorizar, envíe JPG, PNG y PDF válidos y un archivo inválido.
8. Simule HTTP 429 y 5xx desde Meta: se conservan los reintentos técnicos. Simule HTTP 400: no debe reintentarse.

## Verificación automatizada

```bash
pnpm run check
pnpm test
```

Las pruebas cubren firma del webhook, deduplicación, orden por remitente, fallos temporales de Meta, límites de botones/listas/texto, navegación, ausencia de temporizadores artificiales, fechas, resumen de huéspedes y rechazo de condiciones.
