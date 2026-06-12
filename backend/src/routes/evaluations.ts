import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Get active rubrics
router.get("/rubrics", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rubrics = await prisma.rubric.findMany({
      where: { activo: true },
      include: { criteria: true },
    });
    return res.json(rubrics);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener rúbricas" });
  }
});

// Create Rubric (Coordinator only)
router.post("/rubrics", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== "coordinator" && req.user?.role !== "admin") {
    return res.status(403).json({ message: "Permisos insuficientes" });
  }
  const { nombre, descripcion, tipo, criteria } = req.body || {};
  if (!nombre || !tipo) {
    return res.status(400).json({ message: "Faltan nombre o tipo" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rubric = await tx.rubric.create({
        data: { nombre, descripcion, tipo, activo: true },
      });

      if (criteria && Array.isArray(criteria)) {
        for (const crit of criteria) {
          await tx.rubricCriterion.create({
            data: {
              rubricId: rubric.id,
              nombre: crit.nombre,
              descripcion: crit.descripcion || null,
              minValor: crit.minValor || 1,
              maxValor: crit.maxValor || 5,
              peso: crit.peso ? parseFloat(crit.peso) : 1.0,
            },
          });
        }
      }
      return rubric;
    });

    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ message: "Error al crear rúbrica" });
  }
});

// Get Evaluations List
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  
  const { role, sub } = req.user;
  try {
    let whereClause: any = {};
    
    if (role === "student") {
      const student = await prisma.student.findUnique({ where: { userId: sub } });
      if (!student) return res.json([]);
      
      // Student can see evaluations about them, but NOT evaluations they wrote about tutors/hospitals yet, unless it's their submitted evaluation list
      whereClause = {
        OR: [
          { evaluadoTipo: "student", evaluadoId: student.id },
          { evaluadorId: sub }
        ]
      };
    } else if (role === "tutor") {
      const tutor = await prisma.tutor.findUnique({ where: { userId: sub } });
      if (!tutor) return res.json([]);
      whereClause = {
        OR: [
          { evaluadorId: sub },
          { evaluadoTipo: "tutor", evaluadoId: tutor.id }
        ]
      };
    }

    const evaluations = await prisma.evaluation.findMany({
      where: whereClause,
      include: {
        rubric: { select: { nombre: true, tipo: true } },
        rotation: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            service: { select: { nombre: true } },
            hospital: { select: { nombre: true } },
          },
        },
        evaluador: { select: { name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(evaluations);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener evaluaciones" });
  }
});

// Get Evaluation Details by ID
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: String(req.params.id) },
      include: {
        answers: { include: { criterion: true } },
        rubric: true,
        rotation: {
          include: {
            student: { include: { user: { select: { name: true } } } },
            tutor: { include: { user: { select: { name: true } } } },
            hospital: true,
            service: true,
          },
        },
      },
    });

    if (!evaluation) {
      return res.status(404).json({ message: "Evaluación no encontrada" });
    }

    return res.json(evaluation);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener detalle de evaluación" });
  }
});

