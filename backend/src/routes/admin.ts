import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, requireAdmin, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Enforce admin check for all admin routes
router.use(requireAuth);
router.use(requireAdmin);

// List all non-admin users
router.get("/users", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: "admin" } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener usuarios" });
  }
});

// Delete user
router.delete("/users/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    if (user.role === "admin") return res.status(403).json({ message: "No se puede eliminar administradores" });

    // Cascade deletions via transactions
    await prisma.$transaction(async (tx) => {
      // Clean up child relations manually if not handled by FK cascade
      await tx.prepAccessLog.deleteMany({ where: { studentId: String(req.params.id) } });
      await tx.prepChecklist.deleteMany({ where: { studentId: String(req.params.id) } });
      await tx.practiceReport.deleteMany({ where: { rotation: { studentId: String(req.params.id) } } });
      await tx.practiceSession.deleteMany({ where: { rotation: { studentId: String(req.params.id) } } });
      await tx.rotation.deleteMany({ where: { studentId: String(req.params.id) } });
      await tx.student.deleteMany({ where: { userId: String(req.params.id) } });
      
      await tx.tutor.deleteMany({ where: { userId: String(req.params.id) } });
      
      await tx.user.delete({ where: { id: String(req.params.id) } });
    });

    return res.json({ ok: true, message: "Usuario eliminado con éxito" });
  } catch (err) {
    return res.status(500).json({ message: "Error al eliminar usuario" });
  }
});

// Get global counts and stats for admin dashboard
router.get("/stats", async (req: AuthenticatedRequest, res: Response) => {
  const today = new Date();
  
  try {
    const usersCount = await prisma.user.count({ where: { role: { not: "admin" } } });
    const studentsCount = await prisma.student.count();
    const tutorsCount = await prisma.tutor.count();
    const rotationsCount = await prisma.rotation.count();
    const evalsCount = await prisma.evaluation.count();
    const confirmedCount = await prisma.practiceSession.count({ where: { estadoAsistencia: "validada_tutor" } });
    const pendingCount = await prisma.practiceSession.count({ where: { estadoAsistencia: "pendiente" } });
    
    const activeRots = await prisma.rotation.count({
      where: {
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });

    const hospitalsCount = await prisma.hospital.count({ where: { isArchived: false } });

    return res.json({
      users: usersCount,
      students: studentsCount,
      tutors: tutorsCount,
      rotations: rotationsCount,
      evals: evalsCount,
      attendance: confirmedCount,
      pending: pendingCount,
      activeRots,
      hospitals: hospitalsCount,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al recopilar estadísticas globales" });
  }
});

// Get activity/audit log
router.get("/activity", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    return res.json(logs);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener logs de auditoría" });
  }
});

// Get system alerts
router.get("/alerts", async (req: AuthenticatedRequest, res: Response) => {
  const alerts: any[] = [];
  const today = new Date();
  const threshold24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // 1. Active rotations without assigned tutor
    const noTutor = await prisma.rotation.findMany({
      where: {
        tutorId: "", // empty tutor representation or null
        startDate: { lte: today },
        endDate: { gte: today },
      },
      include: { hospital: true, service: true },
    });

    noTutor.forEach(r => {
      alerts.push({
        id: `no-tutor-${r.id}`,
        severity: "critical",
        icon: "🔴",
        title: "Rotación activa sin tutor",
        message: `La rotación "${r.service.nombre}" en ${r.hospital.nombre} no tiene tutor asignado.`,
        tab: "rotaciones",
      });
    });

    // 2. Pending attendance check-ins older than 24 hours
    const oldPending = await prisma.practiceSession.findMany({
      where: {
        estadoAsistencia: "pendiente",
        fecha: { lt: threshold24h },
      },
      include: {
        rotation: {
          include: {
            student: { include: { user: { select: { name: true } } } },
            service: true,
          },
        },
      },
    });

    oldPending.forEach(ap => {
      const diffHrs = Math.floor((Date.now() - ap.fecha.getTime()) / 3600000);
      alerts.push({
        id: `pending-old-${ap.id}`,
        severity: "warning",
        icon: "⏳",
        title: `Asistencia sin confirmar +${diffHrs}h`,
        message: `${ap.rotation.student?.user?.name || "Estudiante"} lleva ${diffHrs}h esperando confirmación en ${ap.rotation.service.nombre}.`,
        tab: "actividad",
      });
    });

    // 3. Low performance warnings (Evaluation average < 3)
    const lowGrade = await prisma.evaluation.findMany({
      where: {
        evaluadoTipo: "student",
        totalScore: { lt: 3.0 },
      },
      include: {
        rotation: {
          include: {
            student: { include: { user: { select: { name: true } } } },
          },
        },
      },
    });

    lowGrade.forEach(e => {
      alerts.push({
        id: `low-grade-${e.id}`,
        severity: "critical",
        icon: "📉",
        title: "Rendimiento bajo detectado",
        message: `${e.rotation.student?.user?.name || "Estudiante"} tiene una puntuación media de ${e.totalScore?.toFixed(1)}/5 en su evaluación.`,
        tab: "usuarios",
      });
    });

    // 4. Students in active rotations with absolutely no registered attendance session
    const activeRotations = await prisma.rotation.findMany({
      where: {
        startDate: { lte: today },
        endDate: { gte: today },
      },
      include: {
        student: { include: { user: { select: { name: true } } } },
        practiceSessions: true,
        service: true,
      },
    });

    activeRotations.forEach(r => {
      if (r.practiceSessions.length === 0 && r.student) {
        alerts.push({
          id: `no-att-${r.student.id}-${r.id}`,
          severity: "warning",
          icon: "📍",
          title: "Sin asistencia registrada",
          message: `${r.student.user?.name || "Estudiante"} no ha registrado ninguna sesión de prácticas en "${r.service.nombre}".`,
          tab: "usuarios",
        });
      }
    });

    return res.json(alerts);
  } catch (err) {
    return res.status(500).json({ message: "Error al recopilar alertas del sistema" });
  }
});

