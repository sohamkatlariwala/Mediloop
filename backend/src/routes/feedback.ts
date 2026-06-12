import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Get feedback for a rotation (Double-blind logic)
router.get("/rotation/:rotationId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  try {
    const rotation = await prisma.rotation.findUnique({
      where: { id: String(req.params.rotationId) },
      include: {
        student: { include: { user: { select: { id: true, name: true } } } },
        tutor: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    if (!rotation) {
      return res.status(404).json({ message: "Rotación no encontrada" });
    }

    const feedbacks = await prisma.postRotationFeedback.findMany({
      where: { rotationId: String(req.params.rotationId) },
    });

    const studentFeedback = feedbacks.find(f => f.type === "student");
    const tutorFeedback = feedbacks.find(f => f.type === "tutor");

    const bothSubmitted = studentFeedback && tutorFeedback;

    // Access control & Double-blind filtering
    const isStudent = req.user.role === "student" && rotation.student?.userId === req.user.sub;
    const isTutor = req.user.role === "tutor" && rotation.tutor?.userId === req.user.sub;
    const isCoord = req.user.role === "coordinator" || req.user.role === "admin";

    if (!isStudent && !isTutor && !isCoord) {
      return res.status(403).json({ message: "No tienes permisos para ver el feedback de esta rotación" });
    }

    // Double-blind rules:
    // If BOTH have submitted, show both.
    // If only one submitted, the student can only see their own, and the tutor can only see their own.
    // If coordinator, they see whatever is submitted.
    const result: any = {
      studentSubmitted: !!studentFeedback,
      tutorSubmitted: !!tutorFeedback,
      bothSubmitted,
    };

    if (isCoord) {
      result.studentFeedback = studentFeedback ? JSON.parse(studentFeedback.answers) : null;
      result.tutorFeedback = tutorFeedback ? JSON.parse(tutorFeedback.answers) : null;
    } else if (isStudent) {
      result.studentFeedback = studentFeedback ? JSON.parse(studentFeedback.answers) : null;
      // Hide tutor feedback until student submits AND tutor submits
      result.tutorFeedback = bothSubmitted ? JSON.parse(tutorFeedback.answers) : null;
    } else if (isTutor) {
      result.tutorFeedback = tutorFeedback ? JSON.parse(tutorFeedback.answers) : null;
      // Hide student feedback until tutor submits AND student submits
      result.studentFeedback = bothSubmitted ? JSON.parse(studentFeedback.answers) : null;
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener feedback de la rotación" });
  }
});

// Submit Feedback (Student or Tutor)
router.post("/submit", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { rotationId, answers } = req.body || {};

  if (!rotationId || !answers) {
    return res.status(400).json({ message: "Faltan campos obligatorios" });
  }

  try {
    const rotation = await prisma.rotation.findUnique({
      where: { id: rotationId },
      include: { student: true, tutor: true },
    });

    if (!rotation) {
      return res.status(404).json({ message: "Rotación no encontrada" });
    }

    let type = "";
    if (req.user.role === "student" && rotation.student?.userId === req.user.sub) {
      type = "student";
    } else if (req.user.role === "tutor" && rotation.tutor?.userId === req.user.sub) {
      type = "tutor";
    } else {
      return res.status(403).json({ message: "No puedes enviar feedback para esta rotación" });
    }

    // Check if feedback already submitted
    const existing = await prisma.postRotationFeedback.findFirst({
      where: { rotationId, type },
    });

    if (existing) {
      return res.status(409).json({ message: "Ya has enviado tu feedback para esta rotación" });
    }

    const feedback = await prisma.postRotationFeedback.create({
      data: {
        rotationId,
        type,
        answers: JSON.stringify(answers),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: `Feedback post-rotación enviado (${type})`,
        details: `Usuario envió feedback para la rotación ${rotationId}`,
      },
    });

    return res.status(201).json({ ok: true, id: feedback.id });
  } catch (err) {
    return res.status(500).json({ message: "Error al enviar feedback" });
  }
});

export default router;
