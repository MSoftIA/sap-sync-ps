# Tablas SAP Business One / HANA usadas en este proyecto

## Objetivo

Este documento resume las tablas SAP Business One sobre HANA que ya fueron
identificadas en el entorno del cliente y que son relevantes para la
integracion con PrestaShop.

No pretende ser un diccionario completo de SAP Business One. El foco esta en
las tablas que hoy importan para:

- sincronizacion de productos
- diagnostico de categorias
- analisis de pedidos

Schema observado:

- `BD_CARBALLO`

## Vista general

| Tabla | Dominio | Uso actual | Estado |
|---|---|---|---|
| `OITM` | productos | maestro de articulos | activo |
| `ITM1` | productos | precios por lista | activo |
| `OITW` | productos | stock por almacen | activo |
| `OITB` | categorias | grupo principal del articulo | activo |
| `OITG` | categorias | catalogo de propiedades `QryGroup*` | activo |
| `ORDR` | pedidos | cabecera de pedidos / ordenes de venta | activo para lectura |
| `RDR1` | pedidos | lineas de pedidos | identificado, no integrado aun |

## 1. `OITM` - Maestro de articulos

### Que representa

Es la tabla principal de articulos de SAP Business One. Cada fila representa un
producto o articulo.

### Uso en este proyecto

Se usa como tabla base para:

- leer `ItemCode`
- leer `ItemName`
- leer `CodeBars`
- leer `validFor`
- leer `frozenFor`
- leer `ItmsGrpCod`
- leer propiedades `QryGroup1` a `QryGroup64`

### Campos importantes observados

| Campo | Significado operativo |
|---|---|
| `ItemCode` | codigo unico del articulo; en este proyecto se usa como referencia principal hacia PrestaShop |
| `ItemName` | nombre comercial del articulo |
| `CodeBars` | codigo de barras |
| `validFor` | indica si el articulo esta habilitado / vigente |
| `frozenFor` | indica si el articulo esta congelado / bloqueado |
| `ItmsGrpCod` | grupo principal del articulo |
| `QryGroup1..64` | banderas de propiedades o clasificaciones complementarias |

### Relacion con otras tablas

- `OITM.ItemCode` -> `ITM1.ItemCode`
- `OITM.ItemCode` -> `OITW.ItemCode`
- `OITM.ItmsGrpCod` -> `OITB.ItmsGrpCod`

### Observacion

Hoy el proyecto filtra articulos con:

- `frozenFor = 'N'`

Eso significa que los articulos congelados quedan fuera de la sync operativa.

## 2. `ITM1` - Precios por lista

### Que representa

Guarda los precios de cada articulo por lista de precios.

### Uso en este proyecto

Se usa para obtener el precio que debe publicarse en PrestaShop segun la lista
de precios configurada en:

- `SAP_PRICE_LIST`

### Campos importantes observados

| Campo | Significado operativo |
|---|---|
| `ItemCode` | articulo al que pertenece el precio |
| `PriceList` | identificador de la lista de precios |
| `AddPrice1` | precio usado actualmente por el proyecto |

### Relacion con otras tablas

- `ITM1.ItemCode` -> `OITM.ItemCode`

### Observacion

En el entorno analizado, la lista validada para la integracion fue:

- `PriceList = 14`

## 3. `OITW` - Stock por almacen

### Que representa

Guarda el inventario de cada articulo por almacen.

### Uso en este proyecto

Se usa para leer el stock del articulo segun el almacen configurado en:

- `SAP_WAREHOUSE`

### Campos importantes observados

| Campo | Significado operativo |
|---|---|
| `ItemCode` | articulo |
| `WhsCode` | codigo de almacen |
| `OnHand` | existencia actual en ese almacen |
| `AvgPrice` | costo promedio observado en consultas historicas |

### Relacion con otras tablas

- `OITW.ItemCode` -> `OITM.ItemCode`

### Observacion

En este proyecto:

- el stock publicado a PrestaShop sale de `OnHand`
- el filtro actual usa un almacen puntual
- el almacen validado hasta ahora fue `AC01`

## 4. `OITB` - Grupo principal de articulos

### Que representa

Es el catalogo de grupos principales de articulos.

### Uso en este proyecto

Se usa para el dominio `categories`, como categoria principal candidata del
producto.

### Campos importantes observados

| Campo | Significado operativo |
|---|---|
| `ItmsGrpCod` | codigo del grupo |
| `ItmsGrpNam` | nombre del grupo |

### Relacion con otras tablas

- `OITM.ItmsGrpCod` -> `OITB.ItmsGrpCod`

### Observacion

Hoy, para categorias, el proyecto interpreta `ItmsGrpNam` como:

- categoria SAP principal propuesta

Todavia no existe escritura automatica de esta jerarquia en PrestaShop.

## 5. `OITG` - Catalogo de propiedades de articulos

### Que representa

Es el catalogo que da nombre y orden a las propiedades de articulo asociadas a
los campos `QryGroup*` del maestro `OITM`.

### Uso en este proyecto

Se usa para traducir las banderas:

- `QryGroup1`
- `QryGroup2`
- ...
- `QryGroup64`

a nombres de propiedad legibles.

### Campos importantes observados

