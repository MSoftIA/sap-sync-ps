# Sincronizador SAP HANA - PrestaShop

Este repositorio documenta y construye un reemplazo controlado del
sincronizador actual entre SAP HANA y PrestaShop.

Por defecto el proyecto arranca en modo diagnostico y solo lectura:

- lee articulos desde SAP HANA
- consulta productos, combinaciones y stock en PrestaShop
- registra comparaciones detalladas en consola
- no escribe cambios en ninguno de los dos sistemas, salvo que se habilite
  `SYNC_WRITE=true`

## Requisitos

```powershell
npm install
```

## Variables de entorno

Se recomienda crear un archivo `.env.local` en la raiz del proyecto:

```text
HANA_SERVER_NODE=hanab1:30015
HANA_USER=USUARIO
HANA_PASSWORD=PASSWORD
HANA_SCHEMA=BD_CARBALLO
SAP_PRICE_LIST=14
SAP_WAREHOUSE=AC01
SAP_ITEM_CODE=61072505
SAP_LIMIT=5
PRESTASHOP_ENDPOINT=https://carballo.com.do
PRESTASHOP_API_KEY=API_KEY
PRESTASHOP_DEFAULT_CATEGORY_ID=
PRESTASHOP_LANGUAGE_ID=1
SYNC_WRITE=false
SYNC_DOMAINS=products
REPORT_DIR=reports
REPORT_BASENAME=sap-prestashop-diagnostic
LOG_LEVEL=info
```

Cuando existe `.env.local`, sus valores prevalecen sobre variables viejas que
hayan quedado cargadas en la sesion de PowerShell.

## Scripts disponibles

Probar solo la lectura desde SAP:

```powershell
npm run test:hana
```

Formatear el codigo:

```powershell
npm run format
```

Validar estilo:

```powershell
npm run lint
```

Ejecutar el flujo actual completo:

```powershell
npm run dev
```

Levantar el panel web:

```powershell
npm run ui
```

Para ver mas detalle tecnico en consola durante una corrida:

```text
LOG_LEVEL=debug
```

Para permitir escrituras reales en PrestaShop:

```text
SYNC_WRITE=true
```

## Estructura

- `main.js`: punto de entrada
- `server.js`: servidor Express del panel web
- `src/app.js`: orquestacion del flujo
- `src/sap.js`: lectura desde SAP HANA
- `src/prestashop.js`: cliente y parsing de PrestaShop
- `src/sync-domains.js`: seleccion y registro de dominios de sincronizacion
- `src/domains/products.js`: dominio actual de productos, precios y stock
- `src/domains/categories.js`: base del dominio de categorias
- `src/domains/orders.js`: base del dominio de pedidos
- `src/xml.js`: utilidades XML
- `src/env.js`: carga y validacion de entorno
- `src/logger.js`: salida JSON estructurada
- `src/report.js`: generacion de reportes y resumenes

## Documentacion del proyecto

- `docs/inventario-entorno.md`: levantamiento tecnico del servidor y su entorno
- `docs/estado-integracion-sap-prestashop.md`: estado de la integracion
  historica y del reemplazo en curso
- `docs/arquitectura-fuente-de-verdad-sap.md`: criterio objetivo de SAP como
  fuente de verdad por dominios
- `docs/handoff-ia-sap-prestashop.md`: contexto de continuidad para otra IA o
  tecnico
- `docs/resumen-trabajo-realizado.md`: resumen ejecutivo de lo ya investigado

## Estado actual

El script resuelve:

- producto por referencia en PrestaShop
- detalle del producto padre
- combinaciones del producto
- detalle individual de cada combinacion
- stock disponible por producto y por combinacion

Esto nos permite validar con mas precision como se relaciona un `ItemCode`
de SAP con una combinacion concreta de PrestaShop antes de automatizar
escrituras.

## Dominios objetivo

La integracion ya quedo preparada para crecer por dominios separados:

- `products`: productos, precios, stock y variantes
- `categories`: categorias y jerarquias comerciales
- `orders`: pedidos y estados

Hoy el dominio realmente operativo es `products`.

El dominio `categories` ya puede ejecutarse en modo diagnostico: lee SAP,
propone categoria principal desde `OITB` y reporta propiedades activas
`QryGroup*` usando el catalogo de `OITG`.

El dominio `orders` sigue en fase de descubrimiento y por ahora solo deja
trazas informativas para poder extender el programa sin volver a mezclar toda
la logica en un unico flujo.

Cada dominio publica su propio estado interno para que la orquestacion y el
panel puedan saber:

- si ya esta implementado o no
- si SAP es su fuente de verdad
- si genera reportes operativos
- cual es su alcance previsto

Para seleccionar dominios se usa:

```text
SYNC_DOMAINS=products
```

Ejemplo para correr solo el diagnostico de categorias:

```text
SYNC_DOMAINS=categories
```

Mas adelante soportara corridas como:

```text
SYNC_DOMAINS=products,categories,orders
```

## Diagnostico masivo

Para revisar muchos productos, deja `SAP_ITEM_CODE` vacio y ajusta `SAP_LIMIT`
al lote que quieras analizar.

Al final de cada corrida el script genera:

- un resumen JSON
- un detalle completo en JSON
- un CSV facil de abrir en Excel

Cuando un producto existe en SAP y no existe en PrestaShop, el reporte lo
marca como `create_from_sap`. Esa es la senal para crearlo en la tienda, ya que
SAP se considera la fuente de verdad.

El reporte tambien propone un plan de accion por fila, por ejemplo:

- `create_product`
- `update_product_price`
- `update_product_stock`
- `update_product_price_and_stock`
- `skip_no_change`
- `review_combination_mapping`

Para los candidatos a creacion, el dry-run arma un payload propuesto. Si falta
`PRESTASHOP_DEFAULT_CATEGORY_ID`, la fila queda bloqueada para revision antes de
crear el producto.

Si `SYNC_WRITE=true`, el proceso intenta ejecutar de verdad:

- `create_product`
- `update_product_stock`
- `update_product_price`
- `update_product_price_and_stock`

Por ahora la escritura real se enfoca en productos simples y en actualizaciones
directas del producto padre. Las combinaciones siguen quedando en revision para
evitar decisiones incorrectas sobre variantes.

Todos los archivos quedan en la carpeta configurada por `REPORT_DIR`.

## Panel web

El panel web sirve para operar y contrastar el estado del catalogo:

- lanzar el sync en modo `dry run` o `write`
- ver el log en tiempo real
- revisar el historial de corridas
- consultar un snapshot agregado de SAP
- consultar un snapshot agregado de PrestaShop
- comparar ambas fuentes con un bloque de contraste

Actualmente el panel muestra, como minimo:

- SAP: schema, warehouse, price list, total de productos, activos, inactivos,
  productos con stock, productos sin stock y stock total
- PrestaShop: total de productos, activos, inactivos y total de combinaciones
- contraste: gap de productos, activos e inactivos entre SAP y PrestaShop

El endpoint interno que alimenta ese bloque es:

```text
GET /api/catalog-overview
```
