import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Get Prep Module content for a service
router.get("/modules/:serviceId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prepModule = await prisma.prepModule.findUnique({
      where: { serviceId: String(req.params.serviceId) },
      include: {
        service: {
          select: {
            nombre: true,
            hospital: { select: { nombre: true } },
          },
        },
      },
    });

    if (!prepModule) {
      return res.status(404).json({ message: "Módulo de preparación no encontrado para este servicio" });
    }

    // Return parsed JSON lists for safety
    return res.json({
      id: prepModule.id,
      serviceId: prepModule.serviceId,
      serviceName: prepModule.service.nombre,
      hospitalName: prepModule.service.hospital.nombre,
      guide: prepModule.guide,
      objectives: JSON.parse(prepModule.objectives),
      expectations: prepModule.expectations,
      diagnoses: JSON.parse(prepModule.diagnoses),
      safetyGuide: prepModule.safetyGuide,
      resources: JSON.parse(prepModule.resources),
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener módulo de preparación" });
  }
});

// Log access to Prep Module (Student only)
router.post("/modules/:serviceId/access", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  
  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

    const prepModule = await prisma.prepModule.findUnique({ where: { serviceId: String(req.params.serviceId) } });
    if (!prepModule) return res.status(404).json({ message: "Módulo no encontrado" });

    const log = await prisma.prepAccessLog.create({
      data: {
        moduleId: prepModule.id,
        studentId: student.id,
      },
    });

    return res.status(201).json({ ok: true, timestamp: log.accessedAt.toISOString() });
  } catch (err) {
    return res.status(500).json({ message: "Error al registrar acceso" });
  }
});

// Get Student Checklist Items
router.get("/checklist", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

    const checklists = await prisma.prepChecklist.findMany({
      where: { studentId: student.id },
      orderBy: { itemIndex: "asc" },
    });

    return res.json(checklists);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener lista de verificación" });
  }
});

// Toggle/Update checklist item acquired status
router.put("/checklist/:itemIndex", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { isAcquired } = req.body || {};
  const itemIndex = parseInt(String(req.params.itemIndex));

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

    const updated = await prisma.prepChecklist.upsert({
      where: {
        id: `${student.id}-${itemIndex}`, // Custom key simulation for relational SQLite
      },
      update: {
        isAcquired: Boolean(isAcquired),
      },
      create: {
        id: `${student.id}-${itemIndex}`,
        studentId: student.id,
        itemIndex,
        isAcquired: Boolean(isAcquired),
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar lista de verificación" });
  }
});

// Get Self-Assessments for a Rotation
router.get("/assessments/:rotationId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const assessments = await prisma.selfAssessment.findMany({
      where: { rotationId: String(req.params.rotationId) },
      orderBy: { createdAt: "asc" },
    });

    const parsed = assessments.map(a => ({
      id: a.id,
      timepoint: a.timepoint,
      goals: a.goals,
      answers: JSON.parse(a.answers),
      createdAt: a.createdAt.toISOString(),
    }));

    return res.json(parsed);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener autoevaluaciones" });
  }
});

// Submit Self-Assessment (T0 / T1 / Then-Test T0)
router.post("/assessments", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { rotationId, timepoint, answers, goals } = req.body || {};

  if (!rotationId || !timepoint || !answers) {
    return res.status(400).json({ message: "Faltan campos obligatorios" });
  }

  if (!["T0", "T1", "retro_T0"].includes(timepoint)) {
    return res.status(400).json({ message: "Punto de control (timepoint) inválido" });
  }

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

    // Verify rotation enrollment
    const rotation = await prisma.rotation.findFirst({
      where: { id: rotationId, studentId: student.id },
    });

    if (!rotation) {
      return res.status(403).json({ message: "No inscrito en esta rotación" });
    }

    const assessment = await prisma.selfAssessment.create({
      data: {
        rotationId,
        timepoint,
        answers: JSON.stringify(answers),
        goals: goals ? String(goals).trim() : null,
      },
    });

    return res.status(201).json({
      id: assessment.id,
      timepoint: assessment.timepoint,
      goals: assessment.goals,
      createdAt: assessment.createdAt.toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al enviar autoevaluación" });
  }
});

export default router;
