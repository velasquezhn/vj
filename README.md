# Villas Julie — API y bot oficial de WhatsApp

Backend Node.js para reservas, panel administrativo y mensajería mediante **WhatsApp Business Cloud API de Meta**. No usa sesiones QR ni proveedores no oficiales.

## Requisitos e instalación

- Node.js 20 o 22 (recomendado: 22 LTS), pnpm 10+ mediante Corepack y SQLite.
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
- `WHATSAPP_API_VERSION`: versión Graph API fijada (`v23.0` por defecto).
- `WHATSAPP_ACCESS_TOKEN`: token permanente de system user.
- `WHATSAPP_PHONE_NUMBER_ID`: ID del número, no el número visible.
- `WHATSAPP_VERIFY_TOKEN`: valor aleatorio elegido por el propietario.
- `META_APP_SECRET`: secreto para validar `X-Hub-Signature-256`.

## Configuración de Meta

1. Cree o seleccione una app Business en Meta for Developers y agregue WhatsApp.
2. Registre el número y cree un token permanente de system user con los permisos necesarios.
3. Publique el servicio detrás de HTTPS.
4. Configure `https://SU-DOMINIO/webhooks/whatsapp` usando `WHATSAPP_VERIFY_TOKEN`.
5. Suscriba el campo `messages` de la cuenta de WhatsApp Business.
6. Configure `META_APP_SECRET`; los POST sin firma válida reciben `401`.
7. Apruebe plantillas para conversaciones iniciadas por la empresa fuera de la ventana permitida.

El webhook procesa texto, botones, listas, imágenes, documentos y estados. Los IDs repetidos se descartan durante 24 horas por instancia. Los errores Meta `429` y `5xx` se marcan como reintentables.

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
