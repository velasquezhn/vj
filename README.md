# Villas Julie — API y bot oficial de WhatsApp

Backend Node.js para reservas, panel administrativo y mensajería mediante **WhatsApp Business Cloud API de Meta**. No usa sesiones QR ni proveedores no oficiales.

## Requisitos e instalación

- Node.js 20 o 22 (recomendado: 22 LTS), pnpm 10+ mediante Corepack y SQLite. La imagen de producción usa Node.js 22 sobre Debian 13 para mantener compatibilidad con el módulo nativo de SQLite.
- Un volumen persistente para una sola réplica.
- Aplicación Meta Business, número registrado y URL HTTPS pública.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm build
pnpm start
```

El servidor escucha `0.0.0.0:$PORT`. Compruebe `GET http://localhost:4000/health`.
En Docker, el arranque ejecuta automáticamente la migración y la carga idempotente de las 13 cabañas antes de iniciar el servidor.

Cree el primer administrador después de migrar, pasando las credenciales solo por el entorno:

```bash
ADMIN_DEFAULT_USERNAME=admin ADMIN_DEFAULT_PASSWORD='una-clave-larga' pnpm admin:create
```

## Variables de entorno

Copie `.env.example`; nunca versione `.env` ni credenciales.

- `PORT`: puerto HTTP asignado por la plataforma.
- `DB_PATH`: ruta del SQLite persistente.
- `CORS_ORIGIN`: orígenes permitidos separados por coma.
- `JWT_SECRET`: secreto aleatorio de al menos 32 bytes.
- `ADMIN_DEFAULT_USERNAME` y `ADMIN_DEFAULT_PASSWORD`: solo para `pnpm admin:create`; no se crean usuarios predeterminados.
- `WHATSAPP_ENABLED`: use `false` únicamente durante el despliegue inicial o mantenimiento. Permite operar el panel sin credenciales de Meta; el webhook responde `503 WHATSAPP_DISABLED`. Cámbielo a `true` antes de habilitar mensajería real.
- `WHATSAPP_API_VERSION`: versión Graph API fijada (`v26.0` por defecto).
- `WHATSAPP_ACCESS_TOKEN`: token permanente de system user.
- `WHATSAPP_PHONE_NUMBER_ID`: ID del número, no el número visible.
- `WHATSAPP_VERIFY_TOKEN`: valor aleatorio elegido por el propietario.
- `META_APP_SECRET`: secreto para validar `X-Hub-Signature-256`.
- `WHATSAPP_ADMIN_NUMBERS`: respaldo opcional para números autorizados, separados por coma y con código de país. La lista normal se administra desde **Configuración > Administradores de WhatsApp** en el panel.
- `PUBLIC_CONTACT_NUMBERS`: números públicos de atención separados por coma y con código de país. Si se omite, el menú invita al huésped a continuar en el mismo chat; nunca muestra números inventados.
- `PUBLIC_BASE_URL`: URL HTTPS pública del backend, usada para abrir comprobantes desde los avisos administrativos.
- `WHATSAPP_CABIN_GALLERY_LIMIT`: máximo de fotografías enviadas al mostrar una cabaña (1 a 5; recomendado y predeterminado: 4).
- `PAYMENT_WINDOW_HOURS`: plazo informado y reservado para que el huésped envíe el comprobante después de la autorización (24 por defecto).
- `NOTIFICATION_QUEUE_ENABLED`: activa la cola persistente de entrega (recomendado: `true`).
- `NOTIFICATION_QUEUE_INTERVAL_MS`: frecuencia de revisión de mensajes pendientes (60 000 ms por defecto; mínimo 15 000).
- `OPENWEATHER_API_KEY`: opcional; habilita el pronóstico del menú sin guardar la clave en el código.

## Configuración de Meta

1. Cree o seleccione una app Business en Meta for Developers y agregue WhatsApp.
2. Registre el número y cree un token permanente de system user con los permisos necesarios.
3. Publique el servicio detrás de HTTPS.
4. Configure `https://SU-DOMINIO/webhooks/whatsapp` usando `WHATSAPP_VERIFY_TOKEN`.

