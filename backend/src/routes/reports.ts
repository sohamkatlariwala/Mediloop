import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Get Report by Rotation ID
router.get("/:rotationId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await prisma.practiceReport.findUnique({
      where: { rotationId: String(req.params.rotationId) },
      include: {
        rotation: {
          include: {
            student: { include: { user: { select: { name: true, email: true } } } },
            tutor: { include: { user: { select: { name: true, email: true } } } },
            hospital: { select: { nombre: true } },
            service: { select: { nombre: true } },
          },
        },
      },
    });

    if (!report) {
      return res.status(404).json({ message: "Acta de prácticas no encontrada" });
    }

    return res.json(report);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener acta" });
  }
});

// Update Report details (hours, summary) - Student only
router.put("/:rotationId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { summary } = req.body || {};

  try {
    const report = await prisma.practiceReport.findUnique({
      where: { rotationId: String(req.params.rotationId) },
      include: { rotation: true },
    });

    if (!report) return res.status(404).json({ message: "Acta no encontrada" });

    // Only student in that rotation can update summary
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student || report.rotation.studentId !== student.id) {
      return res.status(403).json({ message: "No tienes permiso para editar esta acta" });
    }

    if (report.estadoFirma !== "borrador") {
      return res.status(400).json({ message: "No se puede editar una acta ya firmada" });
    }

    const updated = await prisma.practiceReport.update({
      where: { rotationId: String(req.params.rotationId) },
      data: {
        resumen: summary ? String(summary).trim() : null,
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar acta" });
  }
});

// Sign as Student
router.post("/:rotationId/sign-student", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  try {
    const report = await prisma.practiceReport.findUnique({
      where: { rotationId: String(req.params.rotationId) },
      include: { rotation: true },
    });

    if (!report) return res.status(404).json({ message: "Acta no encontrada" });

    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student || report.rotation.studentId !== student.id) {
      return res.status(403).json({ message: "Solo el alumno de la rotación puede firmar" });
    }

    if (report.estadoFirma !== "borrador") {
      return res.status(400).json({ message: "El acta no está en estado borrador" });
    }

    const updated = await prisma.practiceReport.update({
      where: { rotationId: String(req.params.rotationId) },
      data: {
        estadoFirma: "firmada_estudiante",
        firmaEstudianteAt: new Date(),
      },
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: "Firma Estudiante",
        details: `Alumno firmó digitalmente el acta de prácticas de la rotación ${req.params.rotationId}`,
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Error al firmar acta" });
  }
});

// Sign as Tutor
router.post("/:rotationId/sign-tutor", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  try {
    const report = await prisma.practiceReport.findUnique({
      where: { rotationId: String(req.params.rotationId) },
      include: { rotation: true },
    });

    if (!report) return res.status(404).json({ message: "Acta no encontrada" });

    const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
    if (!tutor || report.rotation.tutorId !== tutor.id) {
      return res.status(403).json({ message: "Solo el tutor asignado puede firmar esta acta" });
    }

    if (report.estadoFirma !== "firmada_estudiante") {
      return res.status(400).json({ message: "El acta debe estar firmada previamente por el alumno" });
    }

    const updated = await prisma.practiceReport.update({
      where: { rotationId: String(req.params.rotationId) },
      data: {
        estadoFirma: "completada",
        firmaTutorAt: new Date(),
      },
    });

    // Lock the rotation as completed
    await prisma.rotation.update({
      where: { id: report.rotationId },
      data: { status: "finalizada" },
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: "Firma Tutor / Acta Completada",
        details: `Tutor firmó digitalmente el acta de la rotación ${req.params.rotationId}. Estado cambiado a Finalizada.`,
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Error al firmar acta como tutor" });
  }
});

export default router;
