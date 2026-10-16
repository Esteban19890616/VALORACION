# Manual de usuario — SER INTEGRAL 360 v1.0.0

Para las funciones exclusivas del administrador (usuarios, respaldos, bitácora, servidor) vea `MANUAL_ADMINISTRADOR.md`.

## Ingreso y Mi cuenta
* Ingrese con su correo y contraseña. Si el administrador le asignó una **contraseña temporal**, el sistema lo lleva a **Mi cuenta** para cambiarla antes de continuar.
* La sesión se cierra sola tras **30 minutos sin actividad** (y, en el servidor, a las 12 horas). Lo que estaba diligenciando queda como borrador.
* **Mi cuenta** (botón con su nombre) muestra sus datos, el último ingreso, el cambio de contraseña y el cierre de sesión.

## Flujo de trabajo
Empresa → Diagnóstico → Lista de chequeo → Hallazgos → Priorización → Plan de trabajo → Seguimiento → Informe PDF

## 1. Empresa (administrador)
1. **Empresas → Registrar empresa.** Diligencie la identificación (el sistema calcula el dígito de verificación del NIT y bloquea duplicados), la actividad y el riesgo, y el número de trabajadores.
2. Diligencie el **Perfil de aplicabilidad normativa**. Cada condición puede ser Sí, No o Sin determinar. "Sin determinar" nunca excluye requisitos: los deja "por confirmar".
3. Asigne el **asesor responsable** y las **horas contratadas por mes**.

## 2. Diagnóstico (asesor o administrador)
1. **Diagnósticos → Nuevo diagnóstico.** Elija la empresa, el alcance, los campos y las sedes. El diagnóstico queda ligado a la versión vigente del catálogo.
2. **Lista de chequeo.** Navegue por campo y categoría. Cada respuesta se guarda sola.
   * **Cumple, Parcial o No cumple.** Para las brechas registre la probabilidad (con ella se calcula el nivel de riesgo), la recomendación, el responsable y la fecha de verificación.
   * **No aplica.** Exige justificación y la valida el revisor. Mientras no esté validado, no se excluye del cálculo.
   * **Pendiente.** No cuenta como cumplimiento y reduce la cobertura.
   * Adjunte evidencias de hasta 5 MB (PDF, JPG, PNG, DOCX o XLSX).
3. **Resultados.** Muestra el porcentaje por campo con su cobertura, las alertas críticas (siempre visibles), la calificación según la Resolución 0312 de 2019 y la madurez y conclusiones por campo.
4. **No aplican por perfil.** Requisitos excluidos y su motivo. Puede incluirlos manualmente indicando la razón.
5. **Revisión.** El asesor envía el diagnóstico a revisión. No puede hacerlo si hay requisitos críticos sin verificar.

## 3. Revisión y aprobación (administrador)
* Valide o rechace cada "No aplica".
* **Aprobar.** Exige que no haya críticos pendientes ni "No aplica" sin decidir. Congela los resultados y registra los hallazgos.
* **Devolver.** Exige un comentario; el asesor podrá editar de nuevo.
* **Cerrar.** Deja el diagnóstico en solo lectura.
* **Nueva revisión.** Toma el catálogo vigente y conserva las respuestas de los requisitos que no cambiaron.

## 4. Planes y horas
1. **Planes y horas → empresa.** Defina las horas por mes, la capacidad semanal, el mes de inicio y el horizonte.
2. **Proponer con el asistente.** Sugiere la distribución por campo y explica por qué. Puede ajustarla, pero debe sumar exactamente 100 % para aprobar el plan.
3. **Generar actividades.** Crea una actividad por hallazgo, con su prioridad y sus horas estimadas, y la programa sin usar semanas pasadas.
   * Las de **intervención inmediata** van al primer mes aunque su campo tenga pocas horas.
   * El sistema alerta cuando se supera la capacidad.
4. **Aprobar plan.** Si luego cambia la configuración, el plan vuelve a borrador.
5. **Seguimiento.** En cada actividad:
   * Registre horas con fecha y descripción. No se aceptan fechas futuras; un registro se puede anular, pero no borrar.
   * Marque la actividad como ejecutada cuando tenga horas registradas.
   * Un administrador la verifica, con al menos una evidencia. Si todas las actividades de un hallazgo quedan verificadas, el hallazgo se cierra.
6. **Vistas semanal, mensual y anual.** Todas se calculan sobre la misma programación y no duplican horas. Distinguen horas asignadas, programadas, ejecutadas y facturables.

## 5. Catálogo normativo (administrador)
* **Crear borrador de nueva versión.** Edite requisitos (norma, artículo, enlace, estado de verificación, aplicabilidad, peso y severidad), agregue nuevos o retire existentes.
* **Comparar y publicar.** Los diagnósticos anteriores no cambian y muestran el análisis de impacto.
* **Parámetros de calificación.** Puntaje de "Parcial" y rangos visuales internos.

## 6. Informes PDF
* **Menú Informes PDF.** Elija el tipo, la empresa y los parámetros (diagnóstico, mes, período o par de diagnósticos). El informe se abre en vista previa y se puede descargar.
* **Tipos:** diagnóstico integral, jurídico, SST, calidad, ambiental, plan mensual, plan anual, seguimiento de horas, informe de avance y comparativo entre evaluaciones.
* **Accesos directos:** botones "Informe PDF" en la pestaña Resultados del diagnóstico y botones "PDF" en el plan de trabajo.
* **Informes preliminares.** Si el diagnóstico o el plan no están aprobados, el informe sale con marca de agua de borrador.
* **Registro.** Cada informe queda registrado con código, versión, autor y huella. "Regenerar" crea una versión nueva.
* **Verificar un PDF.** Compruebe si un archivo recibido es idéntico a uno generado por el sistema.
* **Panel por empresa.** En el expediente, la pestaña **Indicadores** muestra cumplimiento, evolución, comparación con el diagnóstico anterior, hallazgos por severidad, horas, vencimientos y recomendaciones.

## 7. Respaldo
**Respaldo y datos → Descargar respaldo**, al menos semanalmente. El archivo incluye diagnósticos, evidencias (con sus archivos), planes y horas. Guárdelo fuera del equipo. En el servidor, además, hay respaldo diario automático.
