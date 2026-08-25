# Auditoría técnica — 2026-08-25

## Hallazgos críticos corregidos

- Credenciales, SQLite, backups y comprobante versionados: retirados del árbol e ignorados; se exige rotación.
- Baileys vulnerable, sesión QR y reconexión infinita: eliminados y sustituidos por Cloud API oficial.
- Proceso principal sin HTTP/health: unificado con Express y `PORT` configurable.
- Webhook inexistente: añadido challenge, firma HMAC SHA-256, ACK temprano, estados y deduplicación.
- Puertos, CORS y DB rígidos: centralizados en `config/env.js`.
- Cola Redis rígida y deshabilitada: eliminada junto con sus rutas.
- Instalación sin lockfile: Node, gestor y `pnpm-lock.yaml` fijados.
- Tests con conexiones externas y rutas inexistentes: sustituidos por pruebas aisladas de Cloud API.
- Despliegue no reproducible: Dockerfile no-root, migración y documentación de volúmenes/health.
- Esquema incompleto en instalaciones limpias: migración idempotente con Admins, estados, tipos, índices y eventos WhatsApp.
- Datos iniciales manuales: seed idempotente de 13 unidades y actividades.
- Backups SQLite inconsistentes con WAL y restore online peligroso: online-backup consistente y restore exclusivamente offline.
- Comprobantes en ruta inexistente y sin límites: directorio configurable, tipos permitidos y límite de 5 MiB.
- Logs de SQL, parámetros y filas completas: eliminados; se conservan metadatos operativos mínimos.
- Alternativas con JWT y passwords hardcoded: eliminadas.

## Riesgos y acciones externas

- SQLite limita el servicio a una réplica; para alta disponibilidad use PostgreSQL y deduplicación compartida.
- El historial todavía contiene los datos retirados. Rote secretos y limpie el historial coordinadamente.
- El propietario debe crear la app Business, número, system user/token, plantillas, HTTPS y suscripción del webhook.

## Recuperación y eliminaciones

El original está en `recovery/pre-cloud-api`. Se eliminaron el cliente Baileys, servicios de cola, handlers de grupo, adaptadores `@bot-whatsapp`, servidores alternativos inseguros, dashboards duplicados, datos operativos versionados, migraciones manuales reemplazadas y scripts/pruebas de depuración inválidos. La administración permanece en la API autenticada.

Para obtener la lista exacta de archivos de esta entrega:

```bash
git diff --name-status recovery/pre-cloud-api
```

Los comandos operativos conservados están declarados en `package.json`; cualquier archivo eliminado puede recuperarse selectivamente desde la rama de recuperación.
