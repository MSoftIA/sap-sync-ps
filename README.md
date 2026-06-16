# Sincronizador SAP HANA - PrestaShop

Este repositorio se esta usando para construir, paso a paso, un reemplazo simple
del sincronizador actual.

## Paso 1: probar conexion a SAP HANA

Instalar dependencias:

```powershell
npm install
```

Configurar variables de entorno en PowerShell:

```powershell
$env:HANA_SERVER_NODE="hanab1:30013"
$env:HANA_USER="USUARIO"
$env:HANA_PASSWORD="PASSWORD"
$env:HANA_SCHEMA="BD_CARBALLO"
$env:SAP_PRICE_LIST="14"
$env:SAP_WAREHOUSE="AC01"
$env:SAP_ITEM_CODE="61072505"
$env:SAP_LIMIT="5"
```

Ejecutar:

```powershell
npm run test:hana
```

Tambien se puede crear un archivo `.env.local` en la carpeta del proyecto:

```text
HANA_SERVER_NODE=hanab1:30013
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

Luego ejecutar:

```powershell
npm run test:hana
```

El script es de solo lectura. No modifica SAP ni PrestaShop.
