# Sporting Cambre · App de preparación física

Aplicación web para gestionar el trabajo del preparador físico (Jose Manuel Portas Vázquez). Tiene tres módulos conectados por una base de datos común de jugadores:

1. **Gimnasio y control de asistencia** (infantil, cadete y juvenil). Solo para el preparador.
2. **Lesiones y readaptación deportiva**. Privado, solo para el preparador.
3. **Preparación física del primer equipo**: carga (RPE × minutos, aguda, crónica y ACWR), wellness, entrenamientos adicionales, partidos, estadísticas y tests. Los jugadores tienen una pantalla móvil propia.

La aplicación no trae jugadores, resultados ni datos médicos inventados. Todo lo que falta aparece como *pendiente de introducir*.

---

## 1. Puesta en marcha en local (para probar)

Necesitas **Node.js 20 o superior** (https://nodejs.org).

```bash
npm install          # dependencias del servidor
npm run build        # compila la interfaz (client/)
npm start            # arranca en http://localhost:3000
```

La primera vez, la consola muestra un **código de configuración** de 6 cifras. Abre la app, introdúcelo y crea tu cuenta de administrador: tu nombre completo y un PIN de al menos 6 caracteres. Ese código impide que otra persona cree la cuenta antes que tú.

## 2. Despliegue en internet (para que los jugadores la usen desde el móvil)

La app es un único servidor Node con una base de datos SQLite en disco. Opciones:

| Opción | Coste aprox. | Notas |
|---|---|---|
| **Railway** o **Render** (con disco persistente) | 5–7 €/mes | Sube el repositorio y usa el `Dockerfile`. Monta un volumen en `/data`. |
| **Fly.io** con volumen | ~3–5 €/mes | `fly launch` detecta el Dockerfile. Crea un volumen y móntalo en `/data`. |
| VPS (Hetzner, OVH…) | ~4–5 €/mes | `docker build -t scpf . && docker run -d -p 3000:3000 -v scpf-data:/data scpf` detrás de un proxy HTTPS (Caddy). |

⚠️ No uses planes gratuitos **sin disco persistente**: la base de datos se borraría en cada reinicio.

**Variables de entorno**

| Variable | Uso |
|---|---|
| `PORT` | Puerto (por defecto 3000). |
| `DATA_DIR` | Carpeta de la base de datos, los archivos y las copias (en Docker: `/data`). |
| `COOKIE_SECURE=1` | **Obligatoria en producción con HTTPS**: la cookie de sesión solo viaja cifrada. |
| `TRUST_PROXY=1` | Si la app está detrás de un proxy o plataforma (Railway, Render, Fly, Caddy). |
| `SETUP_CODE` | (Opcional) Código fijo de configuración inicial. Si no se indica, se genera uno y se muestra en la consola. |
| `SESSION_DAYS` | Duración de la sesión (por defecto 30 días). |

No hay credenciales ni claves en el código del cliente.

## 3. Primeros pasos dentro de la app

1. **Jugadores → Cargar listado 2026/27**: crea las 6 franjas del gimnasio (martes y jueves: 18:00, 19:00 y 20:00) y carga los 69 jugadores de los documentos facilitados (infantil, cadete y el equipo modesto como primer equipo), con vista previa antes de guardar. Los juveniles A y B quedan pendientes porque el documento no incluye sus nombres: añádelos con **Importar CSV / Excel** o uno a uno.
2. El **escudo oficial** y los colores del club (principal blanco, secundario rojo) ya vienen incluidos; se pueden cambiar en **Configuración → Club**.
3. **Jugadores → Importar CSV / Excel**: para otros listados. Puedes revisar y corregir cada fila antes de guardar; los duplicados se detectan. Hay una plantilla descargable.
4. **Primer equipo → Sesiones**: «Programar martes, jueves y viernes» crea los entrenamientos colectivos. Así la app detecta qué RPE faltan.
5. **Primer equipo → Cuentas de jugadores**: crea la cuenta de cada jugador. Se genera un **PIN provisional** que el jugador cambia la primera vez que entra.

## 4. Acceso y seguridad

- **Inicio de sesión**: nombre completo (sin distinguir mayúsculas ni tildes) + PIN. Los PIN se guardan cifrados (bcrypt). Hay un límite de intentos fallidos y las sesiones se guardan en el servidor con cookie `httpOnly`.
- **Permisos en el servidor**, no solo en la interfaz. El jugador solo puede consultar y registrar sus propios datos: el servidor toma su identidad de la sesión, nunca de la petición. Los módulos de gimnasio y lesiones devuelven 403 a cualquier jugador.
- **Archivos** (fotos e informes médicos): se sirven solo a usuarios autorizados, sin enlaces públicos permanentes. Solo se admiten imágenes, PDF, Word, Excel y texto (máx. 15 MB).
- **Correcciones trazables**: el jugador no puede editar lo que ya ha enviado. Solicita una corrección; si el preparador la aprueba, el registro original queda como «anulado» y se enlaza al nuevo.
- **Historial de cambios** de asistencia, jugadores, lesiones, cargas, partidos y configuración (Configuración → Copias y registro).
- **Copias de seguridad**: automáticas al arrancar y cada 24 h (se conservan las 14 últimas), más descarga manual desde Configuración.
- **RGPD**: datos personales separados de los de rendimiento, exportación de todos los datos de un jugador (derecho de acceso), desactivación y eliminación definitiva con confirmación (derecho de supresión). Al tratar datos de salud de jugadores (algunos menores de edad), revisa con el club el consentimiento informado, el registro de actividades de tratamiento y quién actúa como responsable del tratamiento.

## 5. Cálculo de la carga

- Carga de sesión (UA) = minutos × RPE (0–10). La calcula el servidor.
- **Rolling** (por defecto): aguda = suma de 7 días (UA/semana). Crónica = suma de 28 días ÷ 4 (UA/semana). Con menos de 28 días de exposición (mínimo 21, configurable), se usa la media semanal del periodo disponible. ACWR = aguda ÷ crónica.
- **EWMA** (opcional, en Configuración): λ = 2/(N+1), con N = 7 y 28.
- Se distinguen tres casos: **carga cero real**, **registro pendiente** (había sesión programada, el jugador no estaba ausente ni lesionado y no envió su RPE; no se trata como 0) y **datos insuficientes**. En los dos últimos, el ACWR aparece en gris («n/c»).
- Los colores y umbrales se pueden configurar y están documentados en la propia app (Primer equipo → Metodología de cálculo). No predicen lesiones.

Los cálculos están verificados con ejemplos conocidos en `test/load.test.js`.

## 6. Partidos (Futgal)

**Actas en PDF (recomendado):** en Primer equipo → Partidos → Importar → *Actas en PDF*, sube una o varias «Fichas del Partido» descargadas de Futgal. La app lee la competición, la jornada, la fecha, el rival, el resultado, los titulares y suplentes, las sustituciones con su minuto, los goles y las tarjetas (amarilla, roja o doble amarilla, según el icono del acta). Calcula los minutos de cada jugador: 90 si juega todo el partido, hasta el minuto del cambio o de la expulsión, o desde que entra; el tiempo añadido no suma minutos. Antes de guardar ves la vista previa con cada jugador asociado a su ficha, y el PDF queda adjunto al partido. Las asistencias no aparecen en el acta y quedan como «sin dato».


No se ha encontrado ninguna API pública ni exportación oficial de la Federación Gallega de Fútbol. Por eso la app **no descarga datos automáticamente**. En su lugar hay:

- **Importación CSV/Excel** (plantilla incluida, una fila por jugador y partido). Incluye vista previa, detección de duplicados, asociación de nombres con los perfiles (las correcciones se recuerdan), registro de la procedencia y la fecha, y protección de los datos introducidos a mano: no se sobrescriben sin tu confirmación.
- **Registro manual** de partidos y estadísticas.

Si en el futuro hay una integración oficial autorizada, puede conectarse a este mismo proceso de vista previa (`/api/team/matches/import/*`).

## 7. Estructura del código

```
server/
  index.js          servidor Express, cabeceras de seguridad, CSRF, estáticos
  db.js             esquema SQLite (registro único de jugador + módulos), configuración por defecto
  auth.js           sesiones, PIN, roles
  lib/load.js       cálculos de carga (funciones puras)
  lib/team.js       series, disponibilidad e indicadores del primer equipo
  routes/core.js    jugadores, importación, ficheros, cuentas, configuración, auditoría, copias
  routes/gym.js     módulo 1
  routes/injuries.js módulo 2
  routes/team.js    módulo 3 (preparador)
  routes/player.js  pantalla del jugador (/api/me)
client/             interfaz React (Vite)
test/               pruebas: cálculos, API y permisos, recorrido visual con Playwright
```

Pruebas: `npm test`. Recorrido visual (requiere Playwright): `node test/ui-check.js capturas/`.

Para añadir un test físico nuevo no hace falta tocar el código: Primer equipo → Tests → Configurar tests.


## Avisos al móvil (notificaciones push)

- Funcionan en la versión publicada con **https** (no en la versión de prueba).
- Al arrancar, el servidor genera las claves VAPID y las guarda en `DATA_DIR/vapid.json` (la privada nunca sale del servidor). También se pueden fijar con las variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (p. ej. `mailto:preparador@club.es`). **No cambies las claves después de publicar**: los móviles ya suscritos dejarían de recibir avisos.
- Cada jugador activa los avisos en Inicio o en Perfil → «App y avisos». En iPhone (iOS 16.4 o posterior) primero hay que añadir la app a la pantalla de inicio desde Safari.
- Horarios y envío manual: Configuración → «Avisos al móvil». Wellness: todos los días. RPE y EVA: solo los días de entrenamiento colectivo. En hora de Madrid y solo a quien no ha hecho el registro de hoy.
