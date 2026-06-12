# Mediloop 🏥

**Plataforma Web para la Gestión y Optimización de Rotaciones de Prácticas Clínicas**
*Facultad de Ciencias de la Salud - Universitat Jaume I (UJI), España*

Mediloop es una solución digital integral diseñada para centralizar, simplificar y enriquecer la experiencia de las rotaciones de prácticas clínicas para los estudiantes de Medicina de la Universitat Jaume I. Sustituye la gestión tradicional fragmentada en papel, correos electrónicos y PDFs por un ecosistema unificado que facilita tanto la vertiente operativa (asistencia, firmas, evaluaciones) como la académica y de preparación clínica.

Además de su función operativa, Mediloop es el **instrumento de intervención principal de un estudio de investigación en tres fases** financiado por el *Programa de Innovación Educativa de la UJI*, enfocado en evaluar y reducir la variabilidad del aprendizaje clínico de los estudiantes.

---

## 🚀 Características Principales

### 1. Núcleo Operativo (Core)
*   **Autenticación Institucional**: Registro y acceso restringidos estrictamente a correos oficiales `@uji.es` utilizando `bcryptjs` para el hashing de contraseñas y `jsonwebtoken` (JWT HS256) para sesiones seguras de rol.
*   **Gestión Dinámica de Rotaciones**: Asignación y control de estudiantes a servicios, tutores y hospitales por parte de los coordinadores, manteniendo un historial académico completo a lo largo de los cursos (2º a 6º de Medicina).
*   **Asistencia por Código QR Rotativo**: Sistema anti-fraude en el que el tutor genera un código QR que expira y cambia periódicamente, el cual es escaneado por el alumno en tiempo real para registrar su entrada.
*   **Evaluaciones mediante Rúbricas**: Evaluación bidireccional digitalizada. Los tutores evalúan el desempeño de los alumnos mediante rúbricas clínicas detalladas y los alumnos evalúan a sus tutores y centros hospitalarios correspondientes.
*   **Informes de Prácticas Digitales**: Generación y firma digitalizada de las memorias de prácticas al final de cada rotación, con un registro de auditoría completo del estado del flujo de firmas.
*   **Control de Incidencias**: Canal para reportar y clasificar problemas surgidos durante las prácticas (docentes, organizativas, de seguridad del paciente, etc.) con seguimiento de resolución.

### 2. Módulos de Preparación Pre-rotación (Clave para la Investigación)
Este módulo ataca de forma directa las deficiencias percibidas de preparación previa (M=2.59/5) y claridad de objetivos (M=2.69/5) identificadas en la fase de línea base del estudio.
*   **Guías del Servicio**: Horarios, circuitos de pacientes, normas de conducta y protocolos de ingreso.
*   **Objetivos de Aprendizaje Clínico**: Claros, numerados y alineados con el plan de estudios de la UJI y el marco MIR.
*   **Checklist de Competencias Interactivo**: Registro persistente donde el alumno marca las destrezas y competencias clínicas que va adquiriendo durante su estancia.
*   **Expectativas del Tutor**: Detalles específicos de lo que el equipo médico espera del alumno.
*   **Microcontenidos Clínicos**: Fichas didácticas resumidas con los 5–8 diagnósticos más frecuentes del servicio en formato de consulta rápida.
*   **Seguridad del Paciente**: Reglas básicas de higiene de manos, uso de equipo de protección y prevención de errores.

### 3. Zona de Entrenamiento Clínico (Simulador IA)
*   **Simulador de Anamnesis**: Pacientes virtuales impulsados por IA con los que los alumnos pueden interactuar y entrevistarse. Al finalizar, el sistema evalúa y puntúa las preguntas clave realizadas y las omitidas.
*   **Interpretación de Analíticas**: Casos prácticos de interpretación de perfiles sanguíneos basados en un método de aprendizaje socrático interactivo.
*   **Imagenología y ECGs**: Biblioteca interactiva de casos de radiografías de tórax, electrocardiogramas y tomografías básicas para ejercitar el diagnóstico diferencial.

### 4. Biblioteca Docente
*   Un repositorio organizado por especialidad, servicio y tema donde los tutores pueden compartir documentos, artículos y material multimedia con sus alumnos asignados.

---

## 🛠️ Pila Tecnológica (Tech Stack)

