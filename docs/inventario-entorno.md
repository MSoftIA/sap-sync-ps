# Levantamiento tecnico del entorno de Almacenes Carballo

## Objetivo

Estoy realizando este levantamiento para documentar gradualmente la
infraestructura que utiliza Almacenes Carballo, entender que sistemas dependen
de ella y reducir la dependencia del proveedor que la administraba
anteriormente.

En esta primera etapa me he limitado a consultar informacion. No he detenido
servicios, cambiado configuraciones ni ejecutado procesos de negocio.

## Estado del documento

- Cliente: Almacenes Carballo SRL
- Fecha inicial del levantamiento: 2026-06-15
- Metodo de acceso observado: AnyDesk
- Alcance actual: servidor Windows `ventasmoviles`
- Modalidad: levantamiento de solo lectura
- Prioridad principal: integracion SAP Business One - PrestaShop

## 1. Servidor Windows confirmado

| Elemento | Valor |
|---|---|
| Nombre del equipo | `ventasmoviles` |
| Sistema operativo | Windows Server 2016 Standard, 64 bits |
| Usuario observado | `ventasmoviles\administrator` |
| Dominio | No pertenece a dominio |
| Grupo de trabajo | `WORKGROUP` |
| Direccion IPv4 | `192.1.1.9` |
| Memoria fisica | Aproximadamente 8 GB |

### Mi interpretacion inicial

Por lo que he podido comprobar, el equipo funciona como un servidor Windows
independiente dentro de la red local y no esta unido a Active Directory.
Ademas de ser el punto al que ingresamos mediante AnyDesk, presta servicios
web, FTP y de archivos.

## 2. Almacenamiento

Valores aproximados calculados a partir de la informacion obtenida:

| Unidad | Etiqueta | Capacidad | Disponible | Uso aproximado |
|---|---|---:|---:|---:|
| `C:` | Sin etiqueta | 249.5 GiB | 35.1 GiB | 86% |
| `E:` | System | 250.0 GiB | 83.6 GiB | 67% |
| `F:` | Navision | 68.3 GiB | 38.5 GiB | 44% |
| `G:` | Backup | 279.4 GiB | 45.6 GiB | 84% |
| `D:` | Sin identificar | 0 | 0 | Posible unidad optica o desmontada |
| Sin letra | Recovery | 450 MiB | 135 MiB | Particion de recuperacion |

### Observaciones

- La unidad `F:` sugiere que el servidor aloja o alojo componentes relacionados
  con Microsoft Dynamics NAV/Navision.
- La unidad `G:` esta identificada como respaldo, pero todavia no se ha
  confirmado que contenido guarda, quien lo genera ni si existe una copia
  externa.
- Las unidades `C:` y `G:` tienen poco margen libre y deben vigilarse.

## 3. Roles y caracteristicas instaladas

### Roles principales

- File Server
- Web Server (IIS)
- FTP Server
- IIS Management Console

### Componentes de aplicacion

- .NET Framework 3.5
- .NET Framework 4.6
- WCF TCP Port Sharing
- Compatibilidad de aplicaciones de 32 bits (`WoW64`)

### Componentes heredados que requieren revision

- SMB 1.0/CIFS
- Windows PowerShell 2.0 Engine

Mi recomendacion es no deshabilitarlos todavia. Antes debo identificar si
alguna aplicacion antigua depende de ellos.

## 4. Arquitectura conocida hasta ahora

```text
Acceso del tecnico
        |
      AnyDesk
        |
Windows Server: ventasmoviles (192.1.1.9)
        |
        +-- SAP Business One Client
        +-- Sincronizador SAP - PrestaShop
        +-- SAP HANA Studio
        +-- MobaXterm / SSH
        +-- IIS y FTP
        +-- Posibles recursos Navision
        |
        +-- SSH --> hanab1 (Linux)
                       |
                       +-- SAP HANA
                       +-- Base BD_CARBALLO
```

