# Handoff tecnico para otra IA

## Objetivo de este documento

Este documento resume el estado real del proyecto para que otra IA o una
persona tecnica puedan continuar el trabajo sin empezar desde cero.

El foco actual es reemplazar o estabilizar la integracion entre SAP Business
One sobre HANA y PrestaShop, usando como fuente de verdad los datos de SAP.

Desde el 2026-06-17, la orquestacion del proyecto ya no vive como un unico
flujo monolitico. Quedo separada por dominios para permitir ampliar el alcance
sin mezclar productos, categorias y pedidos en un solo archivo.

## Contexto general

### Cliente

- Almacenes Carballo

### Servidor Windows principal

- Host: `ventasmoviles`
- IP local observada: `192.1.1.9`
- SO: Windows Server 2016 Standard
- Acceso tecnico observado: AnyDesk

### SAP

- Producto: SAP Business One 10
- Motor: SAP HANA
- Host HANA: `hanab1`
- Puerto validado para esta base: `30015`
- Schema/base objetivo: `BD_CARBALLO`

### PrestaShop

- Dominio observado: `https://carballo.com.do`
- Acceso por webservice: API key
- Version observada del stack: PrestaShop 1.7.8.7 sobre Docker

## Repositorio actual

- Repo GitHub: `MSoftIA/sap-sync-ps`
- Rama de trabajo usada hasta ahora: `main`
- Ruta local de este repo:
  `C:\Users\jorge\OneDrive\Documentos\carballo.com.do`

## Objetivo funcional del proyecto

Construir un sincronizador controlado que:

1. Lea articulos desde SAP HANA.
2. Compare contra PrestaShop.
3. Actualice precio y stock cuando corresponda.
4. Cree productos faltantes en PrestaShop.
5. Deje trazabilidad en logs y reportes.

Regla de negocio principal:

- SAP es la fuente de verdad.

## Estado del reemplazo Node.js

### Flujo ya implementado

El proyecto en Node ya puede:

- leer articulos desde SAP HANA
- buscar productos por referencia en PrestaShop
- leer producto padre, combinaciones y stock
- generar reportes JSON y CSV
- ejecutar escrituras reales cuando `SYNC_WRITE=true`

### Variables de entorno relevantes

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
SYNC_WRITE=true|false
SYNC_DOMAINS=products
REPORT_DIR=reports
REPORT_BASENAME=sap-prestashop-diagnostic
LOG_LEVEL=info|debug
```

No incluir secretos reales en prompts ni en documentos de handoff.

## Estructura de codigo importante

- `main.js`: entrypoint
- `src/app.js`: orquestacion general
- `src/sap.js`: conexion HANA y query de articulos
- `src/prestashop.js`: cliente HTTP del webservice
- `src/sync-domains.js`: registro de dominios activos para la corrida
- `src/domains/products.js`: sincronizacion de productos, precio y stock
- `src/domains/categories.js`: placeholder del dominio de categorias
- `src/domains/orders.js`: placeholder del dominio de pedidos
- `src/sync-plan.js`: decide acciones y payloads
- `src/sync-executor.js`: ejecuta escrituras reales
- `src/report.js`: genera reportes
- `src/xml.js`: utilidades XML
- `docs/arquitectura-fuente-de-verdad-sap.md`: criterio de crecimiento por
  dominios con SAP como fuente de verdad

## Objetivo funcional ampliado

El objetivo ya no es solamente reemplazar el sincronizador de articulos.

La direccion definida para el programa es:

```text
SAP -> PrestaShop
```

Con SAP como fuente de verdad para estos dominios:

1. productos y variantes
2. categorias y jerarquias
3. pedidos / estados

Nota importante:

- para `products` el sentido SAP -> PrestaShop ya esta alineado con el
  comportamiento esperado.
- para `categories` tambien es razonable si SAP contiene la clasificacion
  comercial oficial.
- para `orders` hace falta definir mejor el negocio, porque en muchos ecommerce
  los pedidos nacen en PrestaShop y luego se reflejan en SAP. Si aqui se desea
  que SAP mande tambien en pedidos, hay que precisar si eso significa crear
  pedidos, actualizar estados, publicar tracking, reflejar facturacion o todo
  eso junto.

## Estado de dominios al 2026-06-17

| Dominio | Fuente de verdad | Estado | Observacion |
|---|---|---|---|
| `products` | SAP | activo | sincroniza productos simples, precio y stock |
| `categories` | SAP | diagnostic | ya lee `OITB` + `QryGroup*` y genera reporte, falta escritura |
| `orders` | SAP (objetivo), flujo a definir | discovery | requiere aclaracion funcional antes de programar |

## Query SAP validada

La lectura actual usa tablas estandar de SAP Business One:

- `OITM`
- `ITM1`
- `OITW`

La consulta efectiva arma articulos con:

- `ItemCode`
- `ItemName`
- `Price`
- `WhsCode`
- `Existencia`
- `CodeBars`
- `Status`

La logica actual filtra por:

- lista de precios (`SAP_PRICE_LIST`)
- almacen (`SAP_WAREHOUSE`)
- opcionalmente un `ItemCode`
- `LIMIT`

## Hallazgos confirmados en PrestaShop

### 1. El webservice no acepta `PATCH`

Se confirmo por errores HTTP 405:

- `Method PATCH is not valid`

Por eso el proyecto ya fue adaptado a:

- usar `PUT` para actualizar productos
- usar `PUT` para actualizar `stock_available`

### 2. Los updates de stock ya estan funcionando

Se confirmaron multiples casos con logs como:

- `Accion aplicada en PrestaShop`
- `action":"update_product_stock"`

