import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Helper to check if a user is coordinator or admin
function requireCoordinatorOrAdmin(req: AuthenticatedRequest, res: Response, next: express.NextFunction) {
  if (!req.user || (req.user.role !== "coordinator" && req.user.role !== "admin")) {
    return res.status(403).json({ message: "Permisos insuficientes. Requiere Coordinación o Admin." });
  }
  return next();
}

// ── Rotation Endpoints ────────────────────────────────────────────────────────

// Get Rotations
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  
  const { role, sub } = req.user;
  const { studentId, tutorId, hospitalId, serviceId, academicYear, status } = req.query;

  try {
    let whereClause: any = {};

    if (role === "student") {
      // Find the student profile ID
      const student = await prisma.student.findUnique({ where: { userId: sub } });
      if (!student) return res.json([]);
      whereClause.studentId = student.id;
    } else if (role === "tutor") {
      const tutor = await prisma.tutor.findUnique({ where: { userId: sub } });
      if (!tutor) return res.json([]);
      whereClause.tutorId = tutor.id;
    } else {
      // Coordinator or Admin filters
      if (studentId) whereClause.studentId = String(studentId);
      if (tutorId) whereClause.tutorId = String(tutorId);
      if (hospitalId) whereClause.hospitalId = String(hospitalId);
      if (serviceId) whereClause.serviceId = String(serviceId);
      if (academicYear) whereClause.academicYear = String(academicYear);
      if (status) whereClause.status = String(status);
    }

    const rotations = await prisma.rotation.findMany({
      where: whereClause,
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        tutor: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        hospital: { select: { id: true, nombre: true, direccion: true, ciudad: true } },
        service: { select: { id: true, nombre: true, tipo: true } },
      },
      orderBy: { startDate: "asc" },
    });

    const mappedRotations = rotations.map(r => ({
      id: r.id,
      studentId: r.studentId,
      tutorId: r.tutorId,
      hospitalId: r.hospitalId,
      serviceId: r.serviceId,
      startDate: r.startDate,
      endDate: r.endDate,
      academicYear: r.academicYear,
      status: r.status,
      
      // legacy / frontend expected flat attributes
      service: r.service.nombre,
      hospital: r.hospital.nombre,
      start_date: r.startDate.toISOString().slice(0, 10),
      end_date: r.endDate.toISOString().slice(0, 10),
      tutor_name: r.tutor?.user?.name || "Sin tutor",
      tutor_email: r.tutor?.user?.email || "",
      tutor_id: r.tutor?.userId || "",
      
      // Keep full relations as well so modern callers have access
      student: r.student,
      tutor: r.tutor,
      hospitalObj: r.hospital,
      serviceObj: r.service,
    }));

    return res.json(mappedRotations);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener rotaciones" });
  }
});

// Get Rotation by ID
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rotation = await prisma.rotation.findUnique({
      where: { id: String(req.params.id) },
      include: {
        student: {
          include: { user: { select: { name: true, email: true } } },
        },
        tutor: {
          include: { user: { select: { name: true, email: true } } },
        },
        hospital: true,
        service: true,
        practiceSessions: true,
        practiceReport: true,
      },
    });

    if (!rotation) {
      return res.status(404).json({ message: "Rotación no encontrada" });
    }

    // Access control
    if (req.user?.role === "student") {
      const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
      if (!student || rotation.studentId !== student.id) {
        return res.status(403).json({ message: "No tienes permiso para ver esta rotación." });
      }
    } else if (req.user?.role === "tutor") {
      const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
      if (!tutor || rotation.tutorId !== tutor.id) {
        return res.status(403).json({ message: "No tienes permiso para ver esta rotación." });
      }
    }

    return res.json(rotation);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener rotación" });
  }
});

// Create Rotation (Coordinator/Admin only)
router.post("/", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { studentId, tutorId, hospitalId, serviceId, startDate, endDate, academicYear, status } = req.body || {};

  if (!studentId || !tutorId || !hospitalId || !serviceId || !startDate || !endDate || !academicYear) {
    return res.status(400).json({ message: "Faltan campos requeridos para crear la rotación" });
  }

  try {
    // Verify entities exist
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

    const tutor = await prisma.tutor.findUnique({ where: { id: tutorId } });
    if (!tutor) return res.status(404).json({ message: "Tutor no encontrado" });

    const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) return res.status(404).json({ message: "Hospital no encontrado" });

    const service = await prisma.service.findFirst({
      where: { id: serviceId, hospitalId },
    });
    if (!service) return res.status(404).json({ message: "Servicio no encontrado en el hospital especificado" });

    const rotation = await prisma.rotation.create({
      data: {
        studentId,
        tutorId,
        hospitalId,
        serviceId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        academicYear: String(academicYear),
        status: status ? String(status) : "planificada",
      },
    });

    // Automatically create a draft practice report for this rotation
    await prisma.practiceReport.create({
      data: {
        rotationId: rotation.id,
        horasTotales: 0,
        estadoFirma: "borrador",
      },
    });

    return res.status(201).json(rotation);
  } catch (err) {
    return res.status(500).json({ message: "Error al crear rotación" });
  }
});

