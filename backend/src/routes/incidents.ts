import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Get Incidents list
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  
  const { role, sub } = req.user;
  const { status, tipo, hospitalId } = req.query;

  try {
    let whereClause: any = {};

    if (role === "student" || role === "tutor") {
      // Students and Tutors only see incidents they reported
      whereClause.reporterId = sub;
    } else {
      // Coordinator/Admin filters
      if (status) whereClause.estado = String(status);
      if (tipo) whereClause.tipo = String(tipo);
      if (hospitalId) whereClause.rotation = { hospitalId: String(hospitalId) };
    }

    const incidents = await prisma.incident.findMany({
      where: whereClause,
      include: {
        reporter: { select: { name: true, email: true, role: true } },
        resolver: { select: { name: true } },
        rotation: {
          include: {
            service: { select: { nombre: true } },
            hospital: { select: { nombre: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(incidents);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener incidencias" });
  }
});

// Report Incident
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { rotationId, tipo, descripcion } = req.body || {};

  if (!rotationId || !tipo || !descripcion) {
    return res.status(400).json({ message: "Faltan campos obligatorios para reportar incidencia" });
  }

  if (!["docente", "organizativa", "logistica", "seguridad_paciente", "otro"].includes(tipo)) {
    return res.status(400).json({ message: "Tipo de incidencia inválido" });
  }

  try {
    // Check if rotation exists and belongs to the user
    const rotation = await prisma.rotation.findUnique({
      where: { id: rotationId },
      include: { student: true, tutor: true },
    });

    if (!rotation) {
      return res.status(404).json({ message: "Rotación no encontrada" });
    }

    const isStudent = req.user.role === "student" && rotation.student?.userId === req.user.sub;
    const isTutor = req.user.role === "tutor" && rotation.tutor?.userId === req.user.sub;
    const isCoord = req.user.role === "coordinator" || req.user.role === "admin";

    if (!isStudent && !isTutor && !isCoord) {
      return res.status(403).json({ message: "No tienes permiso para reportar incidencias en esta rotación" });
    }

    const incident = await prisma.incident.create({
      data: {
        reporterId: req.user.sub,
        rotationId,
        tipo,
        descripcion: descripcion.trim(),
        estado: "abierta",
      },
    });

    // Create Audit Log entry
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: "Incidencia Reportada",
        details: `Usuario reportó incidencia tipo ${tipo} en rotación ${rotationId}. ID: ${incident.id}`,
      },
    });

    return res.status(201).json(incident);
  } catch (err) {
    return res.status(500).json({ message: "Error al reportar incidencia" });
  }
});

// Update Incident Status (Coordinator/Admin only)
router.put("/:id/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== "coordinator" && req.user?.role !== "admin") {
    return res.status(403).json({ message: "Permisos insuficientes" });
  }

  const { estado, resolverNotes } = req.body || {};
  if (!estado) return res.status(400).json({ message: "Falta el nuevo estado" });

  if (!["abierta", "en_revision", "resuelta", "cerrada"].includes(estado)) {
    return res.status(400).json({ message: "Estado de incidencia inválido" });
  }

  try {
    const updated = await prisma.incident.update({
      where: { id: String(req.params.id) },
      data: {
        estado,
        resolverId: req.user.sub,
        resolverNotes: resolverNotes ? String(resolverNotes).trim() : null,
      },
    });

    // Create Audit Log entry
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: "Estado de Incidencia Actualizado",
        details: `Incidencia ${String(req.params.id)} cambiada a estado ${estado} por coordinador`,
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar estado de incidencia" });
  }
});

export default router;
