import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, requireAdmin, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Helper to check if a user is coordinator or admin
function requireCoordinatorOrAdmin(req: AuthenticatedRequest, res: Response, next: express.NextFunction) {
  if (!req.user || (req.user.role !== "coordinator" && req.user.role !== "admin")) {
    return res.status(403).json({ message: "Permisos insuficientes. Requiere Coordinación o Admin." });
  }
  return next();
}

// ── Hospital CRUD Endpoints ──────────────────────────────────────────────────

// List Hospitals
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const includeArchived = req.query.includeArchived === "true";
  try {
    const hospitals = await prisma.hospital.findMany({
      where: includeArchived ? {} : { isArchived: false },
      include: {
        services: true,
        _count: {
          select: { tutors: true, rotations: true },
        },
      },
      orderBy: { nombre: "asc" },
    });
    return res.json(hospitals);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener hospitales" });
  }
});

// Get Hospital by ID
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const hospital = await prisma.hospital.findUnique({
      where: { id: String(req.params.id) },
      include: {
        services: true,
        tutors: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
    });
    if (!hospital) {
      return res.status(404).json({ message: "Hospital no encontrado" });
    }
    return res.json(hospital);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener hospital" });
  }
});

// Create Hospital (Coordinator/Admin only)
router.post("/", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { nombre, tipo, direccion, ciudad, lat, lng, website, contact, logoUrl } = req.body || {};
  if (!nombre || !tipo) {
    return res.status(400).json({ message: "Nombre y tipo son obligatorios" });
  }

  try {
    const existing = await prisma.hospital.findUnique({ where: { nombre } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe un hospital con ese nombre" });
    }

    const hospital = await prisma.hospital.create({
      data: {
        nombre: nombre.trim(),
        tipo: tipo.trim(),
        direccion: direccion ? String(direccion).trim() : null,
        ciudad: ciudad ? String(ciudad).trim() : null,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        website: website ? String(website).trim() : null,
        contact: contact ? String(contact).trim() : null,
        logoUrl: logoUrl ? String(logoUrl).trim() : null,
      },
    });

    return res.status(201).json(hospital);
  } catch (err) {
    return res.status(500).json({ message: "Error al crear hospital" });
  }
});

// Edit Hospital (Coordinator/Admin only)
router.put("/:id", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { nombre, tipo, direccion, ciudad, lat, lng, website, contact, logoUrl, isArchived } = req.body || {};

  try {
    const updated = await prisma.hospital.update({
      where: { id: String(req.params.id) },
      data: {
        nombre: nombre ? String(nombre).trim() : undefined,
        tipo: tipo ? String(tipo).trim() : undefined,
        direccion: direccion !== undefined ? (direccion ? String(direccion).trim() : null) : undefined,
        ciudad: ciudad !== undefined ? (ciudad ? String(ciudad).trim() : null) : undefined,
        lat: lat !== undefined ? (lat ? parseFloat(lat) : null) : undefined,
        lng: lng !== undefined ? (lng ? parseFloat(lng) : null) : undefined,
        website: website !== undefined ? (website ? String(website).trim() : null) : undefined,
        contact: contact !== undefined ? (contact ? String(contact).trim() : null) : undefined,
        logoUrl: logoUrl !== undefined ? (logoUrl ? String(logoUrl).trim() : null) : undefined,
        isArchived: isArchived !== undefined ? Boolean(isArchived) : undefined,
      },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar hospital" });
  }
});

// Archive Hospital (instead of hard delete)
router.delete("/:id", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const archived = await prisma.hospital.update({
      where: { id: String(req.params.id) },
      data: { isArchived: true },
    });
    return res.json({ message: "Hospital archivado con éxito", hospital: archived });
  } catch (err) {
    return res.status(500).json({ message: "Error al archivar hospital" });
  }
});

// ── Hospital Service Management ──────────────────────────────────────────────

// Add service to Hospital
router.post("/:id/services", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { nombre, tipo } = req.body || {};
  if (!nombre) {
    return res.status(400).json({ message: "El nombre del servicio es obligatorio" });
  }

  try {
    const hospital = await prisma.hospital.findUnique({ where: { id: String(req.params.id) } });
    if (!hospital) {
      return res.status(404).json({ message: "Hospital no encontrado" });
    }

    const service = await prisma.service.create({
      data: {
        hospitalId: String(req.params.id),
        nombre: nombre.trim(),
        tipo: tipo ? String(tipo).trim() : null,
      },
    });
    return res.status(201).json(service);
  } catch (err) {
    return res.status(500).json({ message: "Error al añadir servicio" });
  }
});

// Remove service from Hospital
router.delete("/:id/services/:serviceId", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.service.delete({
      where: { id: String(req.params.serviceId) },
    });
    return res.json({ ok: true, message: "Servicio eliminado con éxito" });
  } catch (err) {
    return res.status(500).json({ message: "Error al eliminar servicio" });
  }
});

// Assign Tutor to Hospital
router.post("/:id/tutors", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { tutorId } = req.body || {};
  if (!tutorId) {
    return res.status(400).json({ message: "ID del tutor es obligatorio" });
  }

  try {
    const updated = await prisma.tutor.update({
      where: { id: tutorId },
      data: { hospitalId: String(req.params.id) },
      include: {
        user: { select: { name: true, email: true } },
      },
    });
    return res.json({ message: "Tutor asignado con éxito", tutor: updated });
  } catch (err) {
    return res.status(500).json({ message: "Error al asignar tutor" });
  }
});

export default router;
