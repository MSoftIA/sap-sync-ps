# Resumen del trabajo realizado

## Objetivo

El objetivo de este trabajo fue empezar a entender y documentar el entorno que
utiliza Almacenes Carballo para SAP Business One, PrestaShop y sus
integraciones, porque el cliente no tenia visibilidad clara de como estaba
armado ni que dependia del proveedor anterior.

El foco principal fue la integracion SAP Business One -> PrestaShop, aunque
durante el levantamiento tambien aparecieron otros sistemas y tareas que
conviene dejar documentados.

## Alcance de la revision

Hasta ahora revise informacion de solo lectura en el servidor Windows
`ventasmoviles` y en archivos/logs relacionados con las integraciones. Tambien
avance en un reemplazo controlado en Node.js para validar que podemos leer SAP
HANA y comparar contra PrestaShop sin depender del ejecutable del proveedor.

No se debe asumir todavia que la infraestructura pertenece fisicamente al
cliente. Lo confirmado es que el entorno contiene datos y sistemas utilizados
por Almacenes Carballo. La titularidad de servidores, licencias, hosting,
credenciales y codigo fuente todavia debe confirmarse contractual y
operativamente.

## Infraestructura identificada

### Servidor Windows

Se identifico el servidor:

```text
ventasmoviles
IP local: 192.1.1.9
Windows Server 2016 Standard
```

Este servidor funciona como punto administrativo y de integraciones. Tiene:

- SAP Business One Client.
- SAP HANA Studio.
- SAP Business One Integration.
- SAP DI API y SDK.
- IIS y FTP.
- RabbitMQ.
- Bavel o componentes relacionados.
- MobaXterm.
- AnyDesk y Zoho Assist.
- Herramientas de integracion desarrolladas por terceros.

Tambien se confirmo que es una maquina virtual VMware, pero falta identificar
el host fisico, responsable del hipervisor y esquema de respaldos.

### Servidor SAP HANA

Desde `ventasmoviles` se confirmo conectividad hacia:

```text
hanab1
IP local: 192.1.1.149
```

El puerto HANA `30013` responde desde `ventasmoviles`, y para el reemplazo
Node.js se valido lectura efectiva contra:

```text
hanab1:30015
Schema: BD_CARBALLO
```

Esto confirma que SAP HANA no esta dentro de la computadora Windows
`ventasmoviles`, sino en otro servidor de la misma red. Lo que todavia no se
ha confirmado es si ese servidor esta en instalaciones del cliente, del
proveedor o en infraestructura alojada por un tercero.

## Integracion historica SAP - PrestaShop

Se localizo una aplicacion .NET personalizada usada para sincronizar SAP con
PrestaShop:

```text
C:\Users\Administrator\Desktop\Soluciones sap\Servicio
```

Componentes relevantes:

- `ConfigSapService.exe`
- `ConfigSapService.xml`
- `Soluciones.sap.dll`
- `SS.ServiceLayer.dll`
- `Bukimedia.PrestaSharp.dll`
- `RestSharp.dll`
- `Telerik.WinControls*.dll`
- carpeta `log`

La aplicacion usa una configuracion XML con:

- servidor SAP
- base de datos
- usuario y password SAP
- version de SAP
- `QueryArticulos`
- endpoint PrestaShop
- API key de PrestaShop

Esto confirma que la integracion lee informacion de SAP y actualiza
PrestaShop mediante webservice. La consulta observada trabaja principalmente
con articulos, precios y existencias.

No se encontro evidencia de que esta aplicacion sincronice pedidos, clientes o
facturas desde PrestaShop hacia SAP.

## Servicio del proveedor

Se identifico el servicio:

```text
SS_Servicio_SAP
```

Ruta:

```text
C:\Program Files\Soluciones Sap\SS_Servicio_SAP\SapService.exe
```

Estado observado:

- configurado como automatico
- detenido
- asignado a `VENTASMOVILES\Administrator`

En eventos de Windows se encontro que el servicio no inicia porque la
contrasena configurada para esa cuenta es incorrecta. Por tanto, el servicio
automatico no parece operativo actualmente.