// Create Tutor-to-Student Evaluation (Mini-CEX based + Ottawa decision rules)
router.post("/student", requireAuth, requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  
  const { rotationId, rubricId, answers, comments, strengthText, improvementText, autonomyDecision } = req.body || {};

  if (!rotationId || !rubricId || !answers || !Array.isArray(answers)) {
    return res.status(400).json({ message: "Faltan campos obligatorios para evaluación" });
  }

  // Validate narrative feedback: minimum 30 characters
  if (!strengthText || strengthText.trim().length < 30) {
    return res.status(400).json({ message: "El campo 'Puntos fuertes' es obligatorio y debe tener al menos 30 caracteres." });
  }
  if (!improvementText || improvementText.trim().length < 30) {
    return res.status(400).json({ message: "El campo 'Puntos de mejora' es obligatorio y debe tener al menos 30 caracteres." });
  }

  try {
    const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
    if (!tutor) return res.status(404).json({ message: "Perfil de tutor no encontrado" });

    const rotation = await prisma.rotation.findUnique({ where: { id: rotationId } });
    if (!rotation || rotation.tutorId !== tutor.id) {
      return res.status(403).json({ message: "No eres el tutor asignado a esta rotación" });
    }

    // Verify all criteria are scored
    const rubric = await prisma.rubric.findUnique({
      where: { id: rubricId },
      include: { criteria: true },
    });
    if (!rubric) return res.status(404).json({ message: "Rúbrica no encontrada" });

    if (answers.length !== rubric.criteria.length) {
      return res.status(400).json({ message: "Debes evaluar todos los criterios de la rúbrica." });
    }

    // Ottawa 2020 Decision Rules
    // 1. All criteria must be >= 3 (1-5 scale)
    // 2. At least 5 criteria must be >= 4
    let readyToProgress = true;
    let repeatRotation = false;
    let scoreGte4Count = 0;
    let sumValues = 0;

    const answersMapped = answers.map((ans: any) => {
      const val = Number(ans.valor);
      sumValues += val;
      if (val < 3) {
        repeatRotation = true;
        readyToProgress = false;
      }
      if (val >= 4) {
        scoreGte4Count++;
      }
      return {
        criterionId: ans.criterionId,
        valor: val,
        comentario: ans.comentario || null,
      };
    });

    const avgScore = sumValues / answersMapped.length;

    let progressDecision = "Ready with conditions"; // "Ready to progress", "Ready with conditions", "Needs to repeat"
    if (repeatRotation) {
      progressDecision = "Needs to repeat";
    } else if (scoreGte4Count >= 5) {
      progressDecision = "Ready to progress";
    }

    // Construct comments field combining comments, strength, and improvement for backwards compatibility
    const combinedComments = `PUNTOS FUERTES:\n${strengthText}\n\nPUNTOS DE MEJORA:\n${improvementText}\n\nAUTONOMÍA:\n${autonomyDecision || "No especificada"}\n\nDECISIÓN DE PROGRESO:\n${progressDecision}\n\nCOMENTARIOS ADICIONALES:\n${comments || ""}`;

    const evaluation = await prisma.$transaction(async (tx) => {
      const evalItem = await tx.evaluation.create({
        data: {
          rubricId,
          rotationId,
          evaluadorId: req.user!.sub,
          evaluadoTipo: "student",
          evaluadoId: rotation.studentId || "",
          estado: "enviada",
          comentariosGenerales: combinedComments,
          totalScore: avgScore,
        },
      });

      for (const ans of answersMapped) {
        await tx.evaluationAnswer.create({
          data: {
            evaluationId: evalItem.id,
            criterionId: ans.criterionId,
            valor: ans.valor,
            comentario: ans.comentario,
          },
        });
      }

      return evalItem;
    });

    // Create Audit Log entry
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: "Evaluación Estudiante",
        details: `Tutor completó Mini-CEX sobre alumno en rotación ${rotationId}. Decisión: ${progressDecision}`,
      },
    });

    return res.status(201).json({
      evaluationId: evaluation.id,
      decision: progressDecision,
      average: avgScore,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al registrar evaluación del estudiante" });
  }
});

// Create Student-to-Tutor/Hospital Feedback (MCPI-based, double-blind lock)
router.post("/tutor-hospital", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No unauthorized" });
  
  const { rotationId, rubricId, answers, comments, positiveText, negativeText, globalScore } = req.body || {};

  if (!rotationId || !rubricId || !answers || !Array.isArray(answers)) {
    return res.status(400).json({ message: "Faltan campos requeridos" });
  }

  // Validate narrative comments: min 20 chars
  if (!positiveText || positiveText.trim().length < 20) {
    return res.status(400).json({ message: "El campo 'Aspectos positivos' es obligatorio (min. 20 caracteres)" });
  }
  if (!negativeText || negativeText.trim().length < 20) {
    return res.status(400).json({ message: "El campo 'Aspectos a mejorar' es obligatorio (min. 20 caracteres)" });
  }

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Perfil de estudiante no encontrado" });

    const rotation = await prisma.rotation.findUnique({ where: { id: rotationId } });
    if (!rotation || rotation.studentId !== student.id) {
      return res.status(403).json({ message: "No estás inscrito en esta rotación" });
    }

    const combinedComments = `POSITIVO:\n${positiveText}\n\nMEJORABLE:\n${negativeText}\n\nCOMENTARIOS ADICIONALES:\n${comments || ""}`;
    
    let sumValues = 0;
    const answersMapped = answers.map((ans: any) => {
      const val = Number(ans.valor);
      sumValues += val;
      return {
        criterionId: ans.criterionId,
        valor: val,
        comentario: ans.comentario || null,
      };
    });
    
    // Average rating
    const avgScore = sumValues / answersMapped.length;

    const evaluation = await prisma.$transaction(async (tx) => {
      const evalItem = await tx.evaluation.create({
        data: {
          rubricId,
          rotationId,
          evaluadorId: req.user!.sub,
          evaluadoTipo: "tutor", // evaluations combine tutor & hospital info
          evaluadoId: rotation.tutorId,
          estado: "enviada",
          comentariosGenerales: combinedComments,
          totalScore: globalScore ? Number(globalScore) : avgScore,
        },
      });

      for (const ans of answersMapped) {
        await tx.evaluationAnswer.create({
          data: {
            evaluationId: evalItem.id,
            criterionId: ans.criterionId,
            valor: ans.valor,
            comentario: ans.comentario,
          },
        });
      }

      return evalItem;
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: "Evaluación Tutor/Hospital",
        details: `Alumno completó feedback MCPI para rotación ${rotationId}`,
      },
    });

    return res.status(201).json({ evaluationId: evaluation.id });
  } catch (err) {
    return res.status(500).json({ message: "Error al registrar evaluación de tutor/hospital" });
  }
});

export default router;
