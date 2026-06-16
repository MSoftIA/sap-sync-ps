# Sincronizador SAP HANA - PrestaShop

Este repositorio documenta y construye un reemplazo controlado del
sincronizador actual entre SAP HANA y PrestaShop.

Hoy el proyecto esta en modo diagnostico y solo lectura:

- lee articulos desde SAP HANA
- consulta productos, combinaciones y stock en PrestaShop
- registra comparaciones detalladas en consola
- no escribe cambios en ninguno de los dos sistemas

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
REPORT_DIR=reports
REPORT_BASENAME=sap-prestashop-diagnostic
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

## Estructura

- `main.js`: punto de entrada
- `src/app.js`: orquestacion del flujo
- `src/sap.js`: lectura desde SAP HANA
- `src/prestashop.js`: cliente y parsing de PrestaShop
- `src/xml.js`: utilidades XML
- `src/env.js`: carga y validacion de entorno
- `src/logger.js`: salida JSON estructurada

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

## Diagnostico masivo

Para revisar muchos productos, deja `SAP_ITEM_CODE` vacio y ajusta `SAP_LIMIT`
al lote que quieras analizar.

Al final de cada corrida el script genera:

- un resumen JSON
- un detalle completo en JSON
- un CSV facil de abrir en Excel

Cuando un producto existe en SAP y no existe en PrestaShop, el reporte lo
marca como `create_from_sap`. Esa es la señal para crearlo en la tienda, ya que
SAP se considera la fuente de verdad.

Todos quedan en la carpeta configurada por `REPORT_DIR`.