No recomiendo iniciarlo ni corregir la credencial sin entender primero si hay
otra instancia manual activa, ya que podria duplicar sincronizaciones contra
PrestaShop.

## Comportamiento observado de la integracion

Los logs de la aplicacion .NET permitieron confirmar un ciclo como este:

```text
Conexion con SAP
-> ejecucion de QueryArticulos
-> busqueda/lectura de producto en PrestaShop
-> lectura de combinaciones
-> actualizacion de precio o datos
-> actualizacion del producto
-> escritura en logs
```

Tambien se observo que, al presionar `Iniciar`, la aplicacion puede ejecutar
un bucle continuo que procesa el mismo articulo cada pocos segundos. En el
caso revisado, la consulta estaba filtrada al articulo `61072505`.

Esto es importante porque no parece haber deteccion de cambios antes de enviar
actualizaciones. Aunque el valor no cambie, el sistema puede volver a escribir
el producto completo en PrestaShop.

## Hallazgos sobre PrestaShop

Se confirmo que PrestaShop esta disponible por webservice y que la integracion
lo consume usando API key.

Tambien se identifico el entorno de la tienda:

- PrestaShop `1.7.8.7`.
- MariaDB `10.6`.
- Docker.
- Nginx como proxy.
- Apache/PHP dentro del contenedor.
- Ruta observada: `/var/www/carballo.com.do`.

Durante la revision se detectaron errores transitorios al actualizar
categorias en PrestaShop. El error observado fue HTTP `500` con codigo interno
`85`:

```text
Error occurred while setting the categories value
```

La categoria involucrada existia, estaba activa y pertenecia a la tienda
correcta. Esto apunta mas a un problema del proceso de actualizacion o a un
fallo transitorio que a una categoria inexistente.

Tambien se confirmo que la API key de PrestaShop aparece completa dentro de
algunos logs generados por la aplicacion .NET. Esto es un riesgo importante:
la clave debe rotarse y los logs historicos deben tratarse como informacion
sensible.

## Otros sistemas encontrados

### B1ReportSender

Se localizo una aplicacion separada:

```text
C:\Task\Envio masivo (B1ReportSender)
```

Esta aplicacion genera y envia estados de cuenta usando datos de SAP HANA y
Crystal Reports. Tiene tareas programadas semanales.

Problema confirmado:

- usa `mail.smtp2go.com`
- los envios fallan porque la cuenta SMTP autenticada no tiene permiso para
  enviar
- las tareas terminan con codigo `1`

Este sistema no es la prioridad principal, pero queda documentado porque es
otra dependencia operativa del entorno.

### Accesos remotos

Ademas de AnyDesk, se encontro Zoho Assist desatendido. Tambien estan activos
RDP y WinRM a nivel de servicio. Esto requiere revisar quienes tienen acceso,
quien administra esas cuentas y si existe historial de conexiones.

## Aclaracion importante sobre propiedad y control

No se puede afirmar todavia que SAP, HANA, los servidores o las licencias sean
propiedad directa del cliente.

Lo correcto es decir:

```text
Se identifico un entorno SAP Business One utilizado para la operacion de
Almacenes Carballo, compuesto al menos por ventasmoviles y hanab1.
No se ha confirmado la titularidad, ubicacion fisica ni control contractual de
esta infraestructura.
```

Posibles escenarios:

1. Infraestructura del cliente administrada por el proveedor.
2. Infraestructura del proveedor dedicada al cliente.
3. Infraestructura compartida del proveedor.
4. Infraestructura alquilada a un tercero.

Esto debe aclararse con contratos, licencias, accesos administrativos,
respaldos y titularidad del hosting.

## Reemplazo propio en Node.js

Ademas del levantamiento, se empezo a construir un reemplazo controlado:

```text
Repositorio: carballo.com.do
Tecnologia: Node.js
Objetivo: SAP HANA -> PrestaShop
```

El proyecto ya tiene:

- lectura desde SAP HANA usando `@sap/hana-client`
- usuario dedicado `PS_SYNC`
- lectura de productos y stock desde PrestaShop
- comparacion de datos
- reportes JSON y CSV
- modo seguro `dry-run`
- modo escritura controlado por `SYNC_WRITE=true`
- panel web Express para revisar informacion agregada

Lectura HANA confirmada:

```text
hanab1:30015
Schema: BD_CARBALLO
Usuario: PS_SYNC
```

Producto validado desde SAP:

```text
ItemCode: 61072505
Almacen: AC01
Precio observado: 4013.568000
Existencia observada: 51.999800
```

## Estado tecnico del reemplazo

### Funciona

- Conectar a SAP HANA.
- Leer articulos desde `BD_CARBALLO`.
- Buscar productos por referencia en PrestaShop.
- Leer productos, combinaciones y stock.
- Generar reportes.
- Actualizar stock en PrestaShop en varios casos.

### Parcial

- Actualizacion de precio.
- Creacion de productos nuevos.
- Recuperacion de productos creados cuando PrestaShop responde error.

### Pendiente o riesgoso

- Manejo de combinaciones.
- Reparacion de productos creados en estado inconsistente.
- Definir payload minimo y estable para `PUT` de productos.
- Evitar escribir campos no permitidos por PrestaShop.

Errores confirmados en PrestaShop durante escritura:

- `PATCH` no esta soportado.
- `manufacturer_name` no es escribible.
- `quantity` no es escribible en el XML de producto.
- algunos productos nuevos devolvian HTTP 500 por falta de imagen cover.

Se aplico un parche defensivo en `Product.php` para que PrestaShop no falle
cuando un producto no tiene imagen cover. Ese cambio debe conservarse o
reaplicarse si se actualiza o reemplaza el contenedor.

## Riesgos principales

1. No se tiene todavia codigo fuente ni instalador del integrador .NET del
   proveedor.
2. La API key de PrestaShop quedo expuesta en logs.
3. El servicio automatico del proveedor esta detenido por credencial invalida.
4. No se sabe aun si el cliente controla servidores, licencias y respaldos.
5. El integrador actual puede escribir repetidamente sobre PrestaShop sin
   detectar cambios.
6. Hay productos nuevos creados por pruebas que podrian estar incompletos.
7. IIS, FTP, RDP, WinRM, AnyDesk y Zoho Assist amplian la superficie de acceso.
8. El servidor tiene poco espacio disponible en algunas unidades.

## Documentos generados

Durante este trabajo se generaron tres documentos principales:

- `docs/inventario-entorno.md`
- `docs/estado-integracion-sap-prestashop.md`
- `docs/handoff-ia-sap-prestashop.md`

Este archivo resume los tres en un formato mas compacto para explicar el
avance general.

## Proximos pasos recomendados

1. Rotar la API key de PrestaShop y crear una clave dedicada con permisos
   minimos.
2. Pedir al proveedor codigo fuente, instalador, documentacion y diagrama de
   la integracion actual.
3. Confirmar titularidad y acceso a:
   - SAP Business One
   - licencias
   - HANA
   - servidores o VMs
   - VMware
   - hosting PrestaShop
   - respaldos
4. No activar `SS_Servicio_SAP` hasta confirmar que no existe otra ejecucion
   manual activa.
5. Terminar de estabilizar el reemplazo Node.js para:
   - actualizar stock
   - actualizar precio
   - crear productos sanos
   - manejar productos existentes con combinaciones
6. Revisar y reparar productos creados en estado inconsistente.
7. Crear un procedimiento documentado de operacion, respaldo y recuperacion.

## Conclusion

El entorno ya esta mucho mas claro que al inicio. SAP Business One y HANA
existen como parte del entorno usado por Carballo, pero la integracion con
PrestaShop depende de software .NET del proveedor anterior y no se cuenta aun
con codigo fuente ni documentacion suficiente.

El reemplazo propio en Node.js ya demostro que es posible leer directamente
desde SAP HANA y actualizar stock en PrestaShop. Todavia falta estabilizar
precio, altas de productos y combinaciones antes de considerarlo listo para
produccion.

La prioridad inmediata es reducir riesgos: proteger credenciales, confirmar
propiedad y accesos, y continuar el reemplazo de forma controlada sin activar
procesos duplicados.