| Campo | Significado operativo |
|---|---|
| `ItmsTypCod` | numero de propiedad |
| `ItmsGrpNam` | nombre legible de la propiedad |
| `UserSign` | usuario asociado al alta o mantenimiento |

### Relacion con otras tablas

- `OITG.ItmsTypCod` <-> `OITM.QryGroupN`

No es una relacion por FK clasica, sino una relacion logica:

- `QryGroup7 = 'Y'` significa que el articulo tiene activa la propiedad cuyo
  codigo es `7`

### Observacion

Estas propiedades todavia se usan solo para diagnostico y analisis, no para
escribir atributos o categorias en PrestaShop.

## 6. `ORDR` - Cabecera de pedidos / ordenes de venta

### Que representa

Es la tabla cabecera de ordenes de venta o pedidos comerciales.

### Uso en este proyecto

Se usa hoy solo para lectura agregada en el panel:

- total de pedidos
- abiertos
- cerrados
- cancelados
- pedidos recientes
- ultimo `DocNum`

### Campos importantes observados

| Campo | Significado operativo |
|---|---|
| `DocEntry` | identificador interno del documento |
| `DocNum` | numero visible / comercial del pedido |
| `CardCode` | codigo del cliente |
| `CardName` | nombre del cliente |
| `DocDate` | fecha del documento |
| `DocStatus` | estado del documento (`O` abierto, `C` cerrado) |
| `CANCELED` | marca de cancelacion |
| `DocTotal` | total monetario del pedido |
| `NumAtCard` | referencia del cliente |
| `Comments` | comentarios u observaciones |

### Observacion

El dominio `orders` todavia no sincroniza nada hacia PrestaShop. Por ahora
`ORDR` se usa para entender volumen y estado operativo.

## 7. `RDR1` - Lineas de pedidos

### Que representa

Es la tabla de detalle o lineas de cada orden de venta.

### Uso esperado en este proyecto

Todavia no esta integrada en el codigo actual, pero ya fue identificada como la
tabla natural para profundizar el dominio `orders`.

### Campos importantes observados

| Campo | Significado operativo |
|---|---|
| `DocEntry` | referencia a la cabecera `ORDR.DocEntry` |
| `LineNum` | numero de linea |
| `ItemCode` | articulo vendido |
| `Dscription` | descripcion de la linea |
| `Quantity` | cantidad |
| `Price` | precio de la linea |
| `WhsCode` | almacen asociado |

### Relacion con otras tablas

- `RDR1.DocEntry` -> `ORDR.DocEntry`
- `RDR1.ItemCode` -> `OITM.ItemCode`

### Observacion

Si el proyecto avanza en pedidos, `RDR1` va a ser clave para:

- reconstruir el detalle del pedido
- validar articulos y cantidades
- mapear el pedido SAP contra PrestaShop

## Relaciones principales

```text
OITM
 ├─ ITM1   (precios por lista)
 ├─ OITW   (stock por almacen)
 └─ OITB   (grupo principal)

OITM.QryGroup1..64
 └─ OITG   (catalogo de propiedades)

ORDR
 └─ RDR1   (lineas del pedido)
      └─ OITM (articulo de la linea)
```

## Queries que ya existen en el proyecto

### Productos

Tablas usadas:

- `OITM`
- `ITM1`
- `OITW`

Objetivo:

- leer nombre, referencia, precio, stock, barcode y estado

### Categorias

Tablas usadas:

- `OITM`
- `ITM1`
- `OITW`
- `OITB`
- `OITG`

Objetivo:

- diagnosticar categoria principal
- diagnosticar propiedades activas
- producir reportes para mapear categorias SAP -> PrestaShop

### Pedidos

Tablas usadas hoy:

- `ORDR`

Tablas identificadas para la siguiente etapa:

- `RDR1`

Objetivo:

- leer volumen y estado general
- luego profundizar detalle por linea

## Riesgos y notas de interpretacion

### 1. `ItemCode` hoy es la referencia mas importante

En este proyecto se esta usando `ItemCode` como referencia principal para
buscar o crear productos en PrestaShop.

Eso implica que cualquier cambio de regla sobre referencias debe revisarse con
cuidado.

### 2. `ItmsGrpCod` no necesariamente alcanza para toda la taxonomia ecommerce

Aunque `OITB` funciona como grupo principal, puede no ser suficiente si el
cliente necesita:

- multiples categorias por producto
- jerarquias profundas
- atributos navegables

Por eso tambien se estan observando `QryGroup*`.

### 3. El dominio de pedidos aun requiere definicion funcional

Tener `ORDR` y `RDR1` identificadas no significa que ya este claro el flujo.

Antes de implementar pedidos hay que definir:

1. si SAP crea, recibe o solo refleja pedidos
2. si PrestaShop debe mostrar estados SAP
3. si el tracking sale desde SAP
4. que documento SAP representa realmente el evento ecommerce

## Recomendacion para futuras consultas SAP

Cuando se amplie el proyecto, conviene seguir esta regla:

1. documentar primero la tabla
2. documentar la llave de relacion
3. documentar para que se usara en el negocio
4. solo despues integrarla en codigo

Eso evita volver a una integracion dificil de mantener.