// Edit Rotation (Coordinator/Admin only)
router.put("/:id", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { tutorId, startDate, endDate, academicYear, status } = req.body || {};

  try {
    const updated = await prisma.rotation.update({
      where: { id: String(req.params.id) },
      data: {
        tutorId: tutorId ? String(tutorId) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        academicYear: academicYear ? String(academicYear) : undefined,
        status: status ? String(status) : undefined,
      },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar rotación" });
  }
});

// Delete Rotation (Coordinator/Admin only)
router.delete("/:id", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.rotation.delete({
      where: { id: String(req.params.id) },
    });
    return res.json({ ok: true, message: "Rotación eliminada con éxito" });
  } catch (err) {
    return res.status(500).json({ message: "Error al eliminar rotación" });
  }
});

// Get students of a rotation
router.get("/:id/students", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rotation = await prisma.rotation.findUnique({
      where: { id: String(req.params.id) },
      include: {
        student: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });
    if (!rotation) return res.status(404).json({ message: "Rotación no encontrada" });
    if (!rotation.student?.user) {
      return res.json([]);
    }
    return res.json([{
      id: rotation.student.user.id,
      name: rotation.student.user.name,
      email: rotation.student.user.email
    }]);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener alumnos de la rotación" });
  }
});

// Enroll a student in a rotation group (Tutor only)
router.post("/:id/enroll", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { studentEmail } = req.body || {};
  if (!studentEmail) return res.status(400).json({ message: "Falta el correo del alumno" });
  
  try {
    const rotation = await prisma.rotation.findUnique({
      where: { id: String(req.params.id) },
      include: { student: { include: { user: true } } }
    });
    if (!rotation) return res.status(404).json({ message: "Rotación no encontrada" });

    const user = await prisma.user.findUnique({
      where: { email: String(studentEmail).toLowerCase().trim() },
      include: { studentProfile: true }
    });
    if (!user || !user.studentProfile) {
      return res.status(404).json({ message: "Alumno no encontrado" });
    }

    if (rotation.studentId === user.studentProfile.id) {
      return res.status(409).json({ message: "El alumno ya está en esta rotación" });
    }

    // Check if duplicate rotation exists
    const existing = await prisma.rotation.findFirst({
      where: {
        studentId: user.studentProfile.id,
        tutorId: rotation.tutorId,
        hospitalId: rotation.hospitalId,
        serviceId: rotation.serviceId,
        startDate: rotation.startDate,
        endDate: rotation.endDate,
      }
    });
    if (existing) {
      return res.status(409).json({ message: "El alumno ya está en esta rotación" });
    }

    const newRot = await prisma.rotation.create({
      data: {
        studentId: user.studentProfile.id,
        tutorId: rotation.tutorId,
        hospitalId: rotation.hospitalId,
        serviceId: rotation.serviceId,
        startDate: rotation.startDate,
        endDate: rotation.endDate,
        academicYear: rotation.academicYear,
        status: rotation.status,
      }
    });

    await prisma.practiceReport.create({
      data: {
        rotationId: newRot.id,
        horasTotales: 0,
        estadoFirma: "borrador",
      },
    });

    return res.status(201).json({
      ok: true,
      student: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al inscribir alumno" });
  }
});

// Remove a student from a rotation group (Tutor only)
router.delete("/:id/enroll/:studentId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rotation = await prisma.rotation.findUnique({
      where: { id: String(req.params.id) },
      include: { student: { include: { user: true } } }
    });
    if (!rotation) return res.status(404).json({ message: "Rotación no encontrada" });

    if (rotation.student?.user?.id === String(req.params.studentId)) {
      await prisma.rotation.delete({ where: { id: String(req.params.id) } });
      return res.json({ ok: true });
    }

    const targetStudent = await prisma.student.findFirst({
      where: { userId: String(req.params.studentId) }
    });
    if (targetStudent) {
      await prisma.rotation.deleteMany({
        where: {
          studentId: targetStudent.id,
          tutorId: rotation.tutorId,
          hospitalId: rotation.hospitalId,
          serviceId: rotation.serviceId,
          startDate: rotation.startDate,
          endDate: rotation.endDate,
        }
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al quitar alumno" });
  }
});

export default router;
