import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// ── RAG Chatbot Assistant ───────────────────────────────────────────────────

router.post("/assistant/chat", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { message, serviceId } = req.body || {};
  if (!message) return res.status(400).json({ message: "Mensaje vacío" });

  try {
    // 1. Fetch knowledge sources (guides, safety guidelines, and diagnoses)
    let contextDocs: string[] = [];
    
    if (serviceId) {
      const prep = await prisma.prepModule.findUnique({
        where: { serviceId },
        include: { service: true },
      });
      if (prep) {
        contextDocs.push(`Guía del Servicio: ${prep.guide}`);
        contextDocs.push(`Expectativas de Tutores: ${prep.expectations}`);
        contextDocs.push(`Diagnósticos Frecuentes: ${prep.diagnoses}`);
        contextDocs.push(`Guía de Seguridad: ${prep.safetyGuide}`);
      }
    } else {
      // General guidelines fallback
      const preps = await prisma.prepModule.findMany({ take: 3 });
      preps.forEach(p => {
        contextDocs.push(`Módulo ${p.serviceId} - Guía de Seguridad: ${p.safetyGuide}`);
      });
    }

    // 2. Simple keyword-based RAG matching for citation extraction
    const query = String(message).toLowerCase();
    const citations: string[] = [];

    if (query.includes("insuficiencia cardíaca") || query.includes("cardiac")) {
      citations.push("Guía de Medicina Interna - Diagnóstico: Insuficiencia Cardíaca Reagudizada");
    }
    if (query.includes("neumonía") || query.includes("infección") || query.includes("nac")) {
      citations.push("Guía de Medicina Interna - Diagnóstico: Neumonía Adquirida en la Comunidad (NAC)");
    }
    if (query.includes("renal") || query.includes("creatinina") || query.includes("ira")) {
      citations.push("Guía de Medicina Interna - Diagnóstico: Insuficiencia Renal Aguda (IRA)");
    }
    if (query.includes("mano") || query.includes("lavado") || query.includes("higiene")) {
      citations.push("Guía de Seguridad - Protocolo OMS de Higiene de Manos");
    }
    if (query.includes("pinchazo") || query.includes("aguja") || query.includes("accidente")) {
      citations.push("Guía de Seguridad - Protocolo de Accidentes de Exposición Biológica UJI");
    }

    // Mock RAG completion response utilizing citations
    let responseText = "Hola, soy tu asistente de Mediloop. Basado en las guías docentes de la UJI: ";
    if (citations.length > 0) {
      responseText += `\nHe encontrado información relevante en:\n${citations.map(c => `• [${c}]`).join("\n")}\n\n`;
      if (query.includes("pinchazo") || query.includes("aguja")) {
        responseText += "En caso de pinchazo accidental, debes lavar inmediatamente la herida con agua y jabón, informar a tu tutor para registrar la incidencia y acudir al servicio de Urgencias del hospital para iniciar el protocolo biológico en las primeras 2 horas.";
      } else if (query.includes("insuficiencia cardíaca")) {
        responseText += "La insuficiencia cardíaca reagudizada suele cursar con crepitantes pulmonares, ingurgitación yugular y edema. Las pruebas iniciales clave son el ECG, Radiografía de tórax (líneas B de Kerley) y NT-proBNP. El tratamiento prioritario consiste en oxigenoterapia y diuréticos de asa (Furosemida) intravenosos.";
      } else {
        responseText += "Recuerda que estas guías son informativas y orientadas a tu preparación docente. No debes usarlas para tomar decisiones clínicas con pacientes reales sin la supervisión de tu tutor.";
      }
    } else {
      responseText += "No he encontrado un apartado específico en las guías de rotación actuales para tu consulta, pero te sugiero consultar a tu tutor de planta o revisar los recursos de la Biblioteca Docente.";
    }

    return res.json({
      answer: responseText,
      citations: citations.length > 0 ? citations : ["Directrices Generales Mediloop UJI"],
    });
  } catch (err) {
    return res.status(500).json({ message: "Error en el chat de IA" });
  }
});

