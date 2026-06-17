# Arquitectura objetivo: SAP como fuente de verdad

## Objetivo

La direccion funcional del proyecto queda definida asi:

```text
SAP Business One / HANA -> PrestaShop
```

La idea no es hacer una sync opaca, sino una operacion:

- auditable
- separada por dominios
- con dry run antes de write
- con reportes y trazabilidad

## Dominios funcionales

El programa ya esta organizado por dominios.

## 1. `products`

### Responsabilidad

- crear productos faltantes en PrestaShop
- actualizar precio
- actualizar stock
- decidir cuando un caso queda en revision
- comparar combinaciones sin automatizar mapeos ambiguos

### Estado actual

- activo

### Capacidad actual

- lectura SAP operativa
- lectura PrestaShop operativa
- sync real de productos simples
- creacion de productos simples
- actualizacion de precio y stock
- reportes operativos por corrida

### Restricciones actuales

- combinaciones siguen en modo de revision
- si la referencia o el match no es claro, el sistema no fuerza write

## 2. `categories`

### Responsabilidad esperada

- leer la clasificacion oficial desde SAP
- diagnosticar jerarquia y categorias candidatas
- crear o alinear categorias en PrestaShop
- asociar productos a categoria principal y secundarias

### Estado actual

- diagnostico operativo

### Capacidad actual

- lee `OITB` como grupo principal
- lee `OITG` para traducir `QryGroup*`
- genera snapshot y reporte propio
- publica resumen en el panel

### Lo que aun no hace

- no crea categorias en PrestaShop
- no reasigna productos
- no define todavia una jerarquia ecommerce final

### Preguntas de negocio pendientes

1. si `ItmsGrpCod` alcanza como categoria principal
2. si `QryGroup*` deben convertirse en categorias, atributos o filtros
3. como decidir categoria por defecto cuando SAP expone varias clasificaciones

## 3. `orders`

### Responsabilidad esperada

- aclarar el rol real de SAP respecto a pedidos
- eventualmente publicar estados, tracking o reflejo comercial

### Estado actual

- discovery

### Capacidad actual

- el proyecto ya lee resumen operativo de `ORDR`
- el panel ya muestra volumen, abiertos, cerrados, cancelados y ultima fecha

### Lo que aun no hace

- no crea pedidos
- no actualiza estados
- no refleja tracking
- no mueve informacion hacia PrestaShop

### Advertencia importante

Este es el dominio mas sensible a una mala suposicion.

En muchos ecommerce:

```text
PrestaShop crea el pedido
SAP lo recibe o lo procesa
SAP luego devuelve estado o tracking
```

Por eso aqui no conviene programar “SAP manda” sin una definicion funcional del
negocio.

## Regla operativa por defecto

Antes de habilitar escritura real en un dominio nuevo, el orden sigue siendo:

1. leer SAP
2. leer PrestaShop
3. comparar
4. proponer plan de accion
5. generar reporte
6. habilitar write solo cuando el mapeo sea confiable

## Contrato comun por dominio

Cada dominio devuelve una estructura uniforme:

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

Esto permite:

- que el backend orqueste dominios distintos
- que el panel pueda mostrar el estado de cada uno
- que el proyecto crezca sin volver a una sola sync monolitica

## Orquestacion actual

La orquestacion vive en:

- `src/app.js`
- `src/sync-domains.js`

El registro hoy es:

| Dominio | `status` | `writesReports` |
|---|---|---|
| `products` | `active` | `true` |
| `categories` | `diagnostic` | `false` |
| `orders` | `discovery` | `false` |

## Orden recomendado de implementacion

1. seguir cerrando `products`
   - observabilidad
   - performance
   - variantes mas confiables
2. pasar `categories` de diagnostico a write
   - jerarquia
   - mapping SAP -> PrestaShop
   - categoria principal
3. definir funcionalmente `orders`
   - recien despues escribir codigo de sync

## Decision tecnica vigente

El proyecto ya debe considerarse alineado con estas reglas:

- SAP como fuente de verdad principal
- dominios separados
- dry run antes de write
- panel para operacion
- reportes para trazabilidad
- crecimiento incremental en lugar de reescrituras opacas
