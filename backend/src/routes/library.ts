import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Get Library Resources
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  
  const { role, sub } = req.user;
  const { specialty, type } = req.query;

  try {
    let whereClause: any = {};

    if (specialty) {
      whereClause.specialty = String(specialty);
    }
    if (type) {
      whereClause.type = String(type);
    }

    if (role === "student") {
      // Find active rotations for the student to suggest resources from their active specialties
      const student = await prisma.student.findUnique({ where: { userId: sub } });
      if (student) {
        const activeRotations = await prisma.rotation.findMany({
          where: { studentId: student.id, status: "en_curso" },
          include: { service: true },
        });
        
        if (activeRotations.length > 0 && !specialty) {
          const activeSpecialties = activeRotations.map(r => r.service.nombre);
          // Suggest active rotation specialty resources
          whereClause.specialty = { in: activeSpecialties };
        }
      }
    }

    const resources = await prisma.teachingResource.findMany({
      where: whereClause,
      include: {
        tutor: {
          include: { user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = resources.map(r => ({
      id: r.id,
      title: r.title,
      url: r.url,
      type: r.type,
      tags: JSON.parse(r.tags), // SQLite array parsing
      specialty: r.specialty,
      tutorName: r.tutor.user.name,
      createdAt: r.createdAt.toISOString(),
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener recursos didácticos" });
  }
});

// Upload/Register Resource (Tutor only)
router.post("/", requireAuth, requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  
  const { title, url, type, tags, specialty } = req.body || {};

  if (!title || !url || !type || !specialty) {
    return res.status(400).json({ message: "Faltan campos obligatorios" });
  }

  const urlStr = String(url).trim();
  if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
    return res.status(400).json({ message: "La URL debe comenzar por http:// o https://" });
  }

  try {
    const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
    if (!tutor) return res.status(404).json({ message: "Perfil de tutor no encontrado" });

    const resource = await prisma.teachingResource.create({
      data: {
        tutorId: tutor.id,
        title: title.trim(),
        url: urlStr,
        type: String(type).trim(),
        specialty: String(specialty).trim(),
        tags: tags ? JSON.stringify(tags) : JSON.stringify([]), // SQLite tags representation
      },
    });

    return res.status(201).json({
      id: resource.id,
      title: resource.title,
      url: resource.url,
      type: resource.type,
      specialty: resource.specialty,
      tags: JSON.parse(resource.tags),
      createdAt: resource.createdAt.toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al registrar recurso" });
  }
});

// Delete Resource (Tutor who uploaded it or Coord/Admin only)
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  try {
    const resource = await prisma.teachingResource.findUnique({
      where: { id: String(req.params.id) },
      include: { tutor: true },
    });

    if (!resource) {
      return res.status(404).json({ message: "Recurso no encontrado" });
    }

    const isOwner = resource.tutor.userId === req.user.sub;
    const isCoord = req.user.role === "coordinator" || req.user.role === "admin";

    if (!isOwner && !isCoord) {
      return res.status(403).json({ message: "No tienes permiso para eliminar este recurso" });
    }

    await prisma.teachingResource.delete({
      where: { id: String(req.params.id) },
    });

    return res.json({ ok: true, message: "Recurso didáctico eliminado con éxito" });
  } catch (err) {
    return res.status(500).json({ message: "Error al eliminar recurso" });
  }
});

export default router;
