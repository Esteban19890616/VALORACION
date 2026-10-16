/**
 * Derivación de contraseñas con PBKDF2-SHA256 (Web Crypto).
 * Prototipo local: el hash evita guardar contraseñas en texto plano, pero
 * cualquier persona con acceso al navegador puede leer o borrar la base local.
 * En producción el hash se calcula en el servidor (password_hash de PHP, Argon2id/bcrypt).
 */
const ITERACIONES = 210000;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashContrasena(contrasena, salB64 = null, iteraciones = ITERACIONES) {
  if (!globalThis.crypto?.subtle) throw new Error('El navegador requiere un contexto seguro (https o http://localhost) para proteger contraseñas.');
  const sal = salB64 ? deB64(salB64) : crypto.getRandomValues(new Uint8Array(16));
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, clave, 256);
  return { algoritmo: 'PBKDF2-SHA256', iteraciones, sal: b64(sal), hash: b64(bits) };
}

export async function verificarContrasena(contrasena, registro) {
  if (!registro?.hash) return false;
  const r = await hashContrasena(contrasena, registro.sal, registro.iteraciones);
  // Comparación de longitud constante
  if (r.hash.length !== registro.hash.length) return false;
  let d = 0; for (let i = 0; i < r.hash.length; i++) d |= r.hash.charCodeAt(i) ^ registro.hash.charCodeAt(i);
  return d === 0;
}

/** Política: mínimo 10 caracteres, con letras y números. */
export function validarPolitica(c) {
  const e = [];
  if (!c || c.length < 10) e.push('mínimo 10 caracteres');
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c || '')) e.push('al menos una letra');
  if (!/\d/.test(c || '')) e.push('al menos un número');
  return e;
}
