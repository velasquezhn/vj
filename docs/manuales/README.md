# Manuales oficiales de Villas Julie

Documentación elaborada y actualizada a partir del backend, el panel administrativo, los flujos de WhatsApp y las verificaciones de producción realizadas al 27 de agosto de 2026.

La edición vigente incorpora roles administrativos protegidos, auditoría, reportes y exportación, cola persistente de mensajes, copias de seguridad descargables y las reglas comerciales confirmadas. Las cuentas bancarias incluidas en la demostración siguen marcadas como **PRUEBA / NO PAGAR** y deben reemplazarse antes de aceptar pagos reales.

- `01_Manual_General_Villas_Julie.docx`: visión general, arquitectura operativa, flujo de reservas, módulos, reglas, preguntas frecuentes y capturas requeridas.
- `02_Manual_Administrador_Panel_Villas_Julie.docx`: operación diaria del panel.
- `03_Manual_Superadministrador_Villas_Julie.docx`: responsabilidades superiores y limitaciones actuales del control por roles.
- `04_Manual_Administrador_WhatsApp_Villas_Julie.docx`: autorización de pago y confirmación por WhatsApp.
- `05_Manual_Huesped_WhatsApp_Villas_Julie.docx`: guía de autoservicio para el huésped.
- `06_Matriz_Permisos_Guias_Auditoria_Villas_Julie.docx`: matriz de permisos, guías rápidas, inventario funcional y hallazgos.
- `07_Manual_Maestro_QA_UAT_Villas_Julie.docx`: plan ejecutable con 277 pruebas consecutivas, inventario de cobertura, permisos positivos y negativos, registro de bugs, regresión y decisión final de producción.

El Manual Maestro se regenera de forma reproducible con `python scripts/generate_master_qa_manual.py` usando el runtime de documentos del workspace.

Los marcadores `[CAPTURA REQUERIDA: ...]` indican imágenes que deben incorporarse durante la edición final usando datos anonimizados. Los aspectos comerciales o externos que el código no permite confirmar están marcados como `Pendiente de verificar`.
