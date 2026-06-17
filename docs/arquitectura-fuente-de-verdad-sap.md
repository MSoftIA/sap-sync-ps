# Arquitectura objetivo: SAP como fuente de verdad

## Objetivo

La direccion del proyecto queda definida asi:

```text
SAP Business One / HANA -> PrestaShop
```

Eso significa que el programa debe tomar las decisiones principales desde SAP y
reflejarlas en PrestaShop de forma controlada, auditable y gradual.

## Dominios funcionales

Para no volver a mezclar toda la integracion en un solo flujo, el programa se
organiza por dominios:

### 1. `products`

Responsabilidad:

- crear productos faltantes en PrestaShop
- actualizar precio
- actualizar stock
- decidir cuando un producto requiere revision manual
- preparar el terreno para variantes o combinaciones

Estado actual:

- operativo

Notas:

- hoy es el unico dominio que realmente ejecuta logica de negocio
- las variantes todavia se inspeccionan con cautela
- no conviene automatizar mapeos ambiguos de combinaciones hasta cerrar la
  regla de correspondencia

### 2. `categories`

Responsabilidad esperada:

- leer la clasificacion oficial desde SAP
- construir o actualizar la jerarquia en PrestaShop
- asociar productos a sus categorias correctas
- mantener categoria por defecto coherente

Estado actual:

- pendiente

Preguntas de negocio que faltan:

1. cual es la fuente exacta en SAP:
   - `ItmsGrpCod`
   - grupos de consulta `QryGroup*`
   - UDFs
   - una tabla propia del cliente
2. una categoria SAP se corresponde con una sola categoria PrestaShop o con
   varias?
3. que categoria debe ser la predeterminada cuando un producto cae en varias?

Implementacion recomendada:

1. construir lectura SAP solo para categorias
2. generar un reporte dry-run de mapeo
3. crear/arreglar jerarquia en PrestaShop
4. recien despues asociar productos

### 3. `orders`

Responsabilidad esperada:

- definir el rol de SAP respecto a pedidos
- sincronizar estados, tracking o documentos si aplica

Estado actual:

- en descubrimiento

Advertencia importante:

En muchos ecommerce, los pedidos nacen en PrestaShop y luego se reflejan en
SAP. Por eso este dominio no debe programarse a ciegas solo porque exista el
objetivo general de "SAP fuente de verdad".

Primero hay que aclarar si aqui significa:

- publicar estados desde SAP hacia PrestaShop
- publicar tracking
- reflejar facturacion
- crear pedidos en PrestaShop desde SAP
- o simplemente comparar ambos lados

## Regla operativa por defecto

Antes de habilitar escritura real en un dominio nuevo, el flujo recomendado es:

1. leer SAP
2. leer PrestaShop
3. comparar
4. producir plan de accion
5. generar reporte
6. habilitar escritura solo cuando el mapeo ya este validado

## Resultado esperado de cada dominio

Cada dominio debe poder devolver una estructura uniforme:

```json
{
  "key": "products",
  "reportRows": [],
  "summary": {
    "implemented": true,
    "processed": 0,
    "sourceOfTruth": "sap",
    "writesReports": true
  }
}
```

Esto permite que el programa:

- muestre el estado real por dominio
- sepa que dominios generan reportes
- crezca sin reescribir la orquestacion general

## Orden recomendado de implementacion

1. cerrar `products`
   - productos simples
   - precio
   - stock
   - altas confiables
   - variantes bien mapeadas
2. avanzar `categories`
   - lectura SAP
   - mapeo
   - dry-run
   - escritura real
3. recien despues cerrar `orders`
   - con definicion funcional validada por negocio

## Decision tecnica actual

El proyecto ya debe considerarse orientado a:

- orquestacion por dominios
- SAP como fuente de verdad
- dry-run antes de write
- trazabilidad por logs y reportes
- crecimiento incremental sin volver a una integracion monolitica