### **Backend**
*   **Entorno de ejecución**: [Node.js](https://nodejs.org/) (v22+ recomendado, v18+ requerido)
*   **Lenguaje**: [TypeScript](https://www.typescriptlang.org/) ejecutado dinámicamente con `tsx`
*   **Framework**: [Express.js](https://expressjs.com/)
*   **Base de datos y ORM**: [Prisma ORM](https://www.prisma.io/) con base de datos por defecto en **SQLite** (fácil portabilidad a **PostgreSQL** mediante el esquema preparado `schema.postgres.prisma`)
*   **Seguridad**: `bcryptjs` (hashing) y `jsonwebtoken` (sesión segura JWT)
*   **Testing**: [Jest](https://jestjs.io/) y `supertest` para pruebas unitarias y de integración de endpoints de la API

### **Frontend**
*   **Estructura e Interfaz**: Vanilla HTML5 y CSS3 personalizado (siguiendo un sistema de diseño limpio, moderno, con colores sanitarios y tipografía *Inter/Roboto*)
*   **Interactividad**: Vanilla ES6 JavaScript (sin frameworks pesados para garantizar la máxima velocidad y simplicidad de uso)
*   **Generador QR**: `qrcode` library

### **Despliegue**
*   Mediloop está preparado para desplegarse de manera nativa en [Railway](https://railway.app/). La versión de Node.js se gestiona a través de `nixpacks.toml` forzando el uso de `nodejs_22`.

---

## 🗂️ Estructura del Directorio

```text
Mediloop/
├── backend/                   # Código fuente del Servidor
│   ├── prisma/                # Esquemas y semillas de base de datos (SQLite / PostgreSQL)
│   │   ├── schema.prisma      # Esquema principal para SQLite
│   │   ├── seed.js            # Datos iniciales para la base de datos (seed)
│   │   └── schema.postgres.prisma
│   ├── src/                   # Lógica de negocio (TypeScript)
│   │   ├── index.ts           # Punto de entrada del servidor Express
│   │   ├── prisma.ts          # Inicialización del cliente Prisma
│   │   ├── routes/            # Enrutadores modulares de la API
│   │   └── middleware/        # Validaciones, autenticación y manejo de errores
│   ├── tests/                 # Suites de pruebas con Jest
│   └── tsconfig.json          # Configuración del compilador TypeScript
├── frontend/                  # Archivos de la interfaz web
│   └── public/                # Archivos estáticos HTML, CSS y JS del cliente
├── docs/                      # Documentación del proyecto (Modelado de datos, Diagramas ER, etc.)
├── Dockerfile                 # Configuración de Docker para despliegue en contenedor
├── docker-compose.yml         # Orquestador para desarrollo local multi-contenedor
└── nixpacks.toml              # Instrucciones de compilación para Railway
```

---

## ⚙️ Configuración e Instalación Local

### **Prerrequisitos**
*   **Node.js**: Versión 18 o superior (se recomienda v22+ para el mejor soporte)
*   **Git**: Para clonar el repositorio

### **Pasos de Instalación**

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/sohamkatlariwala/Mediloop.git
    cd Mediloop
    ```

2.  **Instalar dependencias**:
    Instala las dependencias del proyecto raíz y del backend ejecutando:
    ```bash
    npm install
    ```

3.  **Configurar base de datos local (SQLite)**:
    Usa Prisma para generar el cliente y empujar el modelo de datos a tu archivo local de SQLite:
    ```bash
    # Generar cliente de Prisma
    npm run prisma:generate

    # Crear base de datos local y tablas
    npm run prisma:push

    # Población opcional con datos semilla de prueba
    npm run prisma:seed
    ```

4.  **Iniciar en modo desarrollo**:
    Arranca el servidor del backend (el cual expone la API y sirve la carpeta estática del frontend en el puerto 4000):
    ```bash
    npm run dev
    ```
    Visita [http://localhost:4000](http://localhost:4000) en tu navegador para interactuar con la aplicación.

### **Ejecutar Pruebas**
Para validar que las rutas y la base de datos funcionan correctamente:
```bash
npm run test
```

---

## 👥 Cuentas de Demostración (Seed Data)

Para interactuar con la plataforma y probar los diferentes roles y flujos, puedes utilizar las siguientes credenciales precargadas (contraseña genérica: `123456`):

*   **Administrador del Sistema**: `admin@uji.es`
*   **Coordinadora UJI**: `coordinadora@uji.es`
*   **Tutor Clínico (Medicina Interna)**: `tutor@uji.es` (Dra. María González - Hospital General)
*   **Estudiante de Medicina (3er Año)**: `alumno@uji.es` (Ana Martínez)

---

## 📊 Marco de Investigación Académica

Mediloop se articula en torno a la investigación científica de la Universitat Jaume I sobre calidad formativa:

*   **Fase 1 (Completada)**: Estudio exploratorio preliminar ($N=74$) donde se demostró estadísticamente que el 12% del éxito en el grado de satisfacción de las rotaciones clínicas depende únicamente de la preparación previa del estudiante ($\rho = 0.34$, $p = 0.0032$).
*   **Fase 2 (Completada)**: Estudio de línea base ($N=80$ estudiantes, $N=45$ tutores) que cuantificó deficiencias formativas que el módulo de preparación de Mediloop soluciona directamente.
*   **Fase 3 (En curso - Intervención)**: Piloto de implantación en la asignatura obligatoria *Patología General* (3er año de Medicina, rotación de Medicina Interna) con evaluación pre-post analizada mediante un dashboard de investigación exclusivo integrado en la plataforma.

---

## 📬 Contacto e Información de Investigación
*   **Investigador Principal**: Antonio Pineda Guerrero · [al429440@uji.es](mailto:al429440@uji.es) · ORCID [0009-0008-0704-1135](https://orcid.org/0009-0008-0704-1135)
*   **Supervisor Académico**: Vicente J. Pallarés Carratalà · PDI Departamento de Medicina FCS-UJI