// ── Admin Courses Endpoints ──────────────────────────────────────────────────

// List all courses
router.get("/courses", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        _count: {
          select: { subjects: true }
        }
      },
      orderBy: { year: "asc" }
    });
    return res.json(courses.map(c => ({
      id: c.id,
      name: c.name,
      year: c.year,
      createdAt: c.createdAt,
      subject_count: c._count.subjects
    })));
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener cursos" });
  }
});

// Create course
router.post("/courses", async (req: AuthenticatedRequest, res: Response) => {
  const { name, year } = req.body || {};
  if (!name || !year) return res.status(400).json({ message: "Faltan campos: name, year" });
  const y = parseInt(year);
  if (isNaN(y) || y < 2 || y > 6) return res.status(400).json({ message: "El año debe ser entre 2 y 6" });
  
  try {
    const existing = await prisma.course.findFirst({ where: { year: y } });
    if (existing) return res.status(409).json({ message: "Ya existe un curso para ese año" });
    const course = await prisma.course.create({
      data: {
        name: String(name).trim(),
        year: y
      }
    });
    return res.status(201).json({ ok: true, id: course.id });
  } catch (err) {
    return res.status(500).json({ message: "Error al crear curso" });
  }
});

// Delete course
router.delete("/courses/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: String(req.params.id) } });
    if (!course) return res.status(404).json({ message: "Curso no encontrado" });
    await prisma.course.delete({ where: { id: String(req.params.id) } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al eliminar curso" });
  }
});

// ── Admin Subjects Endpoints ─────────────────────────────────────────────────

// List subjects
router.get("/subjects", async (req: AuthenticatedRequest, res: Response) => {
  const courseId = req.query.courseId;
  try {
    let subjects;
    if (courseId) {
      subjects = await prisma.subject.findMany({
        where: { courseId: String(courseId) },
        include: { course: true },
        orderBy: { name: "asc" }
      });
    } else {
      subjects = await prisma.subject.findMany({
        include: { course: true },
        orderBy: [{ course: { year: "asc" } }, { name: "asc" }]
      });
    }
    return res.json(subjects.map(s => ({
      id: s.id,
      name: s.name,
      course_id: s.courseId,
      course_name: s.course.name,
      course_year: s.course.year,
      createdAt: s.createdAt
    })));
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener asignaturas" });
  }
});

// Create subject
router.post("/subjects", async (req: AuthenticatedRequest, res: Response) => {
  const { name, courseId } = req.body || {};
  if (!name || !courseId) return res.status(400).json({ message: "Faltan campos: name, courseId" });
  try {
    const course = await prisma.course.findUnique({ where: { id: String(courseId) } });
    if (!course) return res.status(404).json({ message: "Curso no encontrado" });
    const subject = await prisma.subject.create({
      data: {
        name: String(name).trim(),
        courseId: String(courseId)
      }
    });
    return res.status(201).json({ ok: true, id: subject.id });
  } catch (err) {
    return res.status(500).json({ message: "Error al crear asignatura" });
  }
});

// Delete subject
router.delete("/subjects/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subj = await prisma.subject.findUnique({ where: { id: String(req.params.id) } });
    if (!subj) return res.status(404).json({ message: "Asignatura no encontrada" });
    await prisma.subject.delete({ where: { id: String(req.params.id) } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al eliminar asignatura" });
  }
});

