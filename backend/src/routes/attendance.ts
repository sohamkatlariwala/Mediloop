import express, { Response } from "express";
import crypto from "crypto";
import prisma from "../prisma";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Helper to create rotating QR token for 12h window
// periodOffset allows checking preceding period to prevent edge-case failures
function makeQrToken(rotationId: string, tutorId: string, periodOffset: number = 0): string {
  const period = Math.floor(Date.now() / 43200000) + periodOffset;
  return crypto
    .createHash("sha256")
    .update(`${rotationId}:${tutorId}:${period}`)
    .digest("hex")
    .slice(0, 32);
}

// ── Tutor-Facing Endpoints ──────────────────────────────────────────────────

// Get pending attendances for tutor's student sessions
router.get("/pending", requireAuth, requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
    if (!tutor) return res.status(404).json({ message: "Perfil de tutor no encontrado" });

    // Fetch practice sessions in rotation for this tutor that are in marked_estudiante status
    const pendingSessions = await prisma.practiceSession.findMany({
      where: {
        rotation: { tutorId: tutor.id },
        estadoAsistencia: "pendiente", // marked as scanned by student but not yet validated
      },
      include: {
        rotation: {
          include: {
            student: {
              include: { user: { select: { name: true } } },
            },
            service: { select: { nombre: true } },
            hospital: { select: { nombre: true } },
          },
        },
      },
      orderBy: { fecha: "asc" },
    });

    const result = pendingSessions.map(s => ({
      id: s.id,
      name: s.rotation.student?.user?.name || "Sin estudiante",
      area: `${s.rotation.service?.nombre || "Sin servicio"} · ${s.rotation.hospital?.nombre || "Sin hospital"}`,
      scannedAt: s.fecha.toISOString(),
      turno: s.turno,
      rotationId: s.rotationId,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener asistencias pendientes" });
  }
});

// Get confirmed/validated attendances for tutor
router.get("/confirmed", requireAuth, requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
    if (!tutor) return res.status(404).json({ message: "Tutor no encontrado" });

    const confirmedSessions = await prisma.practiceSession.findMany({
      where: {
        rotation: { tutorId: tutor.id },
        estadoAsistencia: "validada_tutor",
      },
      include: {
        rotation: {
          include: {
            student: {
              include: { user: { select: { name: true } } },
            },
            service: { select: { nombre: true } },
            hospital: { select: { nombre: true } },
          },
        },
      },
      orderBy: { validatedAt: "desc" },
      take: 50,
    });

    const result = confirmedSessions.map(s => ({
      id: s.id,
      name: s.rotation.student?.user?.name || "Sin estudiante",
      area: `${s.rotation.service?.nombre || "Sin servicio"} · ${s.rotation.hospital?.nombre || "Sin hospital"}`,
      time: s.validatedAt ? s.validatedAt.toISOString() : s.fecha.toISOString(),
      turno: s.turno,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener asistencias confirmadas" });
  }
});

// Confirm/Validate a student check-in
router.post("/:id/confirm", requireAuth, requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const session = await prisma.practiceSession.findUnique({
      where: { id: String(req.params.id) },
      include: {
        rotation: {
          include: {
            student: { include: { user: { select: { name: true, id: true } } } },
          },
        },
      },
    });

    if (!session) return res.status(404).json({ message: "Sesión de prácticas no encontrada" });

    await prisma.practiceSession.update({
      where: { id: String(req.params.id) },
      data: {
        estadoAsistencia: "validada_tutor",
        validatedAt: new Date(),
      },
    });

    // Update cumulative hours on the practice report draft
    const report = await prisma.practiceReport.findUnique({ where: { rotationId: session.rotationId } });
    if (report) {
      await prisma.practiceReport.update({
        where: { rotationId: session.rotationId },
        data: { horasTotales: report.horasTotales + 6 }, // assume 6 hours per clinical session shift
      });
    }

    // Audit Log entry
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: "Asistencia confirmada",
        details: `Tutor confirmó asistencia de ${session.rotation.student?.user?.name || "Sin estudiante"} en rotación ${session.rotationId}`,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al confirmar asistencia" });
  }
});

// Reject a student check-in
router.post("/:id/reject", requireAuth, requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const session = await prisma.practiceSession.findUnique({
      where: { id: String(req.params.id) },
      include: {
        rotation: {
          include: {
            student: { include: { user: { select: { name: true } } } },
          },
        },
      },
    });

    if (!session) return res.status(404).json({ message: "Sesión no encontrada" });

    await prisma.practiceSession.update({
      where: { id: String(req.params.id) },
      data: {
        estadoAsistencia: "incidencia", // marked as warning/fraud risk
        observaciones: "Rechazada por tutor.",
      },
    });

    // Audit Log entry
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: "Asistencia rechazada",
        details: `Tutor rechazó asistencia de ${session.rotation.student?.user?.name || "Sin estudiante"} en rotación ${session.rotationId}`,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al rechazar asistencia" });
  }
});

// ── Student-Facing Endpoints ────────────────────────────────────────────────