// ── Voice-to-Rubric & Rubric Extraction ──────────────────────────────────────

router.post("/rubric/extract", requireAuth, requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  const { feedbackText } = req.body || {};
  if (!feedbackText || feedbackText.trim().length < 10) {
    return res.status(400).json({ message: "Texto de feedback muy corto para extraer puntuaciones" });
  }

  try {
    const text = String(feedbackText).toLowerCase();
    
    // Rule-based score extractor mimicking LLM parsing for absolute stability and performance
    const scores = {
      history: 3,
      physical: 3,
      reasoning: 3,
      communication: 3,
      procedure: 3,
      professionalism: 3,
      selfLearning: 3,
    };

    // Extracting scores from text hints
    if (text.includes("excelente historia") || text.includes("anamnesis impecable")) scores.history = 5;
    else if (text.includes("buena historia") || text.includes("historia clinica completa")) scores.history = 4;
    else if (text.includes("mejorar historia") || text.includes("fragmentada")) scores.history = 2;

    if (text.includes("explora muy bien") || text.includes("perfecta exploración")) scores.physical = 5;
    else if (text.includes("exploración correcta")) scores.physical = 4;
    else if (text.includes("olvida explorar") || text.includes("incorrecta técnica")) scores.physical = 2;

    if (text.includes("brillante razonamiento") || text.includes("excelente juicio")) scores.reasoning = 5;
    else if (text.includes("buen razonamiento")) scores.reasoning = 4;
    else if (text.includes("le cuesta razonar") || text.includes("sin hipótesis")) scores.reasoning = 2;

    if (text.includes("gran empatía") || text.includes("comunica genial")) scores.communication = 5;
    else if (text.includes("buena comunicación")) scores.communication = 4;
    else if (text.includes("poco empático") || text.includes("problemas de comunicación")) scores.communication = 2;

    if (text.includes("gran destreza") || text.includes("sutura perfecto")) scores.procedure = 5;
    else if (text.includes("procedimientos correctos")) scores.procedure = 4;
    else if (text.includes("no realiza técnicas") || text.includes("le da miedo")) scores.procedure = 2;

    if (text.includes("liderazgo") || text.includes("supera expectativas")) scores.professionalism = 5;
    else if (text.includes("muy responsable") || text.includes("puntual")) scores.professionalism = 4;
    else if (text.includes("falta de puntualidad") || text.includes("impuntual") || text.includes("actitud pasiva")) scores.professionalism = 2;

    if (text.includes("lee muchísimo") || text.includes("aprende solo")) scores.selfLearning = 5;
    else if (text.includes("proactivo en dudas") || text.includes("busca feedback")) scores.selfLearning = 4;
    else if (text.includes("no muestra iniciativa") || text.includes("pasivo")) scores.selfLearning = 2;

    return res.json({ scores });
  } catch (err) {
    return res.status(500).json({ message: "Error al extraer puntuaciones" });
  }
});

// ── AI Training Zone (Virtual Patient & Socratic Interpreters) ────────────────

// Get Virtual Patient Cases List
router.get("/training/cases", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cases = await prisma.virtualPatientCase.findMany({
      select: { id: true, title: true, description: true, specialty: true, hiddenDiagnosis: true },
    });
    
    // Seed a fallback case if empty
    if (cases.length === 0) {
      const sampleCase = await prisma.virtualPatientCase.create({
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
        },
      });
      return res.json([sampleCase]);
    }
    
    return res.json(cases);
  } catch (err) {
    return res.status(500).json({ message: "Error al cargar casos de entrenamiento" });
  }
});