## 5. Preguntas que quedan por responder

- Que sitios y aplicaciones publica IIS.
- Que usuarios, carpetas y puertos utiliza FTP.
- Que contiene la unidad `F:\` etiquetada `Navision`.
- Que contiene `G:\Backup` y como se validan esos respaldos.
- Donde esta instalado el sincronizador SAP-PrestaShop.
- Como se inicia y programa el sincronizador.
- Que servicios y tareas dependen del proveedor anterior.
- Quien administra AnyDesk, red, firewall, SAP, HANA y PrestaShop.
- Si existen respaldos externos y pruebas documentadas de restauracion.
- Que aplicacion depende de SMB1, PowerShell 2.0 o .NET 3.5.

## 6. Riesgos que he identificado inicialmente

Estos puntos requieren investigacion. No los presento todavia como
instrucciones de cambio:

- Uso cotidiano de una cuenta administrativa local.
- Dependencia de AnyDesk como via de administracion.
- Falta de dominio o administracion centralizada observada.
- Poco espacio libre en `C:` y `G:`.
- Componentes heredados habilitados.
- IIS y FTP amplian la superficie expuesta del servidor.
- Responsabilidad y custodia de accesos aun no documentadas.
- Funcion y validez de los respaldos aun no verificadas.

## 7. Software que encontre instalado

El inventario obtenido contiene 2,596 lineas. Aproximadamente 2,506
corresponden a componentes internos y paquetes de idioma de SAP
BusinessObjects/Crystal Reports, por lo que no deben interpretarse como 2,506
aplicaciones independientes.

### Productos SAP principales confirmados

| Producto | Version observada | Fecha observada |
|---|---|---|
| SAP Business One Client (64-bit) | No informada | 2024-10-13 |
| SAP Business One Integration | `10.00.16.0` | Registro no normalizado |
| SAP Business One DI API (64-bit) | No informada | 2024-10-13 |
| SAP Business One SDK | No informada | 2024-10-13 |
| SAP Business One Studio (64-bit) | `1000.00.260` | 2024-10-17 |
| SAP Business One Data Transfer Workbench x64 | `1000.00.260` | 2024-10-13 |
| SAP Business One Browser Access Server Gatekeeper | `100` | 2024-10-13 |
| SAP Business One Client Agent | `1.0.1.7` | 2024-10-13 |
| Remote Support Platform for SAP Business One | `32.0.18` | 2022-06-06 |
| SAP HANA Studio 64bit | `2.3.53.000000` | No informada |
| SAP Crystal Reports for SAP Business One | `14.3.2.4121` | No informada |
| Crystal Reports runtime para .NET (64-bit) | `13.0.36.5040` | 2024-10-13 |
| Crystal Report Integration Package | `1.00.0000` | 2023-10-23 |

### Herramientas e infraestructura confirmadas

| Producto | Version | Interpretacion preliminar |
|---|---|---|
| Manager de Bavel | No informada | Posible facturacion electronica/EDI |
| RabbitMQ Server | `4.0.2` | Cola de mensajes posiblemente usada por Bavel u otra integracion |
| Erlang OTP | `27.1.1` | Dependencia habitual de RabbitMQ |
| Microsoft SQL Server 2012 Native Client | `11.4.7001.0` | Conectividad con SQL Server; no confirma un motor local |
| MobaXterm | `22.1.0.4888` | SSH y administracion remota |
| FileZilla | `3.61.0` | Transferencia FTP/SFTP manual |
| Microsoft Azure CLI | `2.38.0` | Herramienta cloud; uso todavia no confirmado |
| Microsoft 365 Apps | `16.0.19725.20382` | Ofimatica |
| Google Chrome | `149.0.7827.103` | Navegador |
| Node.js | `24.16.0` | Instalado el 2026-06-15; no pertenece necesariamente al sistema historico |
| .NET Runtime/Desktop Runtime | `6.0.36` | Ejecucion de aplicaciones .NET modernas |

### Como entiendo actualmente el rol del servidor

Con la evidencia recopilada, entiendo que `ventasmoviles` cumple al menos
estas funciones:

1. Estacion administrativa para conectarse a SAP HANA.
2. Equipo con cliente y herramientas de desarrollo de SAP Business One.
3. Posible host de integraciones mediante DI API, SAP Business One Integration
   y aplicaciones .NET.
4. Posible host de SAP Business One Browser Access.
5. Posible host de mensajeria mediante RabbitMQ.
6. Posible host del Manager de Bavel para facturacion electronica o intercambio
   documental.
7. Servidor IIS, FTP y archivos.

Que un programa este instalado no significa necesariamente que siga
utilizandose. Por eso estoy contrastando este inventario con servicios,
procesos, tareas programadas, configuracion de IIS y la operacion diaria.

### Hallazgos relevantes para continuar

- La DI API y el SDK hacen viable que el sincronizador use interfaces de SAP,
  aunque la consulta vista en pantalla tambien demuestra acceso SQL a HANA.
- SAP Business One Integration puede alojar otros flujos distintos del
  sincronizador de articulos.
- RabbitMQ y Erlang sugieren al menos una arquitectura basada en colas.
- Bavel debe investigarse como sistema separado de facturacion electronica o
  EDI.
- Browser Access Gatekeeper y el rol IIS pueden estar relacionados, pero aun
  no se ha confirmado su configuracion.
- Crystal Reports explica la gran mayoria de entradas del inventario.

Todavia no se han levantado:

- Tareas programadas.
- Sitios y aplicaciones de IIS.
- Configuracion de FTP.
- Recursos compartidos.
- Sesiones y accesos remotos.
- Reglas de firewall relevantes.
- Contenido general de las unidades de datos.

## 8. Servicios que encontre

Realice esta consulta el 2026-06-15 y no modifique ningun servicio.

### Servicios SAP activos

| Servicio | Estado | Inicio | Funcion probable |
|---|---|---|---|
| `Gatekeeper64` | Running | Automatico | Puerta de acceso de SAP Business One Browser Access |
| `SBOClientAgent` | Running | Automatico | Agente local del cliente SAP Business One |
| `SAPB1iDIProxy` | Running | Automatico | Proxy de DI API para SAP Business One Integration |
| `SAPB1iDIProxy_Monitor` | Running | Automatico | Supervision del servicio DI Proxy |
| `SAPB1iEventSender` | Running | Automatico | Envio de eventos de SAP Business One hacia integraciones |
| `Tomcat10` | Running | Automatico | Servidor de SAP Business One Integration |

Con esto pude confirmar que SAP Business One Integration no solo esta
instalado: sus componentes principales estan activos en `ventasmoviles`.

### Mensajeria e integraciones activas

| Servicio | Estado | Inicio | Ruta o funcion |
|---|---|---|---|
| `RabbitMQ` | Running | Automatico | Mensajeria basada en Erlang |
| `cnchc` | Running | Automatico | `C:\catanet_net_client\CatanetNetClient.Server.Service.exe` |

La funcion de Catanet todavia no esta identificada. RabbitMQ podria pertenecer
a Bavel, Catanet u otra integracion; la asociacion debe comprobarse mediante
configuracion, puertos y logs.

### Servicios web y transferencia activos

| Servicio | Estado | Inicio |
|---|---|---|
| IIS World Wide Web Publishing (`W3SVC`) | Running | Automatico |
| Windows Process Activation Service (`WAS`) | Running | Manual |
| IIS Application Host Helper (`AppHostSvc`) | Running | Automatico |
| Microsoft FTP Service (`ftpsvc`) | Running | Automatico |
| Windows File Server (`LanmanServer`) | Running | Automatico |

El servidor publica o esta preparado para publicar sitios web, aplicaciones y
transferencias FTP. Todavia debo inventariar los sitios, bindings,
certificados, pools de aplicaciones, rutas fisicas y cuentas utilizadas.

### Acceso y administracion remota

| Servicio | Estado | Inicio | Observacion |
|---|---|---|---|
| Remote Desktop Services | Running | Manual | RDP disponible a nivel de servicio |
| Windows Remote Management | Running | Automatico | Administracion remota por WinRM |
| Zoho Assist Unattended Support | Running | Automatico | Acceso remoto desatendido adicional |

Ademas del AnyDesk observado, existe Zoho Assist desatendido. Esto significa
que el control remoto del servidor no depende de una sola plataforma. Todavia
debe determinarse quien controla cada cuenta, que tecnicos tienen acceso y si
se conserva un historial de conexiones.

### Servicios instalados pero detenidos

| Servicio | Estado | Inicio | Ruta |
|---|---|---|---|
| SAP Business One RSP Agent | Stopped | Automatico | Remote Support Platform de SAP |
| `SS_Servicio_SAP` | Stopped | Automatico | `C:\Program Files\Soluciones Sap\SS_Servicio_SAP\SapService.exe` |

En el caso de `SS_Servicio_SAP`, pude confirmar en los eventos `7000` y `7038`
del 12 de junio de 2026 que el servicio no inicia porque la contrasena
configurada para `.\Administrator` es incorrecta. No recomiendo cambiarla ni
iniciar el servicio hasta descartar una sincronizacion manual activa y
documentar los permisos necesarios.

### Plataforma de virtualizacion

Los servicios de VMware Tools confirman que `ventasmoviles` es una maquina
virtual VMware. Falta identificar:

- Host fisico o plataforma VMware que la ejecuta.
- Responsable del hipervisor.
- Backups o snapshots de la maquina virtual.
- Recursos asignados y capacidad disponible del host.

## 9. Riesgos adicionales observados

- Hay al menos AnyDesk y Zoho Assist como herramientas de acceso remoto.
- RDP y WinRM tambien estan activos a nivel de servicio.
- SAP Business One Integration procesa eventos mediante servicios activos.
- IIS y FTP estan activos, pero aun no se conocen sus publicaciones.
- RabbitMQ esta activo, pero no se conoce que aplicaciones y credenciales usa.
- Dos servicios de negocio configurados como automaticos estan detenidos.
- La continuidad depende tambien del host VMware, aun no inventariado.

## 10. Tareas programadas que encontre

Revise inicialmente estas tareas el 2026-06-15.

### Tareas empresariales identificadas

| Ruta y nombre | Programa | Cuenta | Programacion observada | Ultimo resultado |
|---|---|---|---|---|
| `\Enviar estados de cuenta` | `C:\Task\Envio masivo (B1ReportSender)\EnviarEstadoDeCuenta.cmd` | `VENTASMOVILES\serviceuser` | Semanal, 20:00 | `1` |
| `\Envio de Estados\Envio de estados de cuenta` | Mismo script | `VENTASMOVILES\SolucionSAP` | Semanal, 13:30 | `1` |
| `\PRUEBA` | `C:\IMPLEMENTACION\DTW\TareaPrueba.bat` | `VENTASMOVILES\Administrator` | Sin proxima ejecucion | `0` |

Las dos primeras tareas ejecutan el mismo script con distintas cuentas y
horarios. El nombre `B1ReportSender` sugiere una aplicacion que genera y envia
reportes o estados de cuenta usando datos de SAP Business One.

El codigo `1` de ambas ejecuciones del 2026-06-08 normalmente indica error.
Para confirmarlo, revise tambien los logs del proceso. Ambas estaban
programadas para ejecutarse nuevamente el 2026-06-15.

La tarea `PRUEBA` esta vinculada a `DTW`, probablemente SAP Business One Data
Transfer Workbench. Su ultima ejecucion observada fue el 2022-11-25, termino
con codigo `0` y no tiene proxima ejecucion.

La salida fue copiada dos veces, por lo que solo contabilizo tres tareas
empresariales y no seis.

### Tareas de terceros observadas

- Actualizacion de Microsoft Edge.
- Actualizacion y reportes de OneDrive para varias cuentas locales.
- Actualizacion de Zoho Assist (`ZA_Urs_Upgrader`).
- Actualizacion de Google Chrome.
- Mantenimiento y actualizacion de Microsoft Office.

El resto del listado corresponde principalmente a mantenimiento estandar de
Windows Server.

### Aspectos pendientes para cada tarea empresarial

- Contenido seguro de los scripts, sin credenciales.
- Archivos de log y destinatarios.
- Dependencia de credenciales, correo, SAP o carpetas compartidas.
- Motivo de los codigos de resultado `1`.
- Razon para ejecutar el mismo proceso con dos cuentas diferentes.
- Confirmacion de si ambas tareas siguen siendo necesarias.

## 11. Aplicacion B1ReportSender

### Ubicacion

`C:\Task\Envio masivo (B1ReportSender)`

### Componentes confirmados

| Archivo | Funcion probable |
|---|---|
| `B1ReportSenderHANA.exe` | Aplicacion .NET principal para SAP HANA |
| `B1ReportSenderHANA.exe.config` | Configuracion de la aplicacion; potencialmente sensible |
| `EnviarEstadoDeCuenta.cmd` | Script iniciado por las tareas programadas |
| `clientes.sql` | Consulta de clientes o destinatarios |
| `Estado de cuenta (para envio masivo).rpt` | Plantilla de Crystal Reports |
| `hanab1.connStr` | Cadena de conexion a HANA; archivo sensible |
| `log.txt` | Registro acumulado de ejecucion |
| `dev_rfc.log` | Registro tecnico adicional |
| `CrystalDecisions.*.dll` | Dependencias de SAP Crystal Reports |

### Comportamiento observado

- Existen directorios fechados por ejecucion desde febrero de 2023.
- La ejecucion semanal de las 20:00 aparece de forma sostenida durante 2023,
  2024, 2025 y 2026.
- El ultimo directorio observado es `2026-06-08_20-00-28`.
- `log.txt` tenia aproximadamente 7.3 MB y fue modificado al finalizar esa
  ejecucion.
- La aplicacion principal fue modificada en noviembre de 2022.
- La configuracion y plantilla principal datan de diciembre de 2022.

### Arquitectura probable

```text
Programador de tareas
        |
