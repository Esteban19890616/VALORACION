/** Respaldo, restauración, datos de demostración y estado del almacenamiento. */
import { esc, fecha, tamano } from '../core/utils.js';
import { icono, avisar, confirmar, descargar, modal } from '../core/ui.js';
import { datos } from '../core/persistence/index.js';
import { APP } from '../core/config.js';
import { generarRespaldo, analizarRespaldo, restaurarRespaldo } from '../services/respaldo.service.js';
import { cargarDemo, retirarDemo } from '../services/demo.service.js';

const CLAVE_ULTIMO = 'si360.ultimoRespaldo';
const leerUltimo = () => { try { return localStorage.getItem(CLAVE_ULTIMO); } catch { return null; } };

export async function vistaRespaldo(v) {
  const uso = await datos.estimarUso();
  const ultimo = leerUltimo();
  const dias = ultimo ? Math.floor((Date.now() - new Date(ultimo)) / 86400000) : null;
  const demo = (await datos.listar('empresas')).filter((e) => e.demo).length;

  v.innerHTML = `
  <div class="titulo-vista"><div><h1>Respaldo y datos</h1><p>${APP.PERSISTENCIA === 'api' ? 'Los datos viven en el servidor (MySQL) con respaldos automáticos programados. Desde aquí puede descargar un respaldo completo o importar el respaldo del prototipo local.' : 'En esta versión los datos viven solo en este navegador. El respaldo descargado es la copia de seguridad: guárdelo fuera del equipo.'}</p></div></div>
  ${APP.PERSISTENCIA !== 'api' && (dias === null || dias > 7) ? `<div class="banda banda-aviso">${icono('alerta')}<span>${dias === null ? 'No se ha registrado ningún respaldo desde este navegador.' : `El último respaldo tiene ${dias} días.`} Exporte uno ahora y consérvelo en una ubicación segura (por ejemplo, su Google Drive).</span></div>` : ''}
  <section class="rejilla-2">
    <article class="panel">
      <header><h2>Exportar respaldo completo</h2></header>
      <p>Genera un archivo <code>.json</code> con empresas, usuarios, documentos adjuntos, bitácora y metadatos, con huella SHA-256 para verificar su integridad al restaurar.</p>
      <p class="nota">${icono('candado')} Contiene datos personales y hashes de contraseñas. Trátelo conforme a la Ley 1581 de 2012 y su política de tratamiento de datos.</p>
      <dl class="ficha"><dt>Último respaldo</dt><dd>${ultimo ? fecha(ultimo, true) : 'Nunca'}</dd>
        ${APP.PERSISTENCIA === 'api' ? '<dt>Almacenamiento</dt><dd>Servidor MySQL y carpeta privada de archivos</dd>' : `<dt>Espacio usado</dt><dd>${uso ? `${tamano(uso.usado)} de ${tamano(uso.cuota)} disponibles` : 'No informado por el navegador'}</dd>
        <dt>Almacenamiento persistente</dt><dd>${datos.persistente ? 'Concedido por el navegador' : 'No concedido: el navegador podría liberar espacio si el disco se llena'}</dd>`}</dl>
      <button class="btn btn-pri" id="btn-exportar">${icono('descargar')}Descargar respaldo</button>
    </article>
    <article class="panel">
      <header><h2>Restaurar desde un respaldo</h2></header>
      <p>El archivo se valida por completo antes de modificar algo. Si falla cualquier comprobación, los datos actuales no se tocan. La restauración <b>reemplaza</b> toda la información actual.</p>
      <label class="campo"><span>Archivo de respaldo</span><input type="file" id="in-respaldo" accept=".json,application/json"></label>
      <div id="resultado-analisis"></div>
    </article>
  </section>
  <section class="panel">
    <header><h2>Datos de demostración</h2><small>Cuatro empresas ficticias, marcadas como DEMO, para practicar. No crean usuarios ni contraseñas.</small></header>
    <p>${demo ? `Hay <b>${demo}</b> empresa(s) de demostración cargadas.` : 'No hay datos de demostración cargados.'}</p>
    <div class="acciones">${demo ? `<button class="btn btn-peligro" id="btn-demo-retirar">Retirar datos de demostración</button>` : `<button class="btn btn-sec" id="btn-demo-cargar">Cargar datos de demostración</button>`}</div>
  </section>`;

  v.querySelector('#btn-exportar').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const blob = await generarRespaldo();
      const nombre = `SI360_respaldo_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
      descargar(blob, nombre);
      try { localStorage.setItem(CLAVE_ULTIMO, new Date().toISOString()); } catch { /* sin almacenamiento */ }
      avisar(`Respaldo generado (${tamano(blob.size)}). Si la descarga no inicia, abra la aplicación en su equipo con el servidor local.`, 'exito', 9000);
    } catch (x) { avisar(x.message, 'error'); }
    finally { e.target.disabled = false; }
  };

  v.querySelector('#in-respaldo').onchange = async (e) => {
    const archivo = e.target.files[0]; if (!archivo) return;
    const caja = v.querySelector('#resultado-analisis');
    caja.innerHTML = '<p class="sub">Validando…</p>';
    const a = await analizarRespaldo(archivo);
    if (!a.valido) {
      caja.innerHTML = `<div class="banda banda-critica">${icono('alerta')}<div><b>Respaldo rechazado. No se modificó ningún dato.</b><ul>${a.errores.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${a.totalErrores > 30 ? `<p>…y ${a.totalErrores - 30} más.</p>` : ''}</div></div>`;
      return;
    }
    caja.innerHTML = `<div class="banda banda-ok">${icono('ok')}<div><b>Respaldo válido</b> · generado ${fecha(a.generado, true)} por ${esc(a.generadoPor || '—')}
      <ul>${Object.entries(a.conteos || {}).filter(([, n]) => n).map(([k, n]) => `<li>${esc(k)}: ${n}</li>`).join('')}</ul>
      ${a.advertencias.length ? `<p>Advertencias:</p><ul>${a.advertencias.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div></div>
      <button class="btn btn-peligro" id="btn-restaurar">Restaurar este respaldo</button>`;
    caja.querySelector('#btn-restaurar').onclick = async () => {
      const r = await confirmar({ titulo: 'Restaurar respaldo', peligro: true, textoAccion: 'Reemplazar datos', pedirMotivo: true,
        mensaje: APP.PERSISTENCIA === 'api'
          ? '<p>Se cargará el respaldo en el <b>servidor</b>. Desde el navegador solo se permite en una instalación nueva (migración desde el prototipo local); para reemplazar los datos de un servidor en uso utilice <code>backend/cli/restaurar.php</code>. Antes se descargará un respaldo del estado actual.</p>'
          : '<p>Se <b>reemplazará toda la información actual</b> de este navegador por la del respaldo. Antes de continuar se descargará automáticamente un respaldo de los datos actuales.</p>' });
      if (!r?.ok) return;
      try {
        descargar(await generarRespaldo(), `SI360_previo_a_restauracion_${Date.now()}.json`);
        await restaurarRespaldo(a, r.motivo);
        await modal({ titulo: 'Restauración completada', contenido: '<p>Los datos se restauraron. La aplicación se recargará y deberá iniciar sesión con las credenciales del respaldo.</p>', acciones: [{ texto: 'Aceptar', clase: 'btn-pri', valor: 1 }] });
        try { sessionStorage.clear(); } catch { /* */ }
        location.hash = '/acceso'; location.reload();
      } catch (x) { avisar(`No se restauró: ${x.message}. Los datos anteriores se conservan.`, 'error'); }
    };
  };

  v.querySelector('#btn-demo-cargar')?.addEventListener('click', async () => {
    try { const n = await cargarDemo(); avisar(`${n} empresa(s) de demostración cargadas.`); vistaRespaldo(v); } catch (x) { avisar(x.message, 'error'); }
  });
  v.querySelector('#btn-demo-retirar')?.addEventListener('click', async () => {
    const r = await confirmar({ titulo: 'Retirar datos de demostración', mensaje: '<p>Se borrarán definitivamente las empresas marcadas como DEMO. No afecta a empresas reales.</p>', textoAccion: 'Retirar', peligro: true });
    if (!r?.ok) return;
    try { const n = await retirarDemo(); avisar(`${n} empresa(s) de demostración retiradas.`); vistaRespaldo(v); } catch (x) { avisar(x.message, 'error'); }
  });
}