La navegación, los comandos globales y el recorrido de prueba completo están documentados en [docs/WHATSAPP_FLOWS.md](docs/WHATSAPP_FLOWS.md).
5. Suscriba el campo `messages` de la cuenta de WhatsApp Business.
6. Configure `META_APP_SECRET`; los POST sin firma válida reciben `401`.
7. Apruebe plantillas para conversaciones iniciadas por la empresa fuera de la ventana permitida.

El webhook procesa texto, botones, listas, imágenes, documentos y estados. Los IDs repetidos se descartan durante 24 horas por instancia. Los errores Meta `429` y `5xx` se marcan como reintentables.

### Experiencia interactiva

El menú principal, los alojamientos y las experiencias usan listas interactivas oficiales de Meta. La confirmación de fechas, la aceptación de condiciones y las acciones posteriores usan botones de respuesta. Los identificadores de botones se convierten a comandos internos estables, por lo que las respuestas numéricas escritas siguen siendo compatibles. Si Meta no acepta temporalmente un mensaje interactivo, el bot envía automáticamente una alternativa en texto.

Los mensajes interactivos solo pueden enviarse dentro de la ventana de atención iniciada por el huésped. Para iniciar conversaciones fuera de esa ventana se debe crear y aprobar una plantilla en WhatsApp Manager; las plantillas no se usan para navegar los menús.

Las galerías de Tortuga, Delfín y Tiburón se administran en **Tipos de Menú**. Use una URL pública HTTPS por línea en formato JPG, PNG o WEBP. Como la API ordinaria de Meta acepta una imagen por mensaje, el backend compone hasta cuatro fotos en una sola imagen y la envía con el resumen. Si no puede generar la composición, utiliza la primera foto y nunca pierde la información textual.

### Aprobación de reservas

La confirmación ya no depende de grupos ni de Baileys. Usa dos controles administrativos: al aceptar las condiciones se crea una solicitud `pendiente_autorizacion` con código `VJ-000001`; el administrador autoriza el pago y el sistema cambia a `esperando_pago`. Solamente entonces acepta una foto o PDF. Al recibirlo cambia a `pendiente_verificacion`, vuelve a avisar al administrador y requiere la confirmación final.

Reglas operativas vigentes:

- Anticipo: 50 %.
- Plazo para pagar después de la autorización: 24 horas.
- Entrada: 2:00 p. m.; salida: 11:00 a. m.
- Pagos y anticipos no reembolsables.
- Cambios de fecha o alojamiento: requieren atención privada de un administrador y dependen de disponibilidad.
- Solicitudes de asistencia recibidas 24/7; horario de oficina de 8:00 a. m. a 4:00 p. m.
- Conservación prevista de datos operativos: 2 años.

La base de datos impide de forma atómica crear dos reservas activas superpuestas para la misma cabaña. Al solicitar modificación, asistencia o cancelación, los administradores autorizados reciben un aviso individual con enlace al chat privado del huésped.

Antes de autorizar el primer pago, configure **Configuración > Pagos y anticipo** en el panel. El porcentaje predeterminado es 50 %. Registre una cuenta por línea con banco, tipo, número y titular. El sistema bloquea la autorización si no hay cuentas, calcula el anticipo y el saldo, y envía estas instrucciones al huésped sin registrar datos bancarios en el código ni en los logs.

- En el panel: abrir **Reservas**. Primero pulsar **Autorizar pago**; cuando llegue el archivo, abrir el comprobante y pulsar **Confirmar** o **Rechazar**.
- En WhatsApp: cada número activo registrado en **Configuración > Administradores de WhatsApp** recibe primero **Autorizar pago / Rechazar** y, después del comprobante, **Confirmar / Rechazar**. Como respaldo admite `/aprobar VJ-000001`, `/rechazar VJ-000001 motivo` y `/reserva VJ-000001`; `/aprobar` ejecuta solamente la etapa que corresponda al estado actual.

Los números se escriben con código de país y solo dígitos (por ejemplo, `504XXXXXXXX`). Pueden editarse, desactivarse o eliminarse sin modificar Railway. Cada administrador debe enviar `/admin` al número de Villas Julie antes de una demostración; `/cliente` permite volver a probar el flujo como huésped.

