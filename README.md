# Sincronizador SAP HANA - PrestaShop

Este repositorio contiene el reemplazo controlado de la integracion actual
entre SAP Business One sobre HANA y PrestaShop.

La direccion funcional del proyecto es:

```text
SAP Business One / HANA -> PrestaShop
```

Hoy el sistema ya tiene dos caras:

- un backend Node.js que lee SAP, compara contra PrestaShop y puede ejecutar
  cambios reales
- un panel web React para operar la sync, revisar el estado del catalogo y
  consultar dominios separados

## Estado actual

### Operativo hoy

- lectura de articulos desde SAP HANA
- lectura de resumen de pedidos desde SAP
- diagnostico de categorias desde SAP (`OITB` + `QryGroup*`)
- lectura de productos, stock y combinaciones desde PrestaShop
- comparacion SAP vs PrestaShop
- reportes `summary.json`, `rows.json` y `rows.csv`
- modo `dry run`
- modo `write`
- altas de productos simples
- actualizacion de precio y stock sobre producto simple
- panel web con vistas:
  - `Sync`
  - `SAP`
  - `PrestaShop`

### Con limitaciones conocidas

- combinaciones siguen en modo de revision, no en automatizacion agresiva
- `categories` ya diagnostica y reporta, pero no escribe en PrestaShop
- `orders` hoy solo expone resumen operativo desde SAP; no sincroniza pedidos
- el cuello de botella principal sigue siendo PrestaShop cuando una corrida
  necesita muchas lecturas o escrituras

## Requisitos

```powershell
npm install
```

## Variables de entorno

Se recomienda crear `.env.local` en la raiz:

```text
HANA_SERVER_NODE=hanab1:30015
HANA_USER=USUARIO
HANA_PASSWORD=PASSWORD
HANA_SCHEMA=BD_CARBALLO
SAP_PRICE_LIST=14
SAP_WAREHOUSE=AC01
SAP_ITEM_CODE=
SAP_LIMIT=50
PRESTASHOP_ENDPOINT=https://carballo.com.do
PRESTASHOP_API_KEY=API_KEY
PRESTASHOP_DEFAULT_CATEGORY_ID=
PRESTASHOP_LANGUAGE_ID=1
SYNC_WRITE=false
SYNC_DOMAINS=products
REPORT_DIR=reports
REPORT_BASENAME=sap-prestashop-diagnostic
LOG_LEVEL=info
UI_PORT=3000
```

Notas:

- `SAP_ITEM_CODE` vacio + `SAP_LIMIT=0` permite corrida masiva
- `SYNC_DOMAINS` sigue existiendo como fallback tecnico
- desde la interfaz web ya se puede elegir dominio sin editar el `.env.local`
- `PRESTASHOP_DEFAULT_CATEGORY_ID` es obligatorio para altas automáticas de
  productos

## Scripts reales del proyecto

### Levantar panel web

```powershell
npm start
```

Hace esto:

1. limpia pantalla
2. hace `git fetch`
3. hace `git pull --ff-only origin main`
4. compila frontend con Vite
5. levanta `server.js`

### Levantar solo el servidor ya compilado

```powershell
npm run serve
```

### Compilar frontend

```powershell
npm run build
```

### Ejecutar sync por consola

```powershell
npm run sync
```

### Probar solo conexion y lectura HANA

```powershell
npm run test:hana
```

### Formato y validacion

```powershell
npm run format
npm run lint
```

## Arquitectura del backend

### Backend principal

- `main.js`: entrypoint CLI
- `server.js`: servidor Express y API del panel
- `src/app.js`: orquestador de dominios
- `src/env.js`: carga de `.env.local`
- `src/logger.js`: logs JSON estructurados
- `src/report.js`: reportes y snapshots

### Dominio SAP

- `src/sap.js`

Lee:

- productos desde `OITM`, `ITM1`, `OITW`
- diagnostico de categorias desde `OITB` y `OITG`
- resumen de pedidos desde `ORDR`

### Dominio PrestaShop

- `src/prestashop.js`

Responsabilidades:

