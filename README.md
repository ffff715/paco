# Cuestionario - proyecto

Pequeña web estática con formulario y panel de administrador.

Archivos:
- index.html — Formulario público donde las personas envían su nombre, pedido y cantidad.
- admin.html — Página para el creador: lista, búsqueda, eliminación y exportación a CSV.
- styles.css — Estilos básicos.
- script.js — Lógica: carga de `data.json`, guardado en `localStorage`, exportación.
- data.json — Lista de opciones para el desplegable (editable).

Cómo probar localmente:
1. Abrir `index.html` en un navegador (o servir la carpeta con un servidor local).

Con PowerShell (desde la carpeta del proyecto):

```powershell
# Windows 10/11 con Python instalado
python -m http.server 8000
# Abrir http://localhost:8000/index.html
```

Limitaciones:
- Los datos se guardan en `localStorage` del navegador, no en servidor.
- La exportación genera CSV compatible con Excel.

Si quieres, puedo añadir subida a un servidor o guardar en Google Sheets/Excel Online.

Servidor (opcional):

1. Instalación (Node.js)

```powershell
npm install
```

2. Crear `.env` a partir de `.env.example` y cambiar la contraseña (`ENCRYPT_PASSWORD`).

3. Ejecutar el servidor:

```powershell
set ENCRYPT_PASSWORD=tu-contraseña-segura-aqui
node server.js
```

El servidor guarda las entradas cifradas en la carpeta `data_enf` con extensión `.enf` y expone:
- `POST /submit` — recibe JSON con `name`, `option`, `unit`, `quantity`.
- `GET /submissions` — devuelve todos los envíos desencriptados (para admin).
- `GET /export/csv` — descarga CSV con todos los envíos.

Cliente: si quieres que el formulario envíe al servidor, define `window.SERVER_BASE` en la página o modifica `script.js` para poner la URL base del servidor.