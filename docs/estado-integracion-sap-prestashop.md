# Estado de la integracion SAP Business One - PrestaShop

## Proposito del documento

Prepare este documento para explicar lo que he podido identificar hasta ahora
sobre la integracion entre SAP Business One y PrestaShop. El levantamiento
continua en curso, por lo que separo los puntos confirmados de aquellos que
todavia necesito validar.

## Resumen ejecutivo

He confirmado que Almacenes Carballo dispone de una integracion personalizada que sincroniza
informacion desde SAP Business One hacia PrestaShop.

La solucion no forma parte del nucleo estandar de SAP ni de PrestaShop. Fue
desarrollada en .NET por un proveedor externo y se ejecuta en el servidor
Windows `ventasmoviles`, con direccion local `192.1.1.9`.

Con la evidencia recopilada pude confirmar que la aplicacion:

- Se conecta a SAP Business One sobre SAP HANA.
- Ejecuta una consulta SQL configurable para obtener articulos.
- Se conecta directamente al webservice de PrestaShop mediante una API key.
- Esta orientada a sincronizar articulos, precios y existencias.

Ademas, en el reemplazo Node.js propio ya deje preparada una arquitectura por
dominios para poder crecer desde este alcance inicial hacia:

- productos y variantes
- categorias
- pedidos

Tambien deje documentado el criterio de crecimiento con SAP como fuente de
verdad en:

```text
docs/arquitectura-fuente-de-verdad-sap.md
```

Hasta el momento no he encontrado evidencia de que esta aplicacion descargue pedidos,
clientes o pagos desde PrestaShop hacia SAP.

## Estado general

| Area | Estado |
|---|---|
| Aplicacion de configuracion | Localizada |
| Conexion con SAP HANA | Configurada |
| Conexion con PrestaShop | Probada exitosamente |
| Consulta de articulos | Localizada y configurable |
| Sincronizacion de productos | Evidencia confirmada |
| Sincronizacion de precios | Evidencia confirmada |
| Sincronizacion de existencias | Evidencia confirmada |
| Servicio automatico | Instalado, pero observado detenido |
| Logs de sincronizacion | Localizados; contenido pendiente de revision |
| Codigo fuente | No localizado |
| Repositorio e instalador | No localizados |
| Pedidos PrestaShop hacia SAP | Sin evidencia |
| Documentacion del proveedor | No localizada |

## Arquitectura identificada

```text
SAP Business One 10
        |
SAP HANA - BD_CARBALLO
        |
Consulta SQL configurable
        |
Servicio .NET personalizado
        |
PrestaSharp / RestSharp
        |
Webservice de PrestaShop
        |
Tienda en linea
```

### Infraestructura involucrada

#### Servidor Windows

- Nombre: `ventasmoviles`
- Direccion local: `192.1.1.9`
- Sistema operativo: Windows Server 2016 Standard
- Funcion: aloja herramientas SAP y los componentes de la integracion.

#### SAP

- Producto: SAP Business One 10
- Base de datos: SAP HANA
- Servidor observado: `hanab1`
- Puerto observado: `30013`
- Base empresarial: `BD_CARBALLO`

#### PrestaShop

- Conexion mediante webservice.
- Endpoint almacenado en configuracion.
- Autenticacion mediante API key.
- Una prueba visual confirmo que el webservice respondia correctamente.
- VPS: Ubuntu 24.04 LTS.
- Despliegue: Docker.
- PrestaShop: `1.7.8.7`.
- Base de datos: MariaDB `10.6`.
- Servidor web: Nginx como proxy y Apache/PHP en el contenedor.
- Ruta del sitio: `/var/www/carballo.com.do`.

Por seguridad, no incluyo en este documento contrasenas, usuarios sensibles ni
la API key.

## Componentes localizados

### Carpeta de configuracion

```text
C:\Users\Administrator\Desktop\Soluciones sap\Servicio
```

### Archivos principales

| Archivo | Funcion |
|---|---|
| `ConfigSapService.exe` | Interfaz grafica para configurar la integracion |
| `ConfigSapService.xml` | Conexion SAP, consulta de articulos y conexion PrestaShop |
| `Soluciones.sap.dll` | Logica SAP desarrollada por el proveedor |
| `SS.ServiceLayer.dll` | Capa propia relacionada con servicios SAP |
| `Bukimedia.PrestaSharp.dll` | Cliente .NET para el webservice PrestaShop |
| `RestSharp.dll` | Comunicacion HTTP/REST |
| `Newtonsoft.Json.dll` | Procesamiento de datos JSON |
| `Telerik.WinControls*.dll` | Interfaz grafica Windows |
| `ExcelDataReader*.dll` | Lectura de archivos Excel |
| `log\` | Registros de ejecucion |

La presencia del archivo `.pdb` y las modificaciones observadas entre abril y
junio de 2026 me indican que hubo compilaciones o cambios recientes. La copia
del configurador que esta en el escritorio es mas reciente que la instalada
con el servicio.

## Configuracion identificada

El archivo `ConfigSapService.xml` contiene esta estructura:

```text
ConfigSapService
|-- SAP_Server
|   |-- Servidor
|   |-- Database
|   |-- TipodeServidor
|   |-- LicenseService
|   |-- User
|   |-- Password
|   |-- UserSQL
|   |-- PassSQL
|   |-- Version
|   `-- QueryArticulos
`-- PrestaShop
    |-- Endpoint
    `-- APIKey
```

Los campos `UserSQL`, `PassSQL` y `LicenseService` aparecieron sin contenido
durante la inspeccion inicial. Esto no permite confirmar aun si la conexion
operativa utiliza DI API, Service Layer, un controlador HANA o una combinacion.

## Flujo de datos confirmado

La consulta observada utiliza tablas estandar de SAP Business One:

| Tabla | Informacion |
|---|---|
| `OITM` | Maestro de articulos |
| `ITM1` | Precios por lista |
| `OITW` | Existencias por almacen |

Se observaron campos relacionados con:

- Codigo del articulo.
- Nombre o descripcion.
- Grupos o clasificaciones.
- Precio.
- Almacen.
- Existencia disponible.

El unico flujo que he podido confirmar es:

```text
SAP → PrestaShop
```

## Servicio de Windows

Se localizo el servicio:

```text
SS_Servicio_SAP
```

Configuracion observada:

- Inicio: automatico.
- Estado cuando realice la revision: detenido.
- Cuenta de ejecucion: `VENTASMOVILES\Administrator`.
- Version informada: `1.0.0.6`.
- Ejecutable:
  `C:\Program Files\Soluciones Sap\SS_Servicio_SAP\SapService.exe`

Por el nombre y la ubicacion, considero probable que este servicio ejecute en
segundo plano la configuracion definida mediante `ConfigSapService.exe`.

### Causa confirmada de la detencion

En el registro de Windows encontre los eventos `7000` y `7038` del 12 de junio
de 2026. El servicio intento iniciar, pero Windows rechazo el inicio de sesion
porque la contrasena configurada para la cuenta `.\Administrator` es
incorrecta.

Por tanto, el servicio no esta detenido por un error confirmado de SAP o
PrestaShop. Actualmente no puede arrancar con la credencial de Windows que
tiene asignada.

Mi recomendacion es no cambiar la contrasena ni iniciar el servicio hasta
conocer:

- Que tarea ejecuta.
- Con que frecuencia trabaja.
- Si una ejecucion manual ya esta activa.
- Que impacto tendria una sincronizacion duplicada.
- Que permisos necesita realmente la cuenta del servicio.
- Si corresponde sustituir `Administrator` por una cuenta de servicio
  dedicada.

## Diferencias entre la instalacion y la copia de trabajo

Encontre dos copias del configurador:

| Ubicacion | Version | Fecha del ejecutable | Configuracion |
|---|---|---|---|
| `C:\Program Files\Soluciones Sap\SS_Servicio_SAP` | `1.0.0.6` | 2025-12-19 | XML de 916 bytes |
| `C:\Users\Administrator\Desktop\Soluciones sap\Servicio` | `1.0.0.6` | 2026-06-03 | XML de 1,410 bytes |

Aunque ambas muestran la version `1.0.0.6`, sus fechas y tamanos son
diferentes. Esto indica que el numero de version no se actualizo con los
cambios o que se manejan dos variantes de configuracion.

La carpeta instalada tambien contiene:

- `SapService.exe`, modificado el 4 de noviembre de 2025.
- `Carballo Excel.xlsx`, modificado el 28 de noviembre de 2025.
- Una carpeta `log`.

El archivo Excel y las dependencias `ExcelDataReader` indican que existe alguna
funcion de carga o procesamiento mediante Excel. Todavia no he confirmado si
forma parte de la sincronizacion regular.

Los logs mas recientes encontrados corresponden a `ConfigSapService.exe` en la
copia del escritorio y fueron generados el 15 de junio de 2026. Se observan
archivos creados aproximadamente cada minuto bajo un mismo identificador de
proceso, lo que sugiere que la aplicacion estuvo ejecutando una tarea manual o
temporizada durante la revision.

## Flujo confirmado mediante los logs

La lectura de un log del 15 de junio de 2026 permitio confirmar esta secuencia:

```text
Conexion con SAP
-> ejecucion de QueryArticulos
-> identificacion del producto en PrestaShop
-> lectura de combinaciones
-> actualizacion de precio de una combinacion
-> actualizacion del producto
-> repeticion del ciclo
```

El producto analizado se relaciona mediante:

- ID interno de producto en PrestaShop.
- Codigo o referencia del articulo en SAP.
- Referencia de la combinacion.

La aplicacion reconoce productos con combinaciones y actualiza al menos el
precio de una de ellas. En el caso observado, el ciclo completo se repitio
aproximadamente cada ocho o nueve segundos sobre el mismo articulo.

### Recursos y datos de PrestaShop observados

El XML registrado confirma el uso o lectura de:

- `products`
- `combinations`
- `stock_availables`
- categorias
- imagenes
- valores de opciones
- caracteristicas de producto
- grupo de reglas de impuestos

Tambien se observaron campos de nombre, URL amigable, referencia, estado,
visibilidad, disponibilidad para pedidos y precio.

### Error de categorias

PrestaShop devolvio un error HTTP 500 con codigo interno `85`:

```text
Error occurred while setting the categories value
```

Verifique directamente en la base de datos de PrestaShop que:

- La categoria `9518` existe.
- Esta activa.
- Pertenece a la tienda `1`.
- Su categoria padre `9510` tambien existe y esta activa.
- El producto `6512` esta asociado a la categoria.
- La categoria predeterminada del producto es `9518`.

Por tanto, el error no se debe a que la categoria falte o este desactivada.

En los registros del servidor encontre 370 solicitudes `PUT` al recurso de
productos durante el periodo revisado:

- 367 respondieron HTTP `200`.
- 3 respondieron HTTP `500`.

Los tres fallos ocurrieron de forma consecutiva entre las 15:07:50 y las
15:08:09 UTC del 15 de junio de 2026. Despues, las mismas actualizaciones
continuaron respondiendo correctamente.

Esto indica que:

- Existen reintentos, aunque no estan documentados.
- El fallo fue transitorio.
- Debo confirmar si la categoria realmente queda bien asignada despues del
  reintento.
- No se debe considerar exitoso todo el lote basandose solamente en el ultimo
  mensaje.

El metodo de PrestaShop que procesa las categorias elimina primero todas las
asociaciones del producto y luego vuelve a insertarlas. Al ejecutar esta
operacion repetidamente, cualquier fallo temporal en el borrado o la insercion
produce el error de categorias aunque la categoria sea valida.

### Exposicion de la API key en logs

El cliente PrestaSharp escribe la API key completa dentro del mensaje de error.
Por tanto, cualquier persona con acceso de lectura a la carpeta de logs puede
obtener acceso al webservice de PrestaShop con los permisos de esa clave.

Considero este hallazgo de prioridad alta. Recomiendo:

1. Rotar la API key expuesta.
2. Crear una clave dedicada para esta integracion con los permisos minimos.
3. Restringir el acceso NTFS a configuraciones y logs.
4. Evitar que la aplicacion registre credenciales en errores.
5. Revisar y proteger o eliminar de forma controlada los logs historicos que
   contengan la clave anterior.

La clave encontrada no se incorpora a este documento.

### Riesgo de ejecucion repetitiva

Durante el periodo analizado, la aplicacion consulto SAP y actualizo
repetidamente el mismo articulo cada ocho o nueve segundos.

Los registros de acceso de PrestaShop confirman que cada ciclo realiza:

```text
GET /api/products/6512
GET /api/combinations
PUT /api/combinations
PUT /api/products
```

La consulta SAP estaba filtrada deliberadamente al articulo `61072505`, por lo
que el ciclo procesaba siempre el mismo producto.

Pude confirmar que el bucle comienza al pulsar `Iniciar` en la aplicacion y
termina al pulsar `Detener`. No esta provocado por PrestaShop ni por un
reintento infinito del error HTTP 500. Es el comportamiento implementado por
el sincronizador.

La aplicacion tampoco parece comparar el valor actual con el valor recibido de
SAP antes de enviar el `PUT`. Incluso cuando el precio no cambia, vuelve a
escribir la combinacion y el producto completo.

Antes de habilitar el servicio de Windows debo confirmar esta frecuencia, ya
que podria generar carga innecesaria, bloqueos o limites en la API de
PrestaShop.

### Diagnostico actual del bucle

La causa principal es el diseno del cliente .NET:

1. El boton `Iniciar` activa un proceso continuo.
2. El intervalo esta definido dentro del ejecutable o de una DLL, no en el XML.
3. Cada iteracion vuelve a consultar SAP.
4. No existe evidencia de deteccion de cambios.
5. Se actualiza el objeto completo de PrestaShop, incluidas sus asociaciones.
6. Al repetirse cada pocos segundos, aumenta la probabilidad de errores
   transitorios y genera escrituras innecesarias.

La correccion debe realizarse en la aplicacion .NET o reemplazando ese proceso.
El comportamiento no se resuelve modificando la categoria `9518`.

## Principales hallazgos

1. La integracion es una solucion personalizada y depende del proveedor que
   genero las DLL y ejecutables.
2. La consulta SQL de articulos puede modificarse desde la configuracion.
3. Las credenciales SAP y la API key estan almacenadas localmente en un XML.
4. El servicio encargado de la automatizacion fue observado detenido.
5. No se ha localizado el codigo fuente, control de versiones ni instalador.
6. No existe todavia un procedimiento documentado de operacion o recuperacion.
7. No hay evidencia de sincronizacion de pedidos hacia SAP.
8. Hubo modificaciones recientes en los binarios, pero no existe historial de
   cambios disponible.

## Riesgos que considero prioritarios

### Continuidad operativa

Sin codigo fuente, instalador y documentacion, considero que una falla puede requerir la
intervencion del proveedor anterior.

### Credenciales

El XML contiene acceso SAP y una API key de PrestaShop. Debe revisarse:

- Quien puede leer el archivo.
- Si las claves estan cifradas.
- Quien es responsable de rotarlas.
- Si el proveedor conserva copias.

### Servicio detenido

Un servicio automatico detenido puede indicar:

- Falla de inicio.
- Detencion manual.
- Configuracion incompleta.
- Reemplazo por ejecucion manual.
- Dependencia ausente.

No considero prudente asumir que la sincronizacion automatica funciona solo porque
la prueba de conexion fue exitosa.

### Duplicidad

La interfaz permite iniciar y enviar procesos manualmente. Iniciar tambien el
servicio sin conocer su estado podria producir actualizaciones simultaneas o
duplicadas.

### Dependencia de consulta SQL

Cambios en tablas, campos, almacenes, listas de precios o reglas comerciales
pueden alterar lo publicado en la tienda.

## Proximos pasos que propongo

1. Rotar la API key expuesta en logs y limitar sus permisos.
2. Comparar la carpeta del configurador con la carpeta instalada del servicio.
3. Identificar la version y firma del ejecutable y las DLL propias.
4. Definir una cuenta y credencial correctas para `SS_Servicio_SAP`, despues
   de confirmar que no existe otra sincronizacion activa.
5. Identificar el mecanismo y frecuencia de ejecucion.
6. Documentar exactamente que campos se envian a PrestaShop y cuales se
   modifican.
7. Identificar los recursos usados en la API:
   `products`, `stock_availables`, `combinations`, categorias u otros.
8. Confirmar como se relaciona el codigo SAP con el identificador PrestaShop.
9. Verificar manejo de articulos nuevos, desactivados y sin existencia.
10. Buscar otras aplicaciones para pedidos, clientes o facturas.
11. Solicitar al proveedor codigo fuente, repositorio, instalador y manuales.
12. Crear una copia segura de configuracion y binarios, excluyendo secretos de
    la documentacion general.
13. Confirmar la frecuencia del ciclo y si existe deteccion de cambios.
14. Investigar el error de asignacion de categorias y validar el resultado
    final en la tienda.

## Avance del reemplazo propio

Como primer paso para un reemplazo controlado, cree una prueba en Node.js que
conecta directamente a SAP HANA con un usuario dedicado de solo lectura.

### Usuario HANA dedicado

- Usuario creado: `PS_SYNC`.
- Permiso otorgado: `SELECT` sobre el schema `BD_CARBALLO`.
- Objetivo: evitar usar el usuario funcional de SAP Business One `manager`.

### Puerto correcto

La prueba confirmo que el puerto operativo para el tenant donde esta
`BD_CARBALLO` es:

```text
hanab1:30015
```

El puerto `30013` respondia, pero no permitia autenticar este usuario para la
lectura esperada.

### Resultado de la prueba

El script Node pudo leer correctamente el articulo `61072505` desde SAP HANA:

| Campo | Valor observado |
|---|---|
| `ItemCode` | `61072505` |
| `ItemName` | `MANTEQUILLERA A/I 19cm. c/TAPA ACRILICO #VM1776 12/1` |
| Precio | `4013.568000` |
| Almacen | `AC01` |
| Existencia | `51.999800` |
| Codigo de barras | `17466254284991` |
| Estado | `Y` |

Esto confirma que ya existe una base tecnica para construir un sincronizador
propio sin depender del ejecutable actual.

### Evolucion de arquitectura del reemplazo

Al 2026-06-17, el reemplazo Node.js dejo de depender de una sola orquestacion
monolitica y paso a una seleccion de dominios:

```text
products
categories
orders
```

Estado actual de esos dominios:

| Dominio | Estado |
|---|---|
| `products` | operativo |
| `categories` | preparado como placeholder |
| `orders` | preparado como placeholder |

Fuente de verdad definida para esta arquitectura:

| Dominio | Fuente de verdad |
|---|---|
| `products` | SAP |
| `categories` | SAP |
| `orders` | objetivo SAP, pendiente de confirmacion funcional |

La idea es que SAP siga siendo la fuente de verdad, pero sin meter toda la
logica futura de categorias y pedidos dentro del mismo flujo que hoy actualiza
productos.

El siguiente paso debe ser consultar PrestaShop en modo solo lectura usando la
referencia SAP, comparar valores y registrar diferencias sin escribir cambios.

## Mi evaluacion actual

He identificado la integracion y localizado sus componentes principales. La
conectividad con PrestaShop y la configuracion SAP existen, pero la
sincronizacion mediante el servicio de Windows no esta operativa: falla al
iniciar porque la credencial de `Administrator` configurada en el servicio es
incorrecta.

Esto no descarta que alguien este ejecutando la sincronizacion manualmente
desde `ConfigSapService.exe`. Los logs recientes de la copia del escritorio
indican actividad manual el 15 de junio de 2026.

### Proceso manual observado

El 15 de junio de 2026 identifique una instancia activa con estos datos:

| Elemento | Valor |
|---|---|
| Proceso | `ConfigSapService.exe` |
| PID | `10528` |
| Inicio | 2026-06-15 12:02:22 |
| Ruta | `C:\Users\Administrator\Desktop\Soluciones sap\Servicio\ConfigSapService.exe` |
| Ventana | `FrmConfig` |
| Memoria observada | Aproximadamente 225 MB |

Esto confirma que la aplicacion se estaba ejecutando manualmente desde la copia
del escritorio. No demuestra por si solo que la tarea de sincronizacion
estuviera activa durante todo ese tiempo, porque la interfaz puede permanecer
abierta con la tarea detenida.

Los nombres de logs que incluyen `pid10528` permiten relacionar los registros
generados con esta instancia concreta.

El siguiente objetivo tecnico es demostrar una ejecucion completa:

```text
Lectura SAP
→ transformacion
→ llamada a PrestaShop
→ respuesta de la API
→ registro de resultado
```

Cuando complete esa verificacion podre establecer con mayor precision el
estado real, los errores actuales y el esfuerzo necesario para mantener o
reemplazar la solucion.

## 14. Estado del reemplazo Node.js al 2026-06-16

Ademas del levantamiento sobre la solucion .NET existente, avance en un
reemplazo controlado en Node.js para independizar la sincronizacion del
proveedor anterior.

### Ubicacion del proyecto

Repositorio Git:

```text
MSoftIA/sap-sync-ps
```

Ruta local del repositorio de trabajo:

```text
C:\Users\Administrator\Desktop\msoftia\sap-sync-ps
```

### Que ya hace este reemplazo

- Conecta directamente a SAP HANA.
- Lee articulos desde `BD_CARBALLO`.
- Busca productos por referencia en PrestaShop.
- Lee producto, combinaciones y stock.
- Genera reportes JSON y CSV por corrida.
- Puede ejecutar escrituras reales cuando `SYNC_WRITE=true`.

### Conexion HANA confirmada

El reemplazo ya valida conexion con:

```text
hanab1:30015
```

Usuario dedicado:

```text
PS_SYNC
```

El objetivo de este usuario es consultar SAP HANA con permisos de solo
lectura, sin depender del usuario funcional `manager`.

### Estado de la escritura real en PrestaShop

Se confirmaron tres fases claras durante la depuracion:

1. `PATCH` no era aceptado por esta instalacion de PrestaShop.
2. Al pasar a `PUT`, las actualizaciones de stock comenzaron a funcionar.
3. La creacion de productos nuevos ya no siempre falla, pero varios productos
   quedaron creados en estado inconsistente.
4. El 2026-06-16 aplique un parche defensivo en la VPS de PrestaShop sobre
   `classes/Product.php` para que el webservice no rompa cuando un producto no
   tiene imagen cover asociada.

### Funcionalidad ya confirmada

Los `PUT` de `stock_available` ya funcionan en varios casos. En consola se
observaron multiples mensajes:

```text
Accion aplicada en PrestaShop
action: update_product_stock
```

Por tanto, a esta fecha puedo afirmar que el reemplazo propio ya es capaz de
actualizar existencias en PrestaShop para varios productos simples.

### Problemas aun abiertos

#### 1. Actualizacion de precio

Los cambios de precio todavia presentan fallos intermitentes por campos no
escribibles del XML completo del producto.

Errores confirmados durante la depuracion:

- `parameter "manufacturer_name" not writable`
- `parameter "quantity" not writable`

Estos mensajes confirman que la API rechaza ciertos nodos del XML si se envian
de vuelta mediante `PUT`.

#### 2. Productos creados pero no sanos

Durante la prueba del reemplazo propio, varios productos que no existian en
PrestaShop pasaron a existir, lo que demuestra que la creacion ya llega a
ejecutarse.

Sin embargo, al intentar leerlos de nuevo, algunos responden:

```text
HTTP 500
PHP Notice #8
Trying to access array offset on value of type bool
/var/www/html/classes/Product.php line 7184
```

La causa confirmada ya no apunta solamente a una estructura incompleta del
producto. Tambien existia un problema en el propio webservice de esta
instalacion: el metodo `getCoverWs()` asumia siempre la existencia de imagen
cover y devolvia un PHP Notice cuando no la encontraba.

Ese punto ya fue corregido directamente en la VPS con un retorno defensivo:

```php
if (!$result || !isset($result['id_image'])) {
    return 0;
}
```

Ademas, en el reemplazo Node.js agregue recuperacion post-alta: si PrestaShop
responde HTTP 500 despues de crear el producto, el script vuelve a buscarlo por
referencia para confirmar si la alta realmente ocurrio.

#### 3. Revision pendiente sobre productos "rotos"

Estos IDs deben tratarse con cuidado porque parecen haber sido creados por el
nuevo proceso, pero no se comportan como productos sanos al consultarlos:

- `6515`
- `6516`
- `6517`
- `6518`
- `6519`
- `6520`
- `6521`
- `6522`
- `6523`
- `6524`
- `6525`
- `6526`
- `6527`
- `6528`
- `6529`
- `6530`
- `6531`
- `6532`
- `6533`
- `6534`
- `6535`

No recomiendo borrarlos manualmente todavia sin definir primero:

- como distinguirlos de productos historicos validos
- como recrearlos correctamente
- que dependencias de categoria, tienda o asociaciones les faltan

### Resumen operativo del reemplazo

| Capacidad | Estado actual |
|---|---|
| Lectura SAP HANA | Funciona |
| Lectura PrestaShop | Funciona y quedo reforzada con parche en webservice |
| Actualizacion de stock | Funciona en varios productos |
| Actualizacion de precio | Parcial, todavia en ajuste |
| Creacion de producto nuevo | Parcial, con recuperacion post-error ya implementada |
| Manejo de combinaciones | Solo inspeccion y comparacion |
| Reparacion de productos invalidos | Pendiente |

### Siguiente linea de trabajo recomendada

1. Terminar de estabilizar el `PUT` de producto para cambios de precio.
2. Definir una rutina para reparar o recrear productos dados de alta en estado
   inconsistente.
3. Mantener las combinaciones fuera de automatizacion agresiva hasta confirmar
   el mapeo correcto.

### Documentacion de continuidad

Para entregar este estado a otra IA o a otro tecnico, deje un documento
especifico de handoff en:

```text
docs/handoff-ia-sap-prestashop.md
```

Ese archivo resume entorno, query SAP, comportamiento de la API, errores
confirmados, decisiones tecnicas ya tomadas y los siguientes pasos propuestos.
