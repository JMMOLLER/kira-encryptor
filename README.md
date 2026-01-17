# Akira-encryptor

**Akira-encryptor** es una herramienta modular desarrollada en TypeScript/Node.js, diseñada para el cifrado y descifrado de archivos y carpetas, con soporte para CLI y GUI sobre un núcleo común robusto (`core`). Utiliza `sodium-native` para garantizar un alto nivel de seguridad criptográfica. El proyecto está enfocado en la eficiencia, soportando archivos grandes mediante flujos (`streams`) y permitiendo seguimiento de progreso a nivel global.

> 🚧 El proyecto se encuentra actualmente **en fase beta**.

---

## 🧩 Componentes del Proyecto

- CLI: Interfaz de línea de comandos interactiva con soporte para carpetas y archivos grandes.
- GUI: Interfaz gráfica basada en Electron con características exclusivas.
- Core: Módulo central reutilizable con lógica criptográfica y de procesamiento.

## ✨ Características

- 🔐 **Cifrado/Descifrado de archivos** usando `sodium-native`.
- 📂 **Soporte para carpetas** (procesamiento recursivo de subdirectorios).
- 📦 **Manejo eficiente de archivos grandes** mediante streaming.
- 📊 **Visualización de progreso** en tiempo real (barra de progreso global).
- 😶‍🌫️**Ocultar el elemento cifrado** a nivel de SO.
- ⚡ **Soporte Multihilo** para operaciones de cifrado y descifrado.

---

## ⚙️ Configuración previa (Opcional)

Puedes crear un archivo `.env` en la raíz del proyecto con el siguiente contenido:

```env
MAX_THREADS=<number_of_threads> #Número de hilos para operaciones multihilo [opcional]
DB_PATH=<your_path> #Ruta donde se guardará el storage [opcional]
ENCODING=<encoding_value> #Codificación de datos [opcional]
PASSWORD=<your_password> #Contraseña para cifrado/descifrado [opcional]
```

> ⚠️ Importante: `PASSWORD` es solo para fines de desarrollo.
> Permite saltear el requisito de ingreso de constraseña en cada operación.

---

## 🚀 Instalación y uso del CLI (Entorno Node)

> Requisitos: Node.js ≥ 18.x y npm

1. Clona el repositorio:

```bash
git clone https://github.com/JMMOLLER/akira-encryptor.git
cd Akira-encryptor
```

2. Instala las dependencias con:

```bash
pnpm install
```

3. Ejecuta con:

```bash
pnpm start
```

4. Sigue las instrucciones en la interfaz interactiva para cifrar o descifrar archivos o carpetas.

```bash
? ¿Qué desea realizar? (Use arrow keys)
❯ Encriptar
  Desencriptar
```

### 📁 Funcionalidades

- Encriptado/Desencriptado de archivos individuales.
- Procesamiento recursivo de carpetas.
- Barra de progreso global.
- Cifrado seguro con `sodium-native`.
- Multihilo con `piscina`.
- Soporte para flujos de datos (stream) → eficiencia con archivos grandes.
- Ocultar archivos o carpetas a nivel de SO.

> [!NOTE]
> Para la versión ejecutable del CLI puedes configurar el número de hilos creando un archivo `.env` en el mismo nivel que el ejecutable. [Ver](#%EF%B8%8F-configuración-previa-opcional)

---

## 💻 Instalacion y uso de la GUI (Entorno Node)

> Requisitos: Node.js ≥ 18.x y npm

1. Clona el repositorio:

```bash
git clone https://github.com/JMMOLLER/akira-encryptor.git
cd Akira-encryptor
```

2. Instala las dependencias con:

```bash
pnpm install
```

3. Ejecuta con:

```bash
pnpm start
```

### 📁 Funcionalidades

- Encriptado/Desencriptado de archivos individuales.
- Procesamiento recursivo de carpetas.
- Barra de progreso global.
- Cifrado seguro con `sodium-native`.
- Multihilo con `piscina` facilmente configurable.
- Soporte para flujos de datos (stream) → eficiencia con archivos grandes.
- Ocultar archivos o carpetas a nivel de SO.
- Copias de seguridad (`.7z` cifrado con contraseña).
- Ocultar el nombre original del elemento cifrado en la GUI.

> [!NOTE]
> Para la versión ejecutable de la GUI las copias de seguridad se crear con la misma contraseña creada al iniciar la aplicación. La copia de seguridad se puede desactivar y el archivo creado se elimina automáticamente al descifrar el elemento asociado sin errores.

---

## ⚠️ Advertencia de uso

**Este proyecto se encuentra en etapa de desarrollo.**

> [!WARNING]
> Por defecto la herramienta GUI realiza una copia de seguridad antes de realizar cualquier operación, sin embarego, no me responsabilizo por la pérdida, corrupción o inaccesibilidad de archivos causados por el uso de esta herramienta.

## 🛠️ Estado actual

- [x] Funcionalidades de cifrado y descifrado implementadas

- [x] CLI interactiva con barra de progreso

- [x] Soporte para archivos grandes

- [x] GUI en desarrollo (Electron)

- [x] Soporte multihilo

- [x] Ocultar elemento cifrado

- [x] Copia de seguridad (.7z)

- [ ] Empaquetado multiplataforma