// Get student's own attendance history
router.get("/my", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Perfil de estudiante no encontrado" });

    const sessions = await prisma.practiceSession.findMany({
      where: { rotation: { studentId: student.id } },
      include: {
        rotation: {
          include: {
            service: { select: { nombre: true } },
            hospital: { select: { nombre: true } },
          },
        },
      },
      orderBy: { fecha: "desc" },
    });

    const pending = sessions
      .filter(s => s.estadoAsistencia === "pendiente")
      .map(s => ({
        id: s.id,
        area: `${s.rotation.service.nombre} · ${s.rotation.hospital.nombre}`,
        scannedAt: s.fecha.toISOString(),
      }));

    const confirmed = sessions
      .filter(s => s.estadoAsistencia === "validada_tutor")
      .map(s => ({
        id: s.id,
        area: `${s.rotation.service.nombre} · ${s.rotation.hospital.nombre}`,
        time: s.validatedAt ? s.validatedAt.toISOString() : s.fecha.toISOString(),
      }));

    return res.json({ pending, confirmed });
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener tu historial de asistencia" });
  }
});

// Register check-in by scanning rotating QR token
router.post("/qr-checkin", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { token, shift } = req.body || {};
  if (!token) return res.status(400).json({ message: "Falta el token QR" });

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

    // Find active rotation for this student
    const rotations = await prisma.rotation.findMany({
      where: {
        studentId: student.id,
        status: "en_curso",
      },
      include: { service: true, hospital: true },
    });

    let activeRotation = null;
    
    // Validate rotating token against student's active rotations
    for (const rot of rotations) {
      const matchCurrent = token === makeQrToken(rot.id, rot.tutorId, 0);
      const matchPrevious = token === makeQrToken(rot.id, rot.tutorId, -1);
      
      if (matchCurrent || matchPrevious) {
        activeRotation = rot;
        break;
      }
    }

    if (!activeRotation) {
      return res.status(401).json({ message: "Código QR inválido, expirado o de otro tutor" });
    }

    // Check if session for today & shift already exists
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingSession = await prisma.practiceSession.findFirst({
      where: {
        rotationId: activeRotation.id,
        fecha: {
          gte: today,
          lt: tomorrow,
        },
        turno: shift || "manana",
      },
    });

    if (existingSession) {
      return res.status(409).json({ message: "Ya has registrado asistencia para este turno hoy" });
    }

    const session = await prisma.practiceSession.create({
      data: {
        rotationId: activeRotation.id,
        fecha: new Date(),
        turno: shift || "manana",
        qrToken: token,
        estadoAsistencia: "pendiente",
        observaciones: `Marcada por QR. Área: ${activeRotation.service.nombre}`,
      },
    });

    return res.status(201).json({
      ok: true,
      id: session.id,
      area: `${activeRotation.service.nombre} · ${activeRotation.hospital.nombre}`,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al realizar check-in" });
  }
});

// Simulator check-in for demo convenience
router.post("/simulate", requireAuth, requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { rotationId, shift } = req.body || {};
  if (!rotationId) return res.status(400).json({ message: "Falta rotationId" });

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

    const rotation = await prisma.rotation.findFirst({
      where: { id: rotationId, studentId: student.id },
      include: { service: true, hospital: true },
    });

    if (!rotation) {
      return res.status(403).json({ message: "No inscrito en esta rotación o rotación no encontrada" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingSession = await prisma.practiceSession.findFirst({
      where: {
        rotationId: rotation.id,
        fecha: {
          gte: today,
          lt: tomorrow,
        },
        turno: shift || "manana",
      },
    });

    if (existingSession) {
      return res.status(409).json({ message: "Ya has registrado asistencia para esta rotación hoy" });
    }

    const session = await prisma.practiceSession.create({
      data: {
        rotationId: rotation.id,
        fecha: new Date(),
        turno: shift || "manana",
        estadoAsistencia: "pendiente",
        observaciones: `Simulada en panel. Área: ${rotation.service.nombre}`,
      },
    });

    return res.status(201).json({
      ok: true,
      id: session.id,
      area: `${rotation.service.nombre} · ${rotation.hospital.nombre}`,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error en simulación de check-in" });
  }
});

// Confirm all pending check-ins for tutor
router.post("/confirm-all", requireAuth, requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
    if (!tutor) return res.status(404).json({ message: "Tutor no encontrado" });

    const pending = await prisma.practiceSession.findMany({
      where: {
        rotation: { tutorId: tutor.id },
        estadoAsistencia: "pendiente",
      },
    });

    for (const session of pending) {
      await prisma.practiceSession.update({
        where: { id: session.id },
        data: {
          estadoAsistencia: "validada_tutor",
          validatedAt: new Date(),
        },
      });

      // Update report hours
      const report = await prisma.practiceReport.findUnique({ where: { rotationId: session.rotationId } });
      if (report) {
        await prisma.practiceReport.update({
          where: { rotationId: session.rotationId },
          data: { horasTotales: report.horasTotales + 6 },
        });
      }
    }

    return res.json({ ok: true, confirmed: pending.length });
  } catch (err) {
    return res.status(500).json({ message: "Error al confirmar todas las asistencias" });
  }
});

export default router;