// ── Admin Rotations Endpoints ────────────────────────────────────────────────

// Get admin rotations
router.get("/rotations", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rotations = await prisma.rotation.findMany({
      include: {
        tutor: {
          include: { user: { select: { name: true, email: true } } }
        },
        hospital: true,
        service: true
      },
      orderBy: { startDate: "desc" }
    });
    
    return res.json(rotations.map(r => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      service: r.service.nombre,
      hospital: r.hospital.nombre,
      tutor_name: r.tutor?.user?.name || "",
      start_date: r.startDate.toISOString().slice(0, 10),
      end_date: r.endDate.toISOString().slice(0, 10),
    })));
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener rotaciones de administrador" });
  }
});

// Create admin rotation
router.post("/rotations", async (req: AuthenticatedRequest, res: Response) => {
  const { hospital, service, startDate, endDate, tutorId } = req.body || {};
  if (!hospital || !service || !startDate || !endDate) {
    return res.status(400).json({ message: "Faltan campos: hospital, service, startDate, endDate" });
  }

  try {
    // Find or create hospital
    let hospObj = await prisma.hospital.findUnique({
      where: { nombre: String(hospital).trim() }
    });
    if (!hospObj) {
      hospObj = await prisma.hospital.create({
        data: {
          nombre: String(hospital).trim(),
          tipo: "hospital"
        }
      });
    }

    // Find or create service
    let servObj = await prisma.service.findFirst({
      where: {
        hospitalId: hospObj.id,
        nombre: String(service).trim()
      }
    });
    if (!servObj) {
      servObj = await prisma.service.create({
        data: {
          hospitalId: hospObj.id,
          nombre: String(service).trim(),
          tipo: "otro"
        }
      });
    }

    let resolvedTutorId = "";
    if (tutorId) {
      const tutor = await prisma.tutor.findUnique({ where: { userId: tutorId } });
      if (tutor) {
        resolvedTutorId = tutor.id;
      } else {
        const tutorByProfileId = await prisma.tutor.findUnique({ where: { id: tutorId } });
        if (tutorByProfileId) {
          resolvedTutorId = tutorByProfileId.id;
        }
      }
    }

    const rotation = await prisma.rotation.create({
      data: {
        studentId: null,
        tutorId: resolvedTutorId || "",
        hospitalId: hospObj.id,
        serviceId: servObj.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        academicYear: "2025/2026",
        status: "planificada"
      }
    });

    // Automatically create a draft practice report
    await prisma.practiceReport.create({
      data: {
        rotationId: rotation.id,
        horasTotales: 0,
        estadoFirma: "borrador",
      },
    });

    return res.status(201).json({ ok: true, id: rotation.id });
  } catch (err) {
    return res.status(500).json({ message: "Error al crear rotación" });
  }
});

// Delete admin rotation
router.delete("/rotations/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rotation = await prisma.rotation.findUnique({ where: { id: String(req.params.id) } });
    if (!rotation) return res.status(404).json({ message: "Rotación no encontrada" });
    await prisma.rotation.delete({ where: { id: String(req.params.id) } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al eliminar rotación" });
  }
});

// Get students of rotation (Admin)
router.get("/rotations/:id/students", async (req: AuthenticatedRequest, res: Response) => {
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
    
    if (rotation.student) {
      return res.json([{
        id: rotation.student.user.id,
        name: rotation.student.user.name,
        email: rotation.student.user.email
      }]);
    }
    return res.json([]);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener alumnos de la rotación" });
  }
});

// Add student to rotation (Admin)
router.post("/rotations/:id/students", async (req: AuthenticatedRequest, res: Response) => {
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

    if (!rotation.studentId) {
      await prisma.rotation.update({
        where: { id: String(req.params.id) },
        data: { studentId: user.studentProfile.id }
      });
      return res.status(201).json({ ok: true, student: { id: user.id, name: user.name, email: user.email } });
    }

    if (rotation.studentId === user.studentProfile.id) {
      return res.status(409).json({ message: "El alumno ya está en esta rotación" });
    }

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

    return res.status(201).json({ ok: true, student: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    return res.status(500).json({ message: "Error al añadir alumno" });
  }
});

// Remove student from rotation (Admin)
router.delete("/rotations/:id/students/:studentId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rotation = await prisma.rotation.findUnique({
      where: { id: String(req.params.id) },
      include: { student: { include: { user: true } } }
    });
    if (!rotation) return res.status(404).json({ message: "Rotación no encontrada" });

    if (rotation.student && rotation.student.user.id === String(req.params.studentId)) {
      await prisma.rotation.update({
        where: { id: String(req.params.id) },
        data: { studentId: null }
      });
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