// Initialize Virtual Patient Session
router.post("/training/sessions", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.body || {};
  if (!caseId) return res.status(400).json({ message: "Falta caseId" });

  try {
    const patientCase = await prisma.virtualPatientCase.findUnique({ where: { id: caseId } });
    if (!patientCase) return res.status(404).json({ message: "Caso no encontrado" });

    const session = await prisma.virtualPatientSession.create({
      data: {
        caseId,
        studentId: req.user!.sub,
        transcript: JSON.stringify([{ role: "patient", text: patientCase.initialMessage }]),
        isCompleted: false,
      },
    });

    return res.status(201).json({
      sessionId: session.id,
      title: patientCase.title,
      initialMessage: patientCase.initialMessage,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al crear sesión de entrenamiento" });
  }
});

// Send message to Virtual Patient
router.post("/training/sessions/:id/chat", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ message: "Mensaje vacío" });

  try {
    const session = await prisma.virtualPatientSession.findUnique({
      where: { id: String(req.params.id) },
      include: { case: true },
    });

    if (!session || session.isCompleted) {
      return res.status(404).json({ message: "Sesión activa no encontrada o ya finalizada" });
    }

    const transcript = JSON.parse(session.transcript) as { role: string; text: string }[];
    transcript.push({ role: "student", text: message });

    // Roleplay response logic based on case system prompt
    let responseText = "";
    const msgLower = String(message).toLowerCase();
    
    if (msgLower.includes("pecho") || msgLower.includes("dolor")) {
      responseText = "No me duele el pecho, doctor, solo siento como un peso aquí encima y que no me entra el aire.";
    } else if (msgLower.includes("pierna") || msgLower.includes("pie") || msgLower.includes("hinchado")) {
      responseText = "Sí, se me han puesto las piernas muy hinchadas e infladas, los calcetines me dejan una marca tremenda.";
    } else if (msgLower.includes("dormir") || msgLower.includes("almohada")) {
      responseText = "He tenido que dormir en el sillón incorporado con tres almohadas, tumbado en la cama no puedo respirar.";
    } else if (msgLower.includes("pastilla") || msgLower.includes("toma") || msgLower.includes("medicamento")) {
      responseText = "Tomo una pastilla para la tensión y otra para el colesterol... pero a veces se me olvida tomarlas, la verdad.";
    } else if (msgLower.includes("antecedente") || msgLower.includes("corazon") || msgLower.includes("infarto")) {
      responseText = "Sí, me dio un amago de infarto hace 5 años y me pusieron un muelle, un stent creo que lo llaman.";
    } else if (msgLower.includes("sal") || msgLower.includes("comer") || msgLower.includes("dieta")) {
      responseText = "Me gusta mucho el jamoncito y comer con sal... no he hecho mucha dieta últimamente.";
    } else {
      responseText = "No le entiendo muy bien, doctor... me canso mucho al hablar. ¿Qué me ocurre?";
    }

    transcript.push({ role: "patient", text: responseText });

    await prisma.virtualPatientSession.update({
      where: { id: String(req.params.id) },
      data: { transcript: JSON.stringify(transcript) },
    });

    return res.json({ response: responseText });
  } catch (err) {
    return res.status(500).json({ message: "Error al chatear con paciente virtual" });
  }
});

