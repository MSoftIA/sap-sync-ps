# Estado de la integracion SAP Business One - PrestaShop

## Proposito

Este documento resume dos cosas distintas que conviven hoy:

1. la integracion historica en .NET dejada por el proveedor anterior
2. el reemplazo propio en Node.js que ya esta en construccion y operacion

## Resumen ejecutivo

La integracion historica sigue existiendo, pero el proyecto actual ya no gira
alrededor de ella. El reemplazo Node.js ya tiene una base operativa real:

- lee SAP HANA
- lee PrestaShop
- compara catalogo
- genera reportes
- puede ejecutar sync real de productos simples
- expone un panel web para operar y observar el proceso

La situacion hoy se puede resumir asi:

| Componente | Estado |
|---|---|
| Integracion historica .NET | localizada y documentada |
| Servicio Windows del proveedor | instalado, pero no es la base del proyecto actual |
| Reemplazo Node.js | operativo |
| Dominio `products` | activo |
| Dominio `categories` | diagnostico operativo |
| Dominio `orders` | discovery |

## 1. Integracion historica del proveedor

### Componentes confirmados

Ruta principal observada:

```text
C:\Users\Administrator\Desktop\Soluciones sap\Servicio
```

Archivos relevantes:

- `ConfigSapService.exe`
- `ConfigSapService.xml`
- `Soluciones.sap.dll`
- `SS.ServiceLayer.dll`
- `Bukimedia.PrestaSharp.dll`
- `RestSharp.dll`
- carpeta `log`

### Flujo confirmado

La integracion historica:

- se conecta a SAP Business One / HANA
- usa una query configurable para articulos
- consume el webservice de PrestaShop
- trabaja principalmente sobre productos, precio y existencias

### Lo importante para hoy

Ese sistema sirve como referencia y como fuente de contexto, pero ya no es la
pieza central del proyecto nuevo.

## 2. Reemplazo Node.js actual

## Objetivo funcional

```text
SAP Business One / HANA -> PrestaShop
```

Con SAP como fuente de verdad, primero para productos.

## Estado real por dominios

### `products`

Estado:

- activo

Capacidad actual:

- lectura SAP
- lectura PrestaShop
- deteccion de altas faltantes
- actualizacion de precio
- actualizacion de stock
- altas de productos simples
- reportes de corrida
- log en tiempo real por SSE

Restriccion clave:

- combinaciones siguen en revision, no en automatizacion agresiva

### `categories`

Estado:

- diagnostico operativo

Capacidad actual:

- lectura de grupo principal desde `OITB`
- traduccion de `QryGroup*` usando `OITG`
- snapshot de diagnostico
- resumen visible en el panel

Todavia no hace:

- no crea categorias
- no reasigna productos en PrestaShop

### `orders`

Estado:

- discovery

Capacidad actual:

- lectura de resumen de `ORDR`
- volumen total
- abiertos, cerrados, cancelados
- actividad ultimos 7 y 30 dias

Todavia no hace:

- no sincroniza pedidos ni estados con PrestaShop

## 3. Conexion y tablas SAP ya validadas

Conexion operativa usada por el proyecto:

```text
hanab1:30015
schema: BD_CARBALLO
```

Tablas activas hoy:

### Productos

- `OITM`
- `ITM1`
- `OITW`

### Categorias

- `OITB`
- `OITG`

### Pedidos

- `ORDR`

Tabla ya identificada para la siguiente etapa de pedidos:

- `RDR1`

## 4. Panel web actual

El proyecto ya tiene panel web React servido por Express.

Vistas actuales:

- `Sync`
- `SAP`
- `PrestaShop`

### Vista `Sync`

Pensada para operar la sync:

- corrida masiva
- corrida puntual
- seleccion de dominios
- modo dry run / write
- progreso
- log
- historial

### Vista `SAP`

Pensada para leer la fuente de verdad:

- total de productos
- activos
- stock total
- detalle de catalogo

### Vista `PrestaShop`

Pensada para contraste y control:

- total de productos
- brecha contra SAP
- lookup por referencia
- activar / desactivar producto puntual

## 5. Estado de escritura real

Hoy el proyecto puede ejecutar cambios reales cuando:

```text
SYNC_WRITE=true
```

Acciones soportadas:

- `create_product`
- `update_product_price`
- `update_product_stock`
- `update_product_price_and_stock`

No todos los casos se escriben. El sistema deja en revision los escenarios que
no son confiables, especialmente en combinaciones.

## 6. Reportes actuales

El dominio `products` genera:

- `*.summary.json`
- `*.rows.json`
- `*.rows.csv`

Estos reportes incluyen:

- cantidad de altas
- cantidad de updates
- cantidad de casos sin cambio
- cantidad de revisiones
- errores
- acciones ejecutadas

El dominio `categories` ya genera snapshots de diagnostico propios.

## 7. Rendimiento y cuello de botella

El proyecto ya no esta en etapa de “conectar a SAP”. Ese problema esta
resuelto.

El cuello de botella principal hoy es PrestaShop:

- lectura por webservice
- fan-out por producto
- detalle de combinaciones
- cantidad de requests necesarias para sync masiva

### Mejora ya aplicada

El backend ya precarga un snapshot de PrestaShop con:

- `products`
- `stock_availables`

Eso redujo la necesidad de consultar por referencia una y otra vez durante la
corrida masiva del dominio `products`.

## 8. Diferencias entre documentacion vieja y realidad actual

Puntos que ya no representan bien el proyecto:

- ya no es solo un script CLI
- ya no existe una sola pantalla mezclando todo
- el proyecto ya esta separado por dominios
- `categories` ya no esta “pendiente”, sino en diagnostico operativo
- `orders` ya no es un placeholder vacio: tiene lectura de resumen SAP

## 9. Riesgos abiertos

1. combinaciones aun necesitan una regla mas robusta
2. `categories` requiere definicion ecommerce antes de escribir
3. `orders` requiere definicion funcional antes de sincronizar
4. PrestaShop sigue siendo el costo principal en corridas masivas
5. la integracion historica del proveedor sigue siendo una dependencia de
   contexto, aunque ya no del codigo actual

## 10. Proximos pasos recomendados

1. mejorar observabilidad del sync masivo
2. acelerar el dominio `products`
3. convertir `categories` en un dominio con plan de accion
4. definir funcionalmente `orders`
5. mantener la documentacion alineada con el estado real del panel y del
   backend