EnviarEstadoDeCuenta.cmd
        |
B1ReportSenderHANA.exe
        +-- consulta clientes mediante clientes.sql
        +-- conecta con SAP HANA mediante hanab1.connStr
        +-- genera documentos con Crystal Reports
        +-- envia estados de cuenta
        +-- crea carpeta fechada y escribe log.txt
```

La parte de envio por correo aun no ha sido confirmada. Puede estar definida en
el archivo `.config`, en el script o dentro del ejecutable.

### Proteccion de informacion

No se debe copiar ni publicar el contenido completo de:

- `hanab1.connStr`
- `B1ReportSenderHANA.exe.config`
- `clientes.sql`
- `log.txt`

Estos archivos pueden contener credenciales, direcciones de correo, datos de
clientes, consultas internas o rutas de red.

Durante la revision del sincronizador SAP-PrestaShop confirme que sus logs
pueden registrar la API key completa cuando PrestaSharp produce un error. La
clave debe rotarse y los logs historicos deben tratarse como informacion
sensible.

### Pendientes

- Confirmar si se generan archivos aun cuando la tarea reporta error.
- Identificar el mecanismo de correo y sus responsables.
- Medir el espacio total consumido por los directorios historicos.
- Conocer la politica de retencion.
- Confirmar por que existen dos tareas para el mismo script.

### Problema de correo que pude confirmar

El registro de la ejecucion del 2026-06-08 muestra que los intentos de envio
fueron rechazados por el servidor SMTP. El mensaje indica que la cuenta SMTP
autenticada no tiene permiso para enviar.

Esto explica razonablemente:

- El codigo de resultado `1` de las dos tareas.
- La falta de entrega de los estados de cuenta.
- La repeticion del mismo error para todos los destinatarios observados.

La columna interna del log muestra `OK` junto al mensaje de error. Por tanto,
no debe utilizarse esa columna como confirmacion de entrega; el manejo y
registro de resultados de la aplicacion es defectuoso o ambiguo.

Por privacidad, no incluyo direcciones de clientes en esta documentacion.

La aplicacion tiene configurado `mail.smtp2go.com` como servidor SMTP. El
usuario, la contrasena y el puerto no se incorporan a este documento.

### Acciones que recomiendo para este problema

1. Identificar el proveedor SMTP y la cuenta remitente configurada, sin
   publicar su contrasena.
2. Confirmar con el administrador del correo si la cuenta esta suspendida,
   limitada, sin saldo o sin permiso de envio.
3. Verificar remitente autorizado, dominio, puerto, TLS y limites de envio.
4. Realizar una prueba controlada a una direccion interna despues de corregir
   la cuenta.
5. Confirmar entrega real en el servidor SMTP, no solamente en `log.txt`.
6. Corregir posteriormente el programa para registrar `ERROR` cuando SMTP
   rechace el mensaje.

## 12. Mi prioridad de investigacion: SAP - PrestaShop

Aunque dejo documentado el envio de estados de cuenta como sistema secundario,
mi prioridad es entender y adquirir control sobre la integracion que
sincroniza SAP Business One con PrestaShop.

### Lo que ya pude confirmar

- Existe una aplicacion Windows titulada
  `Sincronizador de articulos - SAP - PrestaShop`.
- Permite seleccionar SAP Business One 9.0 o 10.0.
- Tiene secciones de conexion SAP, conexion PrestaShop, consulta de articulos y
  tarea.
- La conexion de prueba con el webservice de PrestaShop fue exitosa.
- Se observo conexion a SAP HANA mediante `hanab1:30013`.
- La base utilizada es `BD_CARBALLO`.
- La consulta visible usa tablas `OITM`, `ITM1` y `OITW`.
- La sincronizacion observada contempla articulos, precios y existencias.

### Informacion que todavia necesito obtener

1. Nombre, ruta, version y fabricante del ejecutable.
2. Archivos de configuracion y forma de proteger sus credenciales.
3. Metodo exacto de conexion con SAP: HANA SQL, DI API, Service Layer o una
   combinacion.
4. Recursos de la API de PrestaShop utilizados.
5. Reglas de mapeo de articulos, almacenes, precios, categorias e impuestos.
6. Frecuencia, disparadores y mecanismo de ejecucion.
7. Logs, errores y procedimiento de recuperacion.
8. Direccion del flujo y existencia de sincronizacion de pedidos.
9. Codigo fuente, repositorio, instalador y proveedor responsable.
10. Dependencias y procedimiento para operar o reemplazar la integracion.

## 13. Componentes del sincronizador SAP - PrestaShop

### Carpeta localizada

`C:\Users\Administrator\Desktop\Soluciones sap\Servicio`

### Aplicacion principal observada

| Archivo | Tamano | Fecha observada | Interpretacion |
|---|---:|---|---|
| `ConfigSapService.exe` | 352,768 bytes | 2026-06-03 | Interfaz de configuracion del sincronizador |
| `ConfigSapService.exe.config` | 186 bytes | 2024-10-18 | Configuracion .NET basica |
| `ConfigSapService.xml` | 1,410 bytes | 2026-06-03 | Configuracion funcional; potencialmente sensible |
| `ConfigSapService.pdb` | 105,984 bytes | 2026-04-30 | Simbolos de depuracion de una compilacion reciente |
| `log\` | Directorio | 2026-06-15 | Registros de operacion |

La fecha reciente del ejecutable, XML y PDB indica que el proveedor o
desarrollador ha realizado cambios durante abril-junio de 2026. No es una
aplicacion abandonada desde 2020.

### Dependencias identificadas

| Componente | Funcion probable |
|---|---|
| `Bukimedia.PrestaSharp.dll` | Cliente .NET para el webservice de PrestaShop |
| `RestSharp.dll` | Peticiones HTTP/REST |
| `Newtonsoft.Json.dll` | Procesamiento JSON |
| `Soluciones.sap.dll` | Logica SAP desarrollada por el proveedor |
| `SS.ServiceLayer.dll` | Acceso o abstraccion relacionada con SAP Service Layer |
| `ExcelDataReader*.dll` | Lectura de archivos Excel |
| `Telerik.WinControls*.dll` | Interfaz grafica WinForms |

### Conclusiones tecnicas hasta el momento

- El sincronizador es una aplicacion .NET de escritorio, con interfaz Telerik
  WinForms.
- La integracion con PrestaShop usa la biblioteca PrestaSharp y posiblemente
  RestSharp para llamadas adicionales.
- Existe codigo propio del proveedor en `Soluciones.sap.dll`.
- Existe una dependencia denominada `SS.ServiceLayer.dll`; su presencia no
  demuestra por si sola que la conexion actual use SAP Service Layer.
- El archivo `ConfigSapService.xml` probablemente contiene conexiones,
  consultas, tareas o parametros. Debe tratarse como secreto hasta revisar su
  estructura de forma redactada.
- El nombre `ConfigSapService` sugiere que esta interfaz configura un servicio
  Windows separado, probablemente `SS_Servicio_SAP`, que fue observado
  detenido.

### Como creo que funciona actualmente

```text
ConfigSapService.exe
        |
        +-- guarda parametros en ConfigSapService.xml
        |
