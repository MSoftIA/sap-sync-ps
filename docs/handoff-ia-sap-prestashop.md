# Handoff tecnico para otra IA

## Objetivo

Este documento resume el estado real del proyecto al 2026-06-17 para que otra
IA o una persona tecnica puedan continuar el trabajo sin rearmar el contexto
desde cero.

El foco ya no es solo “probar una query SAP”, sino mantener y terminar una
aplicacion propia que sincroniza SAP HANA con PrestaShop y expone un panel web
operativo.

## Contexto de negocio

- Cliente operativo: Almacenes Carballo
- Fuente de verdad deseada: SAP Business One / HANA
- Destino de publicacion: PrestaShop
- Prioridad actual: productos
- Prioridades siguientes: categorias y luego pedidos

## Repositorio actual

- Repo: `MSoftIA/sap-sync-ps`
- Rama usada hasta ahora: `main`
- Ruta local:
  `C:\Users\jorge\OneDrive\Documentos\carballo.com.do`

## Arquitectura del proyecto

### Backend

- `main.js`: entrypoint CLI
- `server.js`: servidor Express + SSE + API del panel
- `src/app.js`: orquesta dominios
- `src/sap.js`: lectura SAP HANA
- `src/prestashop.js`: cliente del webservice y snapshot de catalogo
- `src/sync-plan.js`: arma payloads
- `src/sync-executor.js`: ejecuta cambios reales
- `src/report.js`: reportes

### Dominios

- `src/domains/products.js`
- `src/domains/categories.js`
- `src/domains/orders.js`

### Frontend

React + Vite con tres vistas:

- `SyncView`
- `SapView`
- `PrestaView`

## Scripts reales

```powershell
npm start
npm run serve
npm run build
npm run sync
npm run test:hana
npm run lint
npm run format
```

Importante:

- `npm start` no es dev server de Vite
- hace `git fetch`, `git pull --ff-only`, compila y levanta `server.js`

## Variables de entorno clave

```text
HANA_SERVER_NODE=hanab1:30015
HANA_USER=PS_SYNC
HANA_PASSWORD=...
HANA_SCHEMA=BD_CARBALLO
SAP_PRICE_LIST=14
SAP_WAREHOUSE=AC01
SAP_ITEM_CODE=
SAP_LIMIT=50
PRESTASHOP_ENDPOINT=https://carballo.com.do
PRESTASHOP_API_KEY=...
PRESTASHOP_DEFAULT_CATEGORY_ID=...
PRESTASHOP_LANGUAGE_ID=1
SYNC_WRITE=false|true
SYNC_DOMAINS=products
REPORT_DIR=reports
REPORT_BASENAME=sap-prestashop-diagnostic
LOG_LEVEL=info|debug
UI_PORT=3000
```

## Estado de dominios

| Dominio | Estado | Fuente de verdad | Escritura |
|---|---|---|---|
| `products` | activo | SAP | si |
| `categories` | diagnostico | SAP | no |
| `orders` | discovery | sin cerrar | no |

## Estado funcional real

## `products`

### Ya hace

- lee articulos desde SAP
- compara contra PrestaShop
- genera plan de accion por fila
- crea productos simples faltantes
- actualiza precio y stock en productos simples
- genera reportes de corrida
- publica log y progreso por SSE al panel

### Aun no hace bien

- automatizar combinaciones con seguridad
- resolver todos los casos ambiguos de variantes

## `categories`

### Ya hace

- lee `OITB`
- traduce `QryGroup*` con `OITG`
- genera snapshot diagnostico
- muestra resumen en el panel

### Aun no hace

- crear jerarquia en PrestaShop
- asociar productos
- definir categoria por defecto ecommerce

## `orders`

### Ya hace

- lee resumen de `ORDR`
- muestra abiertos, cerrados, cancelados, ultimos 7 y 30 dias

### Aun no hace

- no sincroniza nada con PrestaShop

## Query SAP vigente para productos

Tablas actuales:

- `OITM`
- `ITM1`
- `OITW`

Campos clave usados:

- `ItemCode`
- `ItemName`
- `Price`
- `WhsCode`
- `Existencia`
- `CodeBars`
- `Status`

Filtros actuales:

- `frozenFor = 'N'`
- `PriceList = SAP_PRICE_LIST`
- `WhsCode = SAP_WAREHOUSE`
- `ItemCode` opcional
- `LIMIT` opcional

## Panel web

## Vista `Sync`

Sirve para:

- lanzar corrida masiva
- lanzar corrida puntual
- elegir dominios
- elegir dry run o write
- ver progreso
- ver log en tiempo real
- revisar historial

## Vista `SAP`

Sirve para:

- ver resumen del catalogo SAP
- revisar stock total
- revisar activos/inactivos

## Vista `PrestaShop`

Sirve para:

- ver resumen de catalogo PrestaShop
- ver brecha SAP vs PrestaShop
- consultar producto puntual por referencia
- activar/desactivar producto puntual

## Endpoints utiles

- `GET /api/status`
- `GET /api/catalog-overview`
- `GET /api/dashboard-summary`
- `GET /api/domain-analysis`
- `GET /api/sync-domains`
- `GET /api/reports`
- `GET /api/sync`
- `GET /api/prestashop-control?reference=...`
- `POST /api/prestashop-control/active`

## Rendimiento

### Hallazgo principal

El backend es mucho mas lento contra PrestaShop que contra SAP.

SAP hoy no es el cuello de botella. El costo viene de:

- lecturas HTTP del webservice
- fan-out de combinaciones
- escrituras por producto

### Mejora ya aplicada

`src/prestashop.js` ya precarga un snapshot con:

- `products`
- `stock_availables`

Y `src/domains/products.js` ya usa ese snapshot para:

- evitar buscar por referencia en PrestaShop para cada producto simple
- reducir roundtrips en sync masiva

### Lo siguiente que conviene atacar

1. medir tiempos por fase
2. concurrencia controlada en escrituras
3. reducir lecturas de combinaciones
4. separar claramente logs de negocio vs logs tecnicos

## Reportes

El dominio `products` genera:

- `*.summary.json`
- `*.rows.json`
- `*.rows.csv`

El dominio `categories` genera snapshots diagnosticos propios.

Estos reportes son el mejor input para otra IA, porque traen:

- accion propuesta
- diferencias
- estado de ejecucion
- errores
- bloqueos

## Riesgos y decisiones vigentes

1. SAP sigue siendo la fuente de verdad acordada para productos
2. combinaciones no deben automatizarse a ciegas
3. `PRESTASHOP_DEFAULT_CATEGORY_ID` define si una alta puede ejecutarse
4. `orders` no debe implementarse de memoria: primero hace falta cerrar el
   flujo de negocio
5. la documentacion vieja del proyecto puede hablar de scripts o pantallas que
   ya cambiaron

## Si otra IA retoma el trabajo

Orden sugerido:

1. leer `README.md`
2. leer `docs/estado-integracion-sap-prestashop.md`
3. leer `docs/arquitectura-fuente-de-verdad-sap.md`
4. leer `docs/tablas-sap-business-one-hana.md`
5. revisar:
   - `src/domains/products.js`
   - `src/prestashop.js`
   - `src/sync-executor.js`
   - `server.js`
   - `frontend/src/views/SyncView.tsx`

## Siguiente linea razonable de trabajo

1. mejorar observabilidad del sync masivo
2. acelerar writes masivos con concurrencia segura
3. pasar `categories` de diagnostico a plan de accion
4. definir funcionalmente `orders`