O sea, el canal SAP -> stock PrestaShop ya esta andando en bastantes casos.

### 3. Los updates de precio todavia no estan cerrados del todo

Se detectaron errores al hacer `PUT` sobre producto por presencia de campos no
escribibles del XML original.

Errores confirmados:

- `parameter "manufacturer_name" not writable`
- `parameter "quantity" not writable`

Ya se hicieron correcciones para remover esos tags del XML antes del `PUT`.
Puede haber mas campos no escribibles escondidos.

### 4. La creacion de productos nuevos es el frente mas delicado

Primero fallaba con:

- `Validation error: "La propiedad Product->name no es valida"`

Luego se implemento:

- sanitizacion ASCII del nombre
- uso de `schema=blank` de PrestaShop para construir el XML de alta
- reintento con nombre conservador basado en `ItemCode`

Eso permitio que varios productos faltantes se creen en PrestaShop, porque
ahora aparecen con IDs nuevos.

### 5. Algunos productos creados quedaron en estado inconsistente

Productos nuevos ya visibles por referencia:

- `72111012` -> `6515`
- `61072510` -> `6516`
- `61660509` -> `6517`
- `71260550` -> `6518`
- `71260570` -> `6519`
- `71260577` -> `6520`
- `06870404` -> `6521`
- `01905505` -> `6522`
- `06520205` -> `6523`
- `10090505` -> `6524`
- `10160505` -> `6525`
- `22020200` -> `6526`
- `22020211` -> `6527`
- `22020213` -> `6528`
- `22020221` -> `6529`
- `22020405` -> `6530`
- `22040205` -> `6531`
- `22040210` -> `6532`
- `22040215` -> `6533`
- `22040220` -> `6534`
- `22040405` -> `6535`

Pero al intentar leer varios de esos productos, PrestaShop respondia:

- HTTP 500
- `PHP Notice #8`
- `Trying to access array offset on value of type bool`
- archivo `classes/Product.php`, linea `7184`

Interpretacion operativa:

- el alta ya no falla en todos los casos
- pero varios productos quedaron creados de forma incompleta o inconsistente
- ahora hace falta reparar o recrear esos productos

Actualizacion 2026-06-16:

- Se valido directamente en la VPS que `getCoverWs()` hacia
  `return $result['id_image'];` sin comprobar si el producto tenia imagen
  cover.
- Se aplico un parche defensivo en
  `/var/www/carballo.com.do/classes/Product.php`:

```php
if (!$result || !isset($result['id_image'])) {
    return 0;
}
```

- Backup generado:
  `/var/www/carballo.com.do/classes/Product.php.codex-bak-20260616`
- Validacion posterior:
  `docker exec carballo-web php -l /var/www/html/classes/Product.php`
- Resultado:
  `No syntax errors detected in /var/www/html/classes/Product.php`

Ademas, el script Node ahora intenta recuperar el `productId` por referencia si
PrestaShop devuelve HTTP 500 justo despues del alta.

## Estado operativo observado en la ultima corrida relevante

Archivo revisado: `response.txt`

Resumen del estado:

- `matchedProductOk`: 5
- `matchedProductDiff`: 18
- `needsReview`: 45
- `errors`: 27

Lectura real del estado:

- stock: bastante encaminado
- precio: parcialmente trabado por XML del producto
- altas: varias terminan en productos invalidos dentro de PrestaShop

## Archivos y logs utiles

### En el servidor Windows

