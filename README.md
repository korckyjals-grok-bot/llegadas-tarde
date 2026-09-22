# Llegadas tarde

PWA **solo local** para registrar llegadas tarde de estudiantes durante la ventana matutina (~15 min). Optimizada para iPhone Safari: búsqueda rápida, un toque para registrar la hora, y textos listos para WhatsApp (Primaria / Secundaria).

**No hay backend, sync, analytics ni CDNs externos.** Nómina y registros viven en IndexedDB del dispositivo.

> Los nombres del CSV de ejemplo son **datos falsos de demostración**. No incluyas datos reales de estudiantes en el repositorio ni en capturas.

## Cómo abrir en local

Requisitos: Node.js 20+.

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite (con `base` `/llegadas-tarde/`, por defecto [http://127.0.0.1:43123/llegadas-tarde/](http://127.0.0.1:43123/llegadas-tarde/)).

Otros comandos:

```bash
npm test          # Vitest (CSV + reportes + día)
npm run test:e2e  # Playwright smoke (390×844, flujo completo)
npm run build     # genera dist/
npm run preview   # sirve la build de producción
```

Para servir solo archivos estáticos tras `npm run build`, cualquier servidor estático sobre `dist/` funciona (por ejemplo `npx serve dist`). En GitHub Pages la app queda en `/llegadas-tarde/`.

## Publicar en GitHub Pages

El workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) en cada push a `main` ejecuta `npm ci`, `npm run build` y publica `dist/` con las actions oficiales de Pages.

1. En el repo de GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Tras el deploy, la app estará en `https://<usuario>.github.io/llegadas-tarde/`.

Vite usa `base: "/llegadas-tarde/"` (nombre del proyecto en Pages).

## Flujo diario

1. Abrir la app → el campo de búsqueda queda listo.
2. Escribir nombre o apellido → tocar el estudiante.
3. Se registra la **hora actual del dispositivo**; se puede **Deshacer** el último.
4. La lista de hoy se parte en **Primaria** y **Secundaria** (según `level` del CSV).
5. **Copiar primaria** / **Copiar secundaria** generan textos planos para WhatsApp.
6. **Limpiar hoy** borra solo los registros del día; **no toca la nómina**.

El límite de día usa la zona **America/El_Salvador**. Al cambiar el día calendario, los registros de tarde anteriores se eliminan (no hay historial a largo plazo).

## Importar nómina (CSV)

En **Ajustes → Elegir archivo CSV**. El parseo y la validación son 100 % en el dispositivo.

### Columnas requeridas

| Campo canónico | Alias aceptados (ejemplos) |
| --- | --- |
| `student_id` | `id`, `codigo`, `código` |
| `first_name` | `nombre`, `firstname`, `name` |
| `last_name` | `apellido`, `apellidos`, `lastname` |
| `grade` | `grado` |
| `section` | `seccion`, `sección`, `grupo` |
| `level` | `nivel`, `ciclo` |

Los encabezados no distinguen mayúsculas/minúsculas.

### Valores de `level`

- Primaria: `primary`, `primaria`
- Secundaria: `secondary`, `secundaria`

Si `level` viene vacío, se intenta inferir por grado (1–5 primaria, 6–12 secundaria). Si el CSV trae `level`, ese valor manda.

### Modos

- **Agregar / actualizar por ID**: upsert por `student_id`.
- **Reemplazar nómina completa**: pide confirmación y sobrescribe.
- **Borrar nómina local**: pide confirmación; no borra la lista de tarde de hoy.
- **Cargar datos demo (falsos)**: importa `sample-roster.csv` (~26 nombres inventados).

Tras importar verás conteo de válidos / errores y ejemplos de motivos (campos vacíos, nivel inválido, IDs duplicados).

Archivo de ejemplo en el repo: [`public/sample-roster.csv`](public/sample-roster.csv) (también servido en `/llegadas-tarde/sample-roster.csv`).

## Instalar en iPhone (Safari)

1. Publica o sirve la app por **HTTPS** (o `localhost` en desarrollo). Safari exige un origen seguro para varias APIs de PWA.
2. Abre la URL en **Safari** (no Chrome iOS).
3. Comparte → **Añadir a pantalla de inicio**.
4. Ábrela desde el ícono; se verá a pantalla completa (`standalone`).

### Limitaciones de iOS Safari

- No hay “instalación” tipo Android con prompt automático; siempre es **Añadir a pantalla de inicio**.
- El Service Worker cachea el **shell** (HTML/CSS/JS/iconos/CSV demo) para uso offline tras la primera carga. IndexedDB (nómina y tarde) ya es local.
- iOS puede evictar almacenamiento en condiciones de poco espacio; no es un almacén garantizado a largo plazo.
- La API de portapapeles funciona mejor con gesto del usuario (los botones Copiar ya lo usan); hay respaldo `execCommand` si hace falta.
- Las notificaciones push y el background sync **no** se usan (ni se necesitan).

## Privacidad

- Cero llamadas de red para nómina, búsquedas o registros de tarde.
- Sin fuentes ni scripts de terceros.
- Sin telemetría.
- Solo el shell de la app puede pedirse al servidor estático la primera vez; después el SW puede servir offline.
- Datos de tarde: solo el día actual (zona El Salvador).

## Pruebas

```bash
npm test
npm run test:e2e
```

Vitest cubre parseo/validación CSV, filtrado de nombres, generación de textos WhatsApp y el corte de día en `America/El_Salvador`.

Playwright (con el dev server en marcha: `npm run dev`) valida en viewport iPhone: demo falsa, búsqueda/registro, listas Primaria/Secundaria, copiar reportes, limpiar hoy sin borrar nómina, importar/reemplazar/borrar CSV, y que no se envían datos sensibles por red.

Prueba offline del service worker (build de producción):

```bash
npm run build
npm run preview -- --port 43124
npm run test:e2e:sw
```

## Estructura

```
index.html          UI en español
src/                lógica (csv, db, day, reports, main, estilos)
public/             manifest, service worker, iconos, sample-roster.csv
tests/              Vitest
```