Al agregar un administrador, el sistema intenta enviarle una confirmación y reenvía hasta cinco solicitudes pendientes de autorización o de verificación. El botón **Enviar prueba** permite repetirlo. Si Meta lo bloquea, el panel conserva el número y muestra la instrucción de enviar `/admin` desde ese teléfono para abrir la ventana de 24 horas.

La aprobación vuelve a comprobar disponibilidad, registra administrador y fecha de revisión, actualiza el estado y notifica al huésped. Si Meta o la red fallan temporalmente, el aviso queda en `notification_status=queued` y se reintenta desde una cola persistente aun después de reiniciar el servidor. El superadministrador puede revisar y reintentar entregas desde **Mensajes pendientes**; después de agotar los intentos se marca como fallida para atención manual.

El **Dashboard** muestra tareas operativas pendientes y métricas calculadas con reservas confirmadas. **Reportes** permite elegir un período, revisar ocupación por cabaña y descargar un Excel de reservas. El “valor confirmado” representa el valor contractual de las reservas, no un registro contable de dinero efectivamente recibido.

## Base de datos y Docker

```bash
DB_PATH=/var/lib/vj/bot_database.sqlite pnpm db:migrate
docker build -t villas-julie-api .
docker run --rm -p 4000:4000 --env-file .env \
  -v vj-data:/app/data -v vj-receipts:/app/public/comprobantes villas-julie-api
```

En Docker autogestionado, persista `/app/data`, `/app/backups` y `/app/public/comprobantes`. Use una sola réplica con SQLite; para alta disponibilidad migre a PostgreSQL y deduplicación compartida.

### Despliegue económico recomendado: Railway

El repositorio incluye `railway.json`: usa el `Dockerfile`, comprueba `/health`, reinicia ante fallos y fija una sola réplica, requisito de SQLite.

1. Cree un servicio desde `velasquezhn/vj` y genere el dominio HTTPS gratuito de Railway.
2. Adjunte **un volumen** en `/app/storage`.
3. Configure las variables de `.env.example` y use estas rutas persistentes:

```dotenv
NODE_ENV=production
RAILWAY_RUN_UID=0
DB_PATH=/app/storage/data/bot_database.sqlite
RECEIPTS_DIR=/app/storage/comprobantes
UPLOAD_DIR=/app/storage/uploads
BACKUP_DIR=/app/storage/backups
LOG_DIR=/app/storage/logs
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=7
BACKUP_VERIFY=true
```

4. Defina `CORS_ORIGIN` con la URL exacta del frontend de Cloudflare Pages, sin `/` final.
5. Genere el dominio público y compruebe `https://DOMINIO/health` y `https://DOMINIO/ready`.
6. Cree el administrador ejecutando `pnpm admin:create` en el servicio con las variables temporales `ADMIN_DEFAULT_USERNAME`, `ADMIN_DEFAULT_PASSWORD` y, opcionalmente, `ADMIN_DEFAULT_EMAIL`; elimínelas después.

`RAILWAY_RUN_UID=0` es necesario porque Railway monta sus volúmenes con propietario `root`; no lo use fuera de Railway. No ejecute más de una réplica mientras use SQLite. Railway monta el volumen solo durante la ejecución; por eso la migración permanece en el comando de inicio del contenedor.

Backups consistentes (incluyen WAL):

```bash
pnpm backup:create
# Restauración: primero detenga todas las instancias
pnpm backup:restore -- backup_FECHA.sqlite
```

La restauración por HTTP está deshabilitada deliberadamente.

## Verificación y operación

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm test
pnpm build
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:4000/ready
```

En Meta complete “Verify and save”, envíe `hola` desde un número permitido y pruebe respuesta, imagen y cambio de estado administrativo. Los logs no deben contener tokens ni cuerpos completos.

Las rutas administrativas usan JWT. Confirme o cancele con `PUT /admin/reservations/:id`; los comandos de grupo fueron eliminados. Rote todos los secretos que hayan estado en el historial antes de publicar el repositorio saneado.
