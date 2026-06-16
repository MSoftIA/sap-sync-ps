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
```

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