- repo del reemplazo:
  `C:\Users\Administrator\Desktop\msoftia\sap-sync-ps`
- reportes:
  `C:\Users\Administrator\Desktop\msoftia\sap-sync-ps\reports`
- logs manuales compartidos durante la investigacion:
  `si.txt`
  `response.txt`

### Reportes generados por el proyecto

Por corrida se generan:

- `*.summary.json`
- `*.rows.json`
- `*.rows.csv`

Estos archivos son el mejor input para otra IA porque traen:

- accion propuesta
- estado
- diferencias de precio y stock
- si se ejecuto o no
- errores por fila

## Decisiones tecnicas ya tomadas

1. SAP es la fuente de verdad.
2. No depender del ejecutable .NET del proveedor para el reemplazo.
3. Conectar directo a HANA con usuario propio de solo lectura.
4. Mantener modo `dry_run` y modo `write` con bandera.
5. Priorizar primero stock y precio antes que variantes complejas.
6. Tratar combinaciones con cautela; no automatizar mapeos ambiguos.

## Riesgos y puntos sensibles

1. La API key de PrestaShop se vio expuesta historicamente en logs del sistema
   .NET anterior. Debe tratarse como secreto.
2. Hay productos probablemente corruptos o incompletos en PrestaShop por
   intentos previos de alta.
3. El servicio Windows `SS_Servicio_SAP` del proveedor estaba detenido por
   credenciales incorrectas y no debe reactivarse a ciegas.
4. La tienda parece ser sensible a XMLs completos con campos no escribibles.
5. El parche manual en `Product.php` debe preservarse o reaplicarse si el sitio
   se actualiza o se reemplaza el contenedor.

## Recomendaciones concretas para la siguiente IA

### Prioridad 1: reparar updates de precio

Objetivo:

- hacer que `update_product_price`
- y `update_product_price_and_stock`

funcionen sin errores por tags no escribibles.

Camino sugerido:

1. Seguir depurando `buildPutProductXml`.
2. Remover del XML de `PUT` todo campo no escribible detectado.
3. Si sigue siendo inestable, considerar construir un XML de `PUT` minimo a
   partir de `schema=blank` en vez de modificar el XML existente del producto.

### Prioridad 2: reparar o recrear productos creados rotos

Objetivo:

- limpiar los productos nuevos que hoy devuelven HTTP 500 al leerse

Camino sugerido:

1. Detectar los productos creados recientemente por referencia.
2. Inspeccionar si faltan asociaciones obligatorias:
   - categoria por defecto
   - categorias
   - nombres por idioma
   - `link_rewrite`
   - shop associations
3. Si la reparacion por `PUT` no es estable, evaluar:
   - borrarlos
   - recrearlos con un payload mucho mas basico y valido

### Prioridad 3: documentar una estrategia segura de recreacion

Antes de borrar nada, definir:

- criterios de que es un producto "roto"
- como identificar que fue creado por esta migracion
- como evitar tocar productos historicos sanos

## Prompts sugeridos para otra IA

### Prompt 1: continuar depuracion tecnica

```text
Estoy trabajando en un reemplazo Node.js de una integracion SAP Business One HANA -> PrestaShop.
Lee la documentacion del repo, especialmente docs/handoff-ia-sap-prestashop.md, docs/estado-integracion-sap-prestashop.md y README.md.
El proyecto ya conecta a HANA y actualiza stock correctamente en varios casos.
El problema pendiente es doble:
1) algunos PUT de producto fallan por campos no escribibles del XML,
2) varios productos nuevos quedaron creados pero al leerlos PrestaShop responde HTTP 500 con un PHP Notice en Product.php linea 7184.
Necesito que propongas y apliques el siguiente paso mas seguro para reparar precio y altas sin romper productos existentes.
```

### Prompt 2: analisis centrado en PrestaShop

```text
Necesito que analices el comportamiento del webservice PrestaShop de este proyecto.
Contexto:
- PATCH no es valido
- PUT de stock ya funciona en muchos casos
- PUT de producto falla si el XML arrastra campos no escribibles
- varios productos creados devuelven HTTP 500 al leerse por API
Revisa src/prestashop.js y src/sync-executor.js, y propone una estrategia robusta para:
1) actualizar precio,
2) crear productos validos usando schema blank,
3) reparar productos ya creados en estado inconsistente.
```

## Ultimo estado esperado del operador humano

Cada vez que se pruebe una nueva version en el servidor, conviene capturar:

1. salida completa de consola
2. ultimo `*.summary.json`
3. ultimo `*.rows.json`

Con eso, otra IA puede continuar casi sin contexto adicional.