SS_Servicio_SAP / SapService.exe
        |
        +-- Soluciones.sap.dll / SS.ServiceLayer.dll
        +-- consulta SAP HANA o SAP Service Layer
        +-- Bukimedia.PrestaSharp.dll / RestSharp.dll
        +-- actualiza PrestaShop
        +-- escribe en log\
```

Para confirmar esta hipotesis, todavia debo comparar la carpeta del servicio
`C:\Program Files\Soluciones Sap\SS_Servicio_SAP` con la carpeta del
configurador y revisar el XML de forma segura.

### Estructura confirmada de `ConfigSapService.xml`

El archivo contiene dos bloques principales:

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

No incluyo valores ni secretos en este documento.

### Interpretacion

- `Servidor`, `Database` y `TipodeServidor` definen el destino SAP HANA.
- `User` y `Password` probablemente corresponden a un usuario de SAP Business
  One, no necesariamente a un usuario SQL.
- `UserSQL` y `PassSQL` existen como opciones, pero aparecieron sin valor en la
  inspeccion inicial.
- `LicenseService` tambien aparecio sin valor.
- `Version` permite adaptar la integracion a la version de SAP Business One.
- `QueryArticulos` confirma que la consulta SQL es configurable y no esta
  exclusivamente compilada dentro del ejecutable.
- `Endpoint` y `APIKey` confirman autenticacion directa contra el webservice de
  PrestaShop.

La ausencia aparente de credenciales SQL, junto con las bibliotecas propias,
puede indicar que la aplicacion usa credenciales SAP mediante DI API o una
capa equivalente. Sin embargo, no queda demostrado hasta revisar logs,
ensamblados o conexiones activas.

### Alcance aparente del XML

El XML solo expone configuracion para articulos y conexion PrestaShop. No se
observan campos evidentes para:

- Pedidos.
- Clientes.
- Facturas.
- Categorias.
- Fabricantes.
- Combinaciones o variantes.
- Programacion o frecuencia.

Esto refuerza la hipotesis de que esta aplicacion se limita principalmente a
la sincronizacion de catalogo, precio y existencia desde SAP hacia
PrestaShop.