// Finalize and Evaluate Virtual Patient Session
router.post("/training/sessions/:id/evaluate", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await prisma.virtualPatientSession.findUnique({
      where: { id: String(req.params.id) },
      include: { case: true },
    });

    if (!session || session.isCompleted) {
      return res.status(404).json({ message: "Sesión activa no encontrada" });
    }

    const transcript = JSON.parse(session.transcript) as { role: string; text: string }[];
    const transcriptText = transcript.map(t => t.text).join(" ").toLowerCase();
    
    // Score calculation based on rubric item keywords searched in transcript
    const rubric = JSON.parse(session.case.scoringRubric) as { item: string; weight: number }[];
    let totalScore = 0;
    const feedbackItems: string[] = [];

    const criteriaCheck = [
      { key: ["infarto", "antecedente", "corazón"], label: "Preguntar sobre antecedentes cardíacos", score: 20 },
      { key: ["pierna", "hinchada", "edema"], label: "Explorar la presencia de edema en las piernas", score: 20 },
      { key: ["dormir", "almohada", "ortopnea"], label: "Indagar sobre ortopnea (dormir incorporado)", score: 20 },
      { key: ["pecho", "dolor", "opresión"], label: "Preguntar sobre dolor en el pecho", score: 20 },
      { key: ["sal", "dieta", "comida"], label: "Preguntar sobre hábitos higiénico-dietéticos (sal)", score: 20 },
    ];

    criteriaCheck.forEach(crit => {
      const found = crit.key.some(k => transcriptText.includes(k));
      if (found) {
        totalScore += crit.score;
        feedbackItems.push(`✅ Has cubierto: "${crit.label}".`);
      } else {
        feedbackItems.push(`❌ Has omitido: "${crit.label}". Era importante preguntar esto.`);
      }
    });

    let overallFeedback = `Puntuación obtenida: ${totalScore}/100.\n\n`;
    if (totalScore >= 80) {
      overallFeedback += "¡Excelente trabajo! Has realizado una historia clínica muy completa y detectado todos los factores de riesgo clave.";
    } else if (totalScore >= 60) {
      overallFeedback += "Buen intento. Has detectado los síntomas principales, pero recuerda profundizar más en los antecedentes y hábitos dietéticos.";
    } else {
      overallFeedback += "Insuficiente. Debes enfocar el interrogatorio de forma más estructurada en pacientes con dificultad respiratoria.";
    }

    const feedbackText = `${overallFeedback}\n\nDetalle por competencias:\n${feedbackItems.join("\n")}`;

    await prisma.virtualPatientSession.update({
      where: { id: String(req.params.id) },
      data: {
        isCompleted: true,
        score: totalScore,
        feedback: feedbackText,
      },
    });

    return res.json({
      score: totalScore,
      feedback: feedbackText,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al evaluar sesión" });
  }
});

// Socratic ECG / X-Ray Interpreter
router.post("/training/socratic", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  const { type, step, answer } = req.body || {};
  if (!type || step === undefined) return res.status(400).json({ message: "Faltan parámetros" });

  // Mocking Socratic guidance flow (acidosis, rate, rhythm, intervals...)
  let responseText = "";
  let isCorrect = false;

  const ans = String(answer).toLowerCase().trim();

  if (type === "abg") {
    // ABG stepwise reasoning
    if (step === 1) {
      // Step 1: Is pH acidotic or alkalotic? (vignette: pH 7.28, pCO2 55, HCO3 26)
      if (ans.includes("acido") || ans.includes("acidosis")) {
        responseText = "Correcto. El pH está por debajo de 7.35, indicando acidosis. Ahora paso 2: ¿Cuál es el trastorno primario? Mira la pCO2 (55 mmHg) y el HCO3 (26 mEq/L).";
        isCorrect = true;
      } else {
        responseText = "Incorrecto. Un pH de 7.28 es menor de 7.35, lo que representa una...";
      }
    } else if (step === 2) {
      // Step 2: Primary disorder?
      if (ans.includes("respiratorio") || ans.includes("pco2")) {
        responseText = "Excelente. La pCO2 está elevada (55 > 45), explicando la acidosis respiratoria. Paso 3: ¿Existe compensación renal? (Revisa el nivel de HCO3).";
        isCorrect = true;
      } else {
        responseText = "No. Si la pCO2 está alta y el HCO3 está casi normal, ¿es respiratorio o metabólico?";
      }
    }
  } else if (type === "ecg") {
    // ECG stepwise reasoning
    if (step === 1) {
      // Step 1: Rate
      if (ans.includes("150") || ans.includes("taquicardia")) {
        responseText = "Correcto. La frecuencia cardíaca estimada es de unos 150 lpm. Paso 2: ¿Es el ritmo regular o irregular?";
        isCorrect = true;
      } else {
        responseText = "Inténtalo de nuevo. Cuenta los cuadros grandes entre complejos R-R y divide 300 entre ese número.";
      }
    }
  }

  return res.json({
    message: responseText || "Comportamiento socrático simulado con éxito. ¡Continúa razonando!",
    isCorrect,
  });
});

export default router;