- cliente del webservice
- parseo XML
- lectura de productos, stocks y combinaciones
- snapshot en memoria de PrestaShop para corridas masivas
- utilidades de actualizacion puntual

### Dominios de sync

- `src/sync-domains.js`
- `src/domains/products.js`
- `src/domains/categories.js`
- `src/domains/orders.js`

Estado actual:

| Dominio | Estado | Escritura real |
|---|---|---|
| `products` | activo | si, con cautela |
| `categories` | diagnostico | no |
| `orders` | discovery | no |

### Planificacion y ejecucion

- `src/sync-plan.js`: arma payloads y decide defaults
- `src/sync-executor.js`: ejecuta `create` y `update`
- `src/xml.js`: helpers XML

## Flujo operativo del dominio `products`

1. leer articulos SAP
2. precargar snapshot de PrestaShop
3. buscar coincidencia por referencia
4. decidir si corresponde:
   - crear
   - actualizar precio
   - actualizar stock
   - actualizar precio y stock
   - dejar en revision
   - no hacer nada
5. ejecutar si `SYNC_WRITE=true`
6. generar reportes

## Panel web

El panel usa Express + React y expone tres vistas:

### 1. `Sync`

Pensada para operacion diaria:

- lanzar corrida masiva
- correr lote puntual
- elegir dominios
- elegir `dry run` o `write`
- seguir progreso por SSE
- leer log en tiempo real
- revisar historial

### 2. `SAP`

Pensada para lectura de la fuente de verdad:

- catalogo total
- activos
- stock total
- detalle por warehouse y price list

### 3. `PrestaShop`

Pensada para contraste y control puntual:

- resumen del catalogo PrestaShop
- brecha contra SAP
- lookup por referencia
- activar/desactivar un producto puntual

## Endpoints principales

### Estado general

- `GET /api/status`
- `GET /api/catalog-overview`
- `GET /api/dashboard-summary`
- `GET /api/domain-analysis`
- `GET /api/sync-domains`
- `GET /api/reports`

### Sync

- `GET /api/sync`

Usa SSE para publicar logs y estado de la corrida.

### Control puntual de PrestaShop

- `GET /api/prestashop-control?reference=...`
- `POST /api/prestashop-control/active`

## Reportes

Cada corrida del dominio `products` genera:

- `*.summary.json`
- `*.rows.json`
- `*.rows.csv`

Los reportes incluyen:

- estado por fila
- accion propuesta
- si la accion fue ejecutada o no
- diferencias de precio y stock
- bloqueos y errores

El dominio `categories` genera snapshots propios con resumen y filas de
diagnostico.

## Rendimiento

Para reducir el costo de las corridas masivas, el proyecto ya precarga un
snapshot de PrestaShop con:

- `products`
- `stock_availables`

Eso evita repetir la busqueda remota por referencia en cada articulo simple y
mejora bastante el throughput de lectura.

El siguiente frente de optimizacion natural sigue siendo:

- reducir fan-out sobre combinaciones
- controlar concurrencia de escrituras
- medir por fase cuanto tarda SAP, PrestaShop y el executor

## Documentacion del proyecto

- [docs/inventario-entorno.md](C:\Users\jorge\OneDrive\Documentos\carballo.com.do\docs\inventario-entorno.md)
- [docs/estado-integracion-sap-prestashop.md](C:\Users\jorge\OneDrive\Documentos\carballo.com.do\docs\estado-integracion-sap-prestashop.md)
- [docs/arquitectura-fuente-de-verdad-sap.md](C:\Users\jorge\OneDrive\Documentos\carballo.com.do\docs\arquitectura-fuente-de-verdad-sap.md)
- [docs/tablas-sap-business-one-hana.md](C:\Users\jorge\OneDrive\Documentos\carballo.com.do\docs\tablas-sap-business-one-hana.md)
- [docs/handoff-ia-sap-prestashop.md](C:\Users\jorge\OneDrive\Documentos\carballo.com.do\docs\handoff-ia-sap-prestashop.md)
- [docs/resumen-trabajo-realizado.md](C:\Users\jorge\OneDrive\Documentos\carballo.com.do\docs\resumen-trabajo-realizado.md)
