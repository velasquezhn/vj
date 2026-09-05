# Reservas con WhatsApp Flow y CalendarPicker

La reserva puede iniciar con un **WhatsApp Flow** nativo: el huésped permanece en WhatsApp y selecciona cabaña, rango de fechas (CalendarPicker), huéspedes y nombre. El chat normal continúa después para aceptar condiciones, esperar autorización del administrador, recibir instrucciones del 50 %, enviar el comprobante y recibir la confirmación.

## Por qué usamos un flujo híbrido

WhatsApp no ofrece un calendario en un mensaje normal. Flow sí permite un formulario interactivo, pero la disponibilidad en tiempo real requiere un endpoint de intercambio de datos de Flow. Por eso el sistema mantiene el flujo conversacional como respaldo y vuelve a verificar disponibilidad antes de crear la reserva.

## Activación en Meta

1. En WhatsApp Manager crea un Flow del tipo formulario y agrega un `CalendarPicker` para entrada/salida, selector de cabaña, huéspedes y nombre.
2. Usa estos nombres de salida para que el backend los reconozca: `cabin`, `check_in`, `check_out`, `guests`, `name` (fechas ISO `YYYY-MM-DD`).
3. Publica el Flow y copia su **Flow ID**.
4. En Railway agrega `WHATSAPP_RESERVATION_FLOW_ID=<FLOW_ID>` en el entorno QA. No copies tokens al repositorio.
5. Prueba desde el menú «Reservar». Si Meta rechaza el Flow, el bot envía automáticamente el flujo de fechas por texto.
6. Para bloquear días ocupados dentro del calendario, configura el endpoint HTTPS de datos de Flow y devuelve `unavailable-dates`; aun así, el backend verifica disponibilidad al confirmar para evitar carreras.

## Verificación

- Abrir WhatsApp y escribir `hola`.
- Elegir `Reservar` y completar el formulario sin salir de WhatsApp.
- Aceptar las condiciones; debe quedar en `pendiente_autorizacion`.
- El administrador autoriza; el huésped recibe las instrucciones de pago.
- Sólo después de la autorización se acepta imagen/PDF del comprobante.
- El administrador verifica y el huésped recibe la confirmación.

El ID del Flow es configuración externa de Meta; hasta introducirlo, el comportamiento existente permanece intacto.
