# Lista de salida a producción

El ambiente público actual es **QA** aunque ejecute el runtime de Node.js en modo `production`. No debe reutilizarse su base de datos para clientes reales.

## 1. Infraestructura separada

- [x] Conservar el ambiente Railway existente como `qa`, desplegado desde `main`.
- [x] Crear un ambiente Railway `production` separado, con almacenamiento aislado.
- [x] Definir `APP_ENV=production` y mantener una sola réplica mientras se use SQLite.
- [x] Configurar `/ready` como healthcheck y confirmar respuesta `ready`.
- [ ] Desplegar producción únicamente desde la rama `production`; promover a esa rama sólo un commit validado primero en QA.
- [ ] Activar `REQUIRE_EMPTY_PRODUCTION_DATA=true`; el primer `/ready` exitoso deja una marca persistente sólo si no encuentra huéspedes, reservas ni comprobantes de QA.

## 2. Datos y acceso

- [ ] Ejecutar migraciones y semillas sobre la base vacía; no copiar reservas, clientes ni comprobantes de QA.
- [ ] Sustituir todas las cuentas marcadas `PRUEBA / NO PAGAR` por información confirmada por el propietario.
- [ ] Crear una cuenta individual para cada operador y cambiar las contraseñas de demostración.
- [ ] Eliminar `ADMIN_DEFAULT_USERNAME`, `ADMIN_DEFAULT_PASSWORD`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_FULL_NAME` y `ADMIN_DEFAULT_ROLE` después de crear las cuentas.
- [ ] Generar un `JWT_SECRET` exclusivo de producción de al menos 32 caracteres.

## 3. Meta y WhatsApp

- [ ] Mantener `WHATSAPP_ENABLED=false` en producción hasta el corte final; QA continúa atendiendo el webhook durante las pruebas.
- [ ] Usar el número definitivo y un token permanente de usuario del sistema.
- [ ] Confirmar aplicación activa, negocio verificado y suscripción del webhook al campo `messages`.
- [ ] Configurar `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` y `META_APP_SECRET` únicamente en Railway.
- [ ] Aprobar una plantilla Utility para avisos administrativos fuera de la ventana de 24 horas.
- [ ] Ejecutar una reserva de humo con números de prueba y cancelarla antes de abrir al público.

## 4. Continuidad y monitoreo

- [ ] Configurar una copia externa con Dropbox o almacenamiento equivalente.
- [ ] Descargar una copia, verificarla y ensayar una restauración fuera de línea.
- [ ] Crear un monitor HTTPS para `/ready` y alertas por fallo de despliegue y backup.
- [ ] Revisar diariamente Mensajes pendientes, reservas por autorizar y comprobantes por verificar.

## 5. Dependencias externas

- [ ] Contratar o autorizar un proveedor meteorológico apto para uso comercial y desactivar el respaldo gratuito de QA.
- [ ] Confirmar CORS con la URL definitiva del panel.
- [ ] Confirmar políticas de privacidad, términos, contacto y retención de datos por dos años.

## 6. Aprobación

- [ ] `pnpm run validate` termina correctamente.
- [ ] La imagen Docker se construye en CI.
- [ ] GitHub Actions y Railway finalizan correctamente para el mismo commit.
- [ ] `/health` informa `environment=production` y `/ready` informa `database=ok`.
- [ ] Etiquetar el commit aprobado como `v1.0.0` y registrar fecha, responsable y evidencia.

## Promoción de una versión

1. Integrar el cambio en `main` y esperar que CI y el despliegue de QA terminen correctamente.
2. Ejecutar las pruebas de humo en QA, especialmente reserva, autorización administrativa, pago y confirmación.
3. Avanzar la rama `production` al mismo commit de `main` mediante avance rápido, sin reescribir historial.
4. Esperar CI y Railway; comprobar `/health` y `/ready` en producción.
5. Etiquetar la versión aprobada. El lanzamiento inicial usa `v1.0.0`; las candidatas previas pueden usar `v1.0.0-rc.N`.
