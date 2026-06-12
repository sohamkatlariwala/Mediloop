const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clear existing tables in logical order to avoid foreign key violations
  await prisma.auditLog.deleteMany({});
  await prisma.prepAccessLog.deleteMany({});
  await prisma.prepChecklist.deleteMany({});
  await prisma.prepModule.deleteMany({});
  await prisma.teachingResource.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.evaluationAnswer.deleteMany({});
  await prisma.evaluation.deleteMany({});
  await prisma.rubricCriterion.deleteMany({});
  await prisma.rubric.deleteMany({});
  await prisma.practiceSession.deleteMany({});
  await prisma.practiceReport.deleteMany({});
  await prisma.rotation.deleteMany({});
  await prisma.service.deleteMany({});
  await prisma.tutor.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.hospital.deleteMany({});
  await prisma.virtualPatientSession.deleteMany({});
  await prisma.virtualPatientCase.deleteMany({});
  await prisma.user.deleteMany({});

  const DEMO_HASH = bcrypt.hashSync("123456", 10);
  const ADMIN_HASH = bcrypt.hashSync("Mediloop2026!", 10);

  // 1. Create Users
  const admin = await prisma.user.create({
    data: {
      email: "admin@uji.es",
      name: "Admin Mediloop",
      role: "admin",
      passwordHash: ADMIN_HASH,
      isVerified: true,
    },
  });

  const coord = await prisma.user.create({
    data: {
      email: "coordinator@uji.es",
      name: "Prof. Vicente Pallarés",
      role: "coordinator",
      passwordHash: DEMO_HASH,
      isVerified: true,
    },
  });

  const studentUser1 = await prisma.user.create({
    data: {
      email: "alumno@uji.es",
      name: "Ana Martínez",
      role: "student",
      passwordHash: DEMO_HASH,
      isVerified: true,
    },
  });

  const student1 = await prisma.student.create({
    data: {
      userId: studentUser1.id,
      nia: "429440",
      curso: 3,
      grupo: "A",
      planEstudios: "Grado en Medicina UJI 2020",
    },
  });

  const studentUser2 = await prisma.user.create({
    data: {
      email: "carlos.perez@uji.es",
      name: "Carlos Pérez",
      role: "student",
      passwordHash: DEMO_HASH,
      isVerified: true,
    },
  });

  const student2 = await prisma.student.create({
    data: {
      userId: studentUser2.id,
      nia: "431200",
      curso: 4,
      grupo: "B",
      planEstudios: "Grado en Medicina UJI 2020",
    },
  });

  const tutorUser1 = await prisma.user.create({
    data: {
      email: "tutor@uji.es",
      name: "Dra. María González",
      role: "tutor",
      passwordHash: DEMO_HASH,
      isVerified: true,
    },
  });

  const tutorUser2 = await prisma.user.create({
    data: {
      email: "dr.ruiz@uji.es",
      name: "Dr. Fernando Ruiz",
      role: "tutor",
      passwordHash: DEMO_HASH,
      isVerified: true,
    },
  });

  // 2. Create Hospitals
  const hProvincial = await prisma.hospital.create({
    data: {
      nombre: "Consorci Hospitalari Provincial de Castelló",
      tipo: "hospital",
      direccion: "Avda. Dr. Clará, 19",
      ciudad: "Castelló de la Plana",
      lat: 39.9802,
      lng: -0.0463,
      website: "www.hospitalprovincial.es",
      contact: "964 376 000",
    },
  });

  const hGeneral = await prisma.hospital.create({
    data: {
      nombre: "Hospital General Universitari de Castelló",
      tipo: "hospital",
      direccion: "Avda. de Benicàssim, 128",
      ciudad: "Castelló de la Plana",
      lat: 39.9982,
      lng: -0.0384,
      website: "castellon.san.gva.es",
      contact: "964 725 000",
    },
  });

  const hLaPlana = await prisma.hospital.create({
    data: {
      nombre: "Hospital Universitari de la Plana",
      tipo: "hospital",
      direccion: "Carretera Vila-real a Borriana, km 0.5",
      ciudad: "Vila-real",
      lat: 39.9324,
      lng: -0.0821,
      website: "laplana.san.gva.es",
      contact: "964 399 775",
    },
  });

  const hLaMagdalena = await prisma.hospital.create({
    data: {
      nombre: "Hospital de Atención a Crónicos y Larga Estancia La Magdalena",
      tipo: "hospital",
      direccion: "Cuadra Collet, Partida Bovalar, 32",
      ciudad: "Castelló de la Plana",
      lat: 40.0125,
      lng: -0.0612,
      website: "lamagdalena.san.gva.es",
      contact: "964 376 300",
    },
  });

  // Assign Tutors to Hospitals
  const tutor1 = await prisma.tutor.create({
    data: {
      userId: tutorUser1.id,
      especialidad: "Medicina Interna",
      servicioPrincipal: "Medicina Interna",
      hospitalId: hProvincial.id,
    },
  });

  const tutor2 = await prisma.tutor.create({
    data: {
      userId: tutorUser2.id,
      especialidad: "Medicina de Familia",
      servicioPrincipal: "Atención Primaria",
      hospitalId: hLaPlana.id,
    },
  });

  // 3. Create Services for Hospitals
  const sIntMedProv = await prisma.service.create({
    data: {
      hospitalId: hProvincial.id,
      nombre: "Medicina Interna",
      tipo: "medicina_interna",
    },
  });

  const sCardioProv = await prisma.service.create({
    data: {
      hospitalId: hProvincial.id,
      nombre: "Cardiología",
      tipo: "cardiologia",
    },
  });

  const sSurgeryProv = await prisma.service.create({
    data: {
      hospitalId: hProvincial.id,
      nombre: "Cirugía General",
      tipo: "cirugia",
    },
  });

  const sAPLaPlana = await prisma.service.create({
    data: {
      hospitalId: hLaPlana.id,
      nombre: "Atención Primaria / Medicina de Familia",
      tipo: "familia",
    },
  });

  const sGynGeneral = await prisma.service.create({
    data: {
      hospitalId: hGeneral.id,
      nombre: "Obstetricia y Ginecología",
      tipo: "ginecologia",
    },
  });

  const sPedLaPlana = await prisma.service.create({
    data: {
      hospitalId: hLaPlana.id,
      nombre: "Pediatría",
      tipo: "pediatria",
    },
  });

  // 4. Create Rotations
  const rotation1 = await prisma.rotation.create({
    data: {
      studentId: student1.id,
      tutorId: tutor1.id,
      hospitalId: hProvincial.id,
      serviceId: sIntMedProv.id,
      startDate: new Date("2026-03-01T00:00:00Z"),
      endDate: new Date("2026-04-15T00:00:00Z"),
      academicYear: "2025/2026",
      status: "en_curso",
    },
  });

  const rotation2 = await prisma.rotation.create({
    data: {
      studentId: student1.id,
      tutorId: tutor2.id,
      hospitalId: hLaPlana.id,
      serviceId: sAPLaPlana.id,
      startDate: new Date("2026-04-20T00:00:00Z"),
      endDate: new Date("2026-05-20T00:00:00Z"),
      academicYear: "2025/2026",
      status: "planificada",
    },
  });

  // Enroll student 2 into rotation 1
  await prisma.rotation.create({
    data: {
      studentId: student2.id,
      tutorId: tutor1.id,
      hospitalId: hProvincial.id,
      serviceId: sIntMedProv.id,
      startDate: new Date("2026-03-01T00:00:00Z"),
      endDate: new Date("2026-04-15T00:00:00Z"),
      academicYear: "2025/2026",
      status: "en_curso",
    },
  });

  // 5. Create Pre-Rotation Prep Modules (6 Specialties)
  
  // 5.1 Internal Medicine
  const imGuide = `
# GUÍA DEL SERVICIO DE MEDICINA INTERNA
## Funcionamiento del Servicio
El Servicio de Medicina Interna del Consorci Hospitalari Provincial de Castelló atiende a pacientes hospitalizados con patologías complejas y pluripatológicas.
- **Horario diario**: Pase de guardia a las 08:00h en la sala de reuniones de planta. Pase de visitas de 08:30h a 13:00h.
- **Sesiones clínicas**: Miércoles a las 13:30h en la biblioteca del hospital.
- **Normas de conducta**: El alumno debe llevar bata limpia, fonendoscopio, identificación visible y cumplir con el lavado estricto de manos antes y después del contacto con cada paciente.
- **Circuito de pacientes**: Ingresos desde Urgencias, traslados desde UCI o consultas externas.
  `;

  const imObjectives = JSON.stringify([
    "Realizar una anamnesis completa y sistemática a un paciente pluripatológico.",
    "Llevar a cabo una exploración física general ordenada por aparatos.",
    "Interpretar hemogramas básicos, perfiles bioquímicos y gasometrías arteriales en situaciones críticas.",
    "Formular diagnósticos diferenciales basados en síndromes clínicos comunes (p. ej., insuficiencia cardíaca, EPOC reagudizado).",
    "Aprender a realizar de forma segura la punción venosa e inserción de catéter periférico."
  ]);

  const imExpectations = `
## Expectativas de los Tutores
- **Proactividad**: Se valora mucho que el alumno repase las historias clínicas de los pacientes asignados antes de iniciar el pase de planta.
- **Estudio personal**: Se espera que el alumno investigue las dudas clínicas detectadas durante el día y las plantee razonadamente al día siguiente.
- **Puntualidad**: La puntualidad es crítica. El pase de guardia a las 08:00 es obligatorio.
- **Empatía**: Trato extremadamente respetuoso con el paciente y su familia, respetando en todo momento su intimidad y confidencialidad.
  `;

  const imDiagnoses = JSON.stringify([
    {
      name: "Insuficiencia Cardíaca Reagudizada",
      definition: "Síndrome clínico caracterizado por disnea, fatiga y signos de retención de líquidos debido a la incapacidad del corazón para mantener el gasto cardíaco.",
      symptoms: "Disnea de esfuerzo, ortopnea, disnea paroxística nocturna, fatiga, aumento de peso rápido.",
      signs: "Crepitantes pulmonares bilaterales, ingurgitación yugular, edema con fóvea en extremidades inferiores, reflujo hepatoyugular.",
      tests: "Electrocardiograma (ECG), Radiografía de tórax (líneas B de Kerley, cardiomegalia), Péptidos natriuréticos (NT-proBNP), Ecocardiograma.",
      treatment: "Oxigenoterapia, Diuréticos de asa intravenosos (Furosemida), Restricción hidrosalina, control de factores desencadenantes (infección, arritmia)."
    },
    {
      name: "Neumonía Adquirida en la Comunidad (NAC)",
      definition: "Infección aguda del parénquima pulmonar en un paciente no hospitalizado.",
      symptoms: "Fiebre, tos productiva con esputo purulento, dolor torácico pleurítico, escalofríos, disnea.",
      signs: "Taquipnea, taquicardia, hipofonesis, crepitantes localizados, aumento del frémito táctil.",
      tests: "Radiografía de tórax (infiltrado lobar o segmentario), Analítica con reactantes de fase aguda (PCR elevada, leucocitosis), Hemocultivos si criterios de gravedad.",
      treatment: "Antibioterapia empírica (Amoxicilina/Clavulánico +/- Azitromicina), hidratación, antitérmicos, escala CURB-65 para decidir ingreso."
    },
    {
      name: "Insuficiencia Renal Aguda (IRA)",
      definition: "Deterioro rápido de la función renal que resulta en la acumulación de productos nitrogenados en sangre.",
      symptoms: "Oliguria o anuria (frecuente pero no obligatorio), náuseas, astenia, edemas.",
      signs: "Signos de hipovolemia (hipotensión ortostática, sequedad de mucosas) o hipervolemia (edema periférico, crepitantes).",
      tests: "Analítica de sangre (Creatinina y Urea elevadas), Iones (Hiperpotasemia), Sedimento urinario e índices urinarios (fracción de eyección de sodio).",
      treatment: "Corrección de la causa subyacente (hidratación si prerrenal, retirada de nefrotóxicos, sondaje si posrenal), monitorización estricta de potasio y diuresis."
    }
  ]);

  const imSafety = `
## Guía de Seguridad del Paciente
- **Higiene de manos**: Cumplir estrictamente con los 5 momentos de la OMS para la higiene de manos.
- **Medicación**: Verificar siempre la identidad del paciente antes de cualquier procedimiento o extracción (pulsera identificativa).
- **Material punzante**: Uso seguro de contenedores de agujas. NUNCA reencapuchar agujas usadas. En caso de pinchazo accidental, lavar con agua y jabón e informar inmediatamente al tutor para iniciar el protocolo de urgencias biológicas.
- **Consentimiento**: Explicar siempre el procedimiento de forma comprensible antes de realizarlo, solicitando el consentimiento verbal del paciente.
  `;

  const imResources = JSON.stringify([
    { title: "Guía Clínica de Insuficiencia Cardíaca ESC 2021", url: "https://www.escardio.org/Guidelines/Clinical-Practice-Guidelines/Acute-and-Chronic-Heart-Failure" },
    { title: "Consenso sobre el Manejo de la NAC - SEPAR 2024", url: "https://www.separ.es" }
  ]);

  await prisma.prepModule.create({
    data: {
      serviceId: sIntMedProv.id,
      guide: imGuide,
      objectives: imObjectives,
      expectations: imExpectations,
      diagnoses: imDiagnoses,
      safetyGuide: imSafety,
      resources: imResources,
    },
  });

  // 5.2 Family Medicine / Primary Care (Atención Primaria)
  const apGuide = `
# GUÍA DEL SERVICIO DE ATENCIÓN PRIMARIA
## Funcionamiento de la Consulta de Medicina de Familia
El Centro de Salud Universitario gestiona la atención médica inicial, prevención y seguimiento de patologías crónicas de la población asignada.
- **Horario diario**: Consulta programada de 08:30h a 13:30h. Sesión de equipo los martes de 13:30h a 14:30h.
- **Atención domiciliaria**: Salidas concertadas de 13:30h a 15:00h según necesidad de pacientes inmovilizados.
- **Conducta y ética**: Respeto riguroso de la confidencialidad en el ámbito comunitario y correcta empatía en la relación médico-paciente longitudinal.
  `;

  const apObjectives = JSON.stringify([
    "Realizar una entrevista clínica centrada en el paciente e identificar el motivo de consulta real.",
    "Realizar el control y seguimiento terapéutico de pacientes con Hipertensión Arterial y Diabetes Mellitus Tipo 2.",
    "Manejar los programas preventivos de salud del adulto (vacunación, cribados de cáncer).",
    "Colaborar en las visitas de atención domiciliaria a pacientes inmovilizados o paliativos."
  ]);

  const apExpectations = `
## Expectativas de los Tutores de Familia
- **Escucha activa**: Valoramos la empatía y la capacidad de escuchar al paciente antes de proponer pruebas o tratamientos.
- **Enfoque biopsicosocial**: Identificar cómo el entorno familiar y social del paciente influye en su adherencia al tratamiento.
- **Participación**: Integrarse activamente en las tareas del equipo de atención primaria (enfermería, trabajo social).
  `;

  const apDiagnoses = JSON.stringify([
    {
      name: "Hipertensión Arterial (HTA)",
      definition: "Elevación crónica de la presión arterial sistólica y/o diastólica por encima de valores normales (>=140/90 mmHg en consulta).",
      symptoms: "Frecuentemente asintomática (enemigo silencioso), cefalea occipital, acúfenos, visión borrosa en crisis graves.",
      signs: "Presión arterial elevada en tomas repetidas.",
      tests: "Medida clínica en consulta, AMPA (Automedida de Presión Arterial en domicilio), MAPA (Monitorización Ambulatoria de 24h), Analítica y ECG para valorar daño orgánico.",
      treatment: "Medidas higiénico-dietéticas (bajar peso, restricción de sal), IECAs/ARAs II, Diuréticos, Calcioantagonistas."
    },
    {
      name: "Diabetes Mellitus Tipo 2 (DM2)",
      definition: "Trastorno metabólico caracterizado por hiperglucemia crónica debida a resistencia a la insulina combinada con secreción deficiente.",
      symptoms: "Poliuria, polidipsia, polifagia, pérdida de peso, cansancio.",
      signs: "Heridas de lenta cicatrización, infecciones recurrentes.",
      tests: "Glucemia basal en ayunas >=126 mg/dL en dos ocasiones, o HbA1c >=6.5%.",
      treatment: "Modificación del estilo de vida (dieta, ejercicio), Metformina en primera línea, co-agonistas GLP-1 o inhibidores SGLT2 según riesgo cardiovascular, Insulina si mal control."
    }
  ]);

  const apSafety = `
## Guía de Seguridad en Atención Primaria
- **Identificación**: Asegurar la correcta correspondencia de la historia clínica en el software Abucasis antes de prescribir o registrar.
- **Vacunación segura**: Registrar lote y comprobar alergias previas antes de administrar cualquier biológico.
- **Prevención de errores de prescripción**: Conciliar de forma exhaustiva la medicación del paciente pluripatológico.
  `;

  const apResources = JSON.stringify([
    { title: "Guía de Hipertensión de la Sociedad Española de Cardiología HTA 2022", url: "https://www.revespcardiol.org" },
    { title: "Consenso de la ADA 2024 para el Manejo de la Diabetes", url: "https://diabetesjournals.org" }
  ]);

  await prisma.prepModule.create({
    data: {
      serviceId: sAPLaPlana.id,
      guide: apGuide,
      objectives: apObjectives,
      expectations: apExpectations,
      diagnoses: apDiagnoses,
      safetyGuide: apSafety,
      resources: apResources,
    },
  });

  // 5.3 General Surgery (Cirugía General)
  const sugGuide = `
# GUÍA DEL SERVICIO DE CIRUGÍA GENERAL Y DEL APARATO DIGESTIVO
## Funcionamiento del Servicio
El Servicio de Cirugía cubre la patología quirúrgica programada y de urgencia.
- **Horario diario**: 08:00h sesión de equipo quirúrgico. 08:30h pase de sala de hospitalizados. Quirófano de 08:45h a 15:00h según turnos.
- **Normas en Quirófano**: Vestimenta estricta con pijama de quirófano, gorro, mascarilla y calzado exclusivo. Técnica aséptica estricta en el lavado y enguantado.
  `;

  const sugObjectives = JSON.stringify([
    "Aprender y aplicar de forma impecable el lavado de manos quirúrgico y enguantado estéril.",
    "Realizar suturas básicas de la piel (puntos simples, colchonero) y manejo de heridas quirúrgicas.",
    "Reconocer clínicamente un abdomen agudo quirúrgico.",
    "Asistir en el posicionamiento y preparación del campo estéril en quirófano."
  ]);

  const sugExpectations = `
## Expectativas de los Cirujanos
- **Rigurosidad aséptica**: El más mínimo fallo en la esterilidad compromete al paciente. Avisa inmediatamente si tocas algo no estéril.
- **Iniciativa ordenada**: Ayudar en las curas de planta y preparar la mesa de curas antes del pase.
- **Estudio anatómico**: Repasar la anatomía de la técnica programada el día anterior.
  `;

  const sugDiagnoses = JSON.stringify([
    {
      name: "Apendicitis Aguda",
      definition: "Inflamación aguda del apéndice cecal, causa más común de abdomen agudo quirúrgico.",
      symptoms: "Dolor periumbilical migratorio a fosa ilíaca derecha (FID), náuseas, vómitos, anorexia (signo de Jaccond).",
      signs: "Fiebre leve, dolor a la palpación en FID (Punto de McBurney), signo de Blumberg (rebote) positivo.",
      tests: "Hemograma (leucocitosis con desviación izquierda), PCR elevada, Ecografía abdominal o TAC en casos dudosos.",
      treatment: "Apendicectomía (preferentemente laparoscópica), antibioterapia perioperatoria profiláctica."
    },
    {
      name: "Colecistitis Aguda",
      definition: "Inflamación de la pared de la vesícula biliar, generalmente secundaria a la obstrucción del conducto cístico por un cálculo.",
      symptoms: "Dolor cólico persistente en hipocondrio derecho irradiado a escápula, náuseas, intolerancia grasa, fiebre.",
      signs: "Signo de Murphy positivo (parada inspiratoria a la palpación del hipocondrio derecho).",
      tests: "Ecografía abdominal (engrosamiento de pared vesicular >4mm, litiasis impactada), Analítica (leucocitosis, amilasa).",
      treatment: "Colecistectomía laparoscópica precoz, fluidoterapia, analgesia, antibióticos."
    }
  ]);

  const sugSafety = `
## Guía de Seguridad en Quirófano
- **Checklist Quirúrgico OMS**: Participar activamente en la verificación del paciente, sitio quirúrgico y procedimiento antes de la inducción.
- **Conteo de gasas**: Velar por el recuento correcto de gasas, agujas e instrumental antes del cierre de cavidades.
- **Uso seguro del bisturí eléctrico**: Evitar quemaduras asegurando la correcta colocación de la placa neutra en el paciente.
  `;

  const sugResources = JSON.stringify([
    { title: "Manual de Cirugía General de la AEC 2022", url: "https://www.aecirujanos.es" }
  ]);

  await prisma.prepModule.create({
    data: {
      serviceId: sSurgeryProv.id,
      guide: sugGuide,
      objectives: sugObjectives,
      expectations: sugExpectations,
      diagnoses: sugDiagnoses,
      safetyGuide: sugSafety,
      resources: sugResources,
    },
  });

  // 5.4 Cardiology
  const cardGuide = `
# GUÍA DEL SERVICIO DE CARDIOLOGÍA
## Funcionamiento del Servicio
El Servicio de Cardiología atiende patología cardiovascular en planta, consultas, unidad coronaria y gabinete de pruebas no invasivas (ecocardiograma, ergometría).
- **Horario diario**: 08:15h Sesión de planta and asignación de camas. Visitas médicas de 09:00h a 13:30h.
- **Normas**: Vestimenta formal de bata blanca, fonendoscopio y puntualidad en las sesiones de discusión electrocardiográfica.
  `;

  const cardObjectives = JSON.stringify([
    "Saber registrar e interpretar un ECG de 12 derivaciones (frecuencia, ritmo, eje, intervalos y alteraciones isquémicas).",
    "Realizar una auscultación cardíaca sistemática reconociendo los principales soplos valvulares.",
    "Formular el diagnóstico y plan terapéutico de un Síndrome Coronario Agudo con y sin elevación del segmento ST."
  ]);

  const cardExpectations = `
## Expectativas de los Cardiólogos
- **Destreza en ECG**: Esperamos que el alumno intente una lectura sistemática del ECG antes de preguntar el diagnóstico.
- **Auscultación**: Practicar activamente la auscultación en todos los pacientes de planta y comentar los hallazgos en el pase.
  `;

  const cardDiagnoses = JSON.stringify([
    {
      name: "Fibrilación Auricular (FA)",
      definition: "Arritmia supraventricular caracterizada por una activación auricular desorganizada y descoordinada con frecuencia ventricular irregular.",
      symptoms: "Palpitaciones, fatiga, disnea de esfuerzo, mareo, en ocasiones asintomática.",
      signs: "Pulso arrítmico, variabilidad en la intensidad del primer tono cardíaco.",
      tests: "ECG de 12 derivaciones (ausencia de ondas P, línea de base irregular y R-R absolutamente irregular).",
      treatment: "Control de frecuencia (beta-bloqueantes, digoxina), control de ritmo (antiarrítmicos, cardioversión), anticoagulación según escala CHA2DS2-VASc."
    },
    {
      name: "Síndrome Coronario Agudo (SCA)",
      definition: "Isquemia miocárdica aguda debido al desequilibrio entre el aporte y la demanda de oxígeno miocárdico, habitualmente por rotura de placa aterosclerótica.",
      symptoms: "Dolor opresivo retroesternal irradiado a brazo izquierdo o mandíbula, disnea, sudoración fría, náuseas.",
      signs: "Normales en inicio, signos de insuficiencia cardíaca si infarto extenso.",
      tests: "ECG seriados (elevación o descenso del ST, ondas T invertidas), Troponinas ultrasensibles seriadas.",
      treatment: "Doble antiagregación (Aspirina + Clopidogrel/Ticagrelor), reperfusión inmediata (angioplastia primaria) en SCACEST, anticoagulación, antianginosos."
    }
  ]);

  const cardSafety = `
## Guía de Seguridad en Pruebas de Cardiología
- **Reconocimiento de emergencias**: Identificar ritmos de parada cardíaca (FV, TV sin pulso) durante la monitorización.
- **Manejo del desfibrilador**: Conocer la ubicación y funcionamiento básico del carro de paradas y desfibrilador del servicio.
  `;

  const cardResources = JSON.stringify([
    { title: "Guías de la Sociedad Europea de Cardiología ESC Clinical Practice Guidelines", url: "https://www.escardio.org" }
  ]);

  await prisma.prepModule.create({
    data: {
      serviceId: sCardioProv.id,
      guide: cardGuide,
      objectives: cardObjectives,
      expectations: cardExpectations,
      diagnoses: cardDiagnoses,
      safetyGuide: cardSafety,
      resources: cardResources,
    },
  });

  // 5.5 Gynaecology & Obstetrics (Obstetricia y Ginecología)
  const gynGuide = `
# GUÍA DEL SERVICIO DE OBSTETRICIA Y GINECOLOGÍA
## Funcionamiento del Servicio
El Servicio abarca paritorio, planta de hospitalización ginecológica y obstétrica, y consultas externas.
- **Horario diario**: 08:00h Pase de guardia en paritorio. Visitas planta 08:30h. Consultas externas y quirófanos a partir de las 09:00h.
- **Conducta y privacidad**: Máxima sensibilidad en el paritorio y respeto absoluto de la intimidad física y emocional de la paciente. Solicitar siempre consentimiento previo.
  `;

  const gynObjectives = JSON.stringify([
    "Acompañar e identificar las fases del parto normal en el paritorio.",
    "Realizar una historia clínica ginecológica centrada en antecedentes obstétricos y exploración mamaria básica.",
    "Reconocer los signos clínicos de alarma en la gestante (preeclampsia, sangrado)."
  ]);

  const gynExpectations = `
## Expectativas de los Obstetras/Ginecólogos
- **Respeto a la intimidad**: Preguntar siempre a la paciente si consiente la presencia del alumno antes de iniciar cualquier examen ginecológico u obstétrico.
- **Participación respetuosa**: Entender el paritorio como un espacio de alta carga emocional donde la paciente es la absoluta protagonista.
  `;

  const gynDiagnoses = JSON.stringify([
    {
      name: "Preeclampsia",
      definition: "Trastorno multisistémico del embarazo caracterizado por hipertensión de nueva aparición (>140/90 mmHg) después de las 20 semanas de gestación, asociada a proteinuria.",
      symptoms: "Cefalea persistente, alteraciones visuales (escotomas), epigastralgia (dolor de boca del estómago), edemas súbitos.",
      signs: "Presión arterial >=140/90 mmHg, hiperreflexia.",
      tests: "Toma de tensión, Proteinuria en orina de 24 horas (>300mg) o cociente proteína/creatinina, Analítica con enzimas hepáticas y plaquetas.",
      treatment: "Control tensional (Labetalol, Hidralazina), Sulfato de Magnesio para prevención de crisis convulsivas, finalización del embarazo según edad gestacional y gravedad."
    }
  ]);

  const gynSafety = `
## Guía de Seguridad en Obstetricia
- **Consentimiento explícito**: Nunca realizar una exploración ginecológica sin el consentimiento explícito e informado de la paciente.
- **Seguridad en paritorio**: Seguir rigurosamente los protocolos de asepsia en el canal de parto y el alumbramiento.
  `;

  const gynResources = JSON.stringify([
    { title: "Guías Clínicas Asistenciales de la SEGO", url: "https://sego.es" }
  ]);

  await prisma.prepModule.create({
    data: {
      serviceId: sGynGeneral.id,
      guide: gynGuide,
      objectives: gynObjectives,
      expectations: gynExpectations,
      diagnoses: gynDiagnoses,
      safetyGuide: gynSafety,
      resources: gynResources,
    },
  });

  // 5.6 Paediatrics
  const pedGuide = `
# GUÍA DEL SERVICIO DE PEDIATRÍA
## Funcionamiento del Servicio
El Servicio incluye hospitalización pediátrica, urgencias pediátricas, neonatología y consultas de especialidades.
- **Horario**: 08:00h Pase de guardia y visitas de planta. 09:30h Consultas o atención en Urgencias.
- **Conducta**: Comunicación adaptada a la edad del niño y a sus progenitores. Generar un entorno de confianza y juego para la exploración.
  `;

  const pedObjectives = JSON.stringify([
    "Calcular de forma precisa dosis pediátricas basadas en el peso del paciente.",
    "Realizar una exploración física adaptada a la edad del lactante y el niño.",
    "Reconocer clínicamente la dificultad respiratoria en el lactante (escalas de valoración como Wood-Downes)."
  ]);

  const pedExpectations = `
## Expectativas de los Pediatras
- **Adaptabilidad**: Explicar los procedimientos al niño de forma lúdica y a los padres de forma clara.
- **Precisión de cálculo**: Nunca prescribir o proponer una dosis de fármaco sin verificar previamente el cálculo por kg de peso.
  `;

  const pedDiagnoses = JSON.stringify([
    {
      name: "Bronquiolitis Aguda",
      definition: "Primer episodio de sibilancias e infección de vías respiratorias bajas en un lactante menor de 24 meses, generalmente de etiología viral (VRS).",
      symptoms: "Mucosidad nasal, tos progresiva, rechazo alimentario, sibilancias fatiga al respirar.",
      signs: "Taquipnea, tiraje subcostal e intercostal, aleteo nasal, crepitantes o sibilancias espiratorias a la auscultación.",
      tests: "Diagnóstico fundamentalmente clínico, pulsioximetría, test rápido VRS en secreciones nasofaríngeas.",
      treatment: "Soporte respiratorio (oxigenoterapia si saturación <90-92%), hidratación adecuada, lavado nasal frecuente con aspiración, cabecera elevada."
    }
  ]);

  const pedSafety = `
## Guía de Seguridad en Pediatría
- **Doble check en dosificación**: Verificar siempre las dosis de medicamentos críticos (p. ej. paracetamol, ibuprofeno, corticoides) para evitar sobredosis accidentales.
- **Prevención de caídas**: Mantener siempre subidas las barandillas de las cunas y camas de los lactantes hospitalizados.
  `;

  const pedResources = JSON.stringify([
    { title: "Protocolos Diagnósticos y Terapéuticos de la AEP", url: "https://www.aeped.es" }
  ]);

  await prisma.prepModule.create({
    data: {
      serviceId: sPedLaPlana.id,
      guide: pedGuide,
      objectives: pedObjectives,
      expectations: pedExpectations,
      diagnoses: pedDiagnoses,
      safetyGuide: pedSafety,
      resources: pedResources,
    },
  });

  // 6. Create Rubrics
  const rubricTutor = await prisma.rubric.create({
    data: {
      nombre: "Rúbrica Estándar de Evaluación del Tutor (Mini-CEX)",
      descripcion: "Evaluación por competencias del estudiante al finalizar la rotación.",
      tipo: "eval_estudiante",
      activo: true,
    },
  });

  const criteriaList = [
    { nombre: "C1. Historia clínica", descripcion: "Habilidad para interrogar al paciente y estructurar sus antecedentes y motivo de consulta." },
    { nombre: "C2. Exploración física", descripcion: "Técnica exploración y detección de hallazgos patológicos relevantes." },
    { nombre: "C3. Razonamiento clínico", descripcion: "Capacidad de elaborar hipótesis diagnósticas y justificar pruebas complementarias." },
    { nombre: "C4. Habilidades de comunicación", descripcion: "Empatía, claridad de lenguaje y comunicación con el paciente y el equipo." },
    { nombre: "C5. Habilidades procedimentales", descripcion: "Realización segura y aséptica de técnicas de la especialidad." },
    { nombre: "C6. Profesionalidad y actitud", descripcion: "Puntualidad, iniciativa, respeto, proactividad y trabajo en equipo." },
    { nombre: "C7. Aprendizaje autodirigido", descripcion: "Detección de lagunas propias de conocimiento e investigación autónoma." },
  ];

  for (const c of criteriaList) {
    await prisma.rubricCriterion.create({
      data: {
        rubricId: rubricTutor.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        minValor: 1,
        maxValor: 5,
        peso: 1.0,
      },
    });
  }

  // 7. Seed Virtual Patient Cases
  await prisma.virtualPatientCase.create({
    data: {
      title: "Paciente con Disnea Aguda",
      description: "Paciente varón de 68 años acude a urgencias por sensación de ahogo y fatiga progresiva de 3 días de evolución.",
      specialty: "Medicina Interna",
      systemPrompt: "Eres Juan, un jubilado de 68 años con antecedentes de hipertensión e infarto hace 5 años. Hablas de forma pausada y con frases cortas porque te cansas. Tienes insuficiencia cardíaca. Si te preguntan por tos, di que es seca. Si preguntan por las piernas, di que las tienes muy hinchadas desde el martes.",
      initialMessage: "Hola doctor... me ahogo mucho, casi no he podido dormir esta noche.",
      hiddenDiagnosis: "Insuficiencia Cardíaca Reagudizada",
      scoringRubric: JSON.stringify([
        { item: "Preguntar sobre antecedentes cardíacos", weight: 20 },
        { item: "Explorar la presencia de edema en las piernas", weight: 20 },
        { item: "Indagar sobre ortopnea (dormir incorporado)", weight: 20 },
        { item: "Preguntar sobre dolor en el pecho", weight: 20 },
        { item: "Preguntar sobre hábitos higiénico-dietéticos (sal)", weight: 20 }
      ]),
    }
  });

  await prisma.virtualPatientCase.create({
    data: {
      title: "Dolor Torácico de Perfil Isquémico",
      description: "Paciente mujer de 59 años con antecedentes de dislipemia acude por dolor opresivo retroesternal irradado a cuello.",
      specialty: "Cardiología",
      systemPrompt: "Eres Carmen, una administrativa de 59 años. Tienes dolor opresivo en el centro del pecho que comenzó hace 2 horas mientras subías las escaleras. Sientes náuseas y sudor frío. Tienes antecedentes de colesterol alto pero no tomas medicación regularmente.",
      initialMessage: "Buenas doctor, me duele muchísimo el pecho, como si tuviera un elefante sentado encima...",
      hiddenDiagnosis: "Síndrome Coronario Agudo (Infarto de Miocardio)",
      scoringRubric: JSON.stringify([
        { item: "Preguntar sobre irradiación del dolor", weight: 25 },
        { item: "Indagar sobre inicio del dolor (esfuerzo)", weight: 25 },
        { item: "Preguntar sobre síntomas acompañantes (náuseas, sudoración)", weight: 25 },
        { item: "Preguntar sobre factores de riesgo (tabaco, dislipemia)", weight: 25 }
      ]),
    }
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
