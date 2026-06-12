import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

router.use(requireAuth);

// Student Dashboard Overview
router.get("/student", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Perfil de estudiante no encontrado" });

    const rotations = await prisma.rotation.findMany({
      where: { studentId: student.id },
      include: {
        tutor: { include: { user: { select: { name: true, email: true } } } },
        hospital: true,
        service: true,
      },
      orderBy: { startDate: "asc" },
    });

    const now = new Date();
    const active = rotations.find(r => r.startDate <= now && r.endDate >= now) || rotations[0] || null;
    const completedCount = rotations.filter(r => r.endDate < now).length;

    // Fetch pending evaluations
    const evaluations = await prisma.evaluation.findMany({
      where: { evaluadorId: req.user.sub },
    });

    const evaluatedRotationIds = evaluations.map(e => e.rotationId);
    
    // Suggest evaluation for finished rotations where student hasn't evaluated tutor/hospital yet
    const pendingEvaluations = rotations
      .filter(r => r.endDate < now && !evaluatedRotationIds.includes(r.id))
      .map(r => ({
        id: r.id,
        tutorName: r.tutor.user.name,
        serviceName: r.service.nombre,
      }));

    // Fetch pending report signatures
    const reports = await prisma.practiceReport.findMany({
      where: {
        rotation: { studentId: student.id },
        estadoFirma: "borrador",
      },
      include: {
        rotation: { include: { service: true } },
      },
    });

    const pendingSignatures = reports.map(rep => ({
      id: rep.rotationId,
      serviceName: rep.rotation.service.nombre,
    }));

    return res.json({
      progress: { completed: completedCount, total: rotations.length },
      nextRotation: active ? {
        id: active.id,
        hospital: active.hospital.nombre,
        service: active.service.nombre,
        start_date: active.startDate.toISOString().slice(0, 10),
        end_date: active.endDate.toISOString().slice(0, 10),
        tutor_name: active.tutor.user.name,
        tutor_email: active.tutor.user.email,
      } : null,
      rotations: rotations.map(r => ({
        id: r.id,
        hospital: r.hospital.nombre,
        service: r.service.nombre,
        start_date: r.startDate.toISOString().slice(0, 10),
        end_date: r.endDate.toISOString().slice(0, 10),
        tutor_name: r.tutor.user.name,
        status: r.status,
      })),
      pendingEvaluations,
      pendingSignatures,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al cargar el panel de estudiante" });
  }
});

// Tutor Dashboard Overview
router.get("/tutor", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
    if (!tutor) return res.status(404).json({ message: "Perfil de tutor no encontrado" });

    const studentCount = await prisma.student.count({
      where: {
        rotations: { some: { tutorId: tutor.id } },
      },
    });

    const evaluationsCount = await prisma.evaluation.count({
      where: {
        evaluadorId: req.user.sub,
        evaluadoTipo: "student",
      },
    });

    const averageEval = await prisma.evaluation.aggregate({
      where: {
        evaluadorId: req.user.sub,
        evaluadoTipo: "student",
      },
      _avg: {
        totalScore: true,
      },
    });

    const avgScore = averageEval._avg.totalScore ? averageEval._avg.totalScore.toFixed(1) : "—";

    return res.json({
      stats: {
        studentsEvaluated: evaluationsCount,
        averageScore: avgScore,
        globalRank: "Rank #1", // simplified ranking mockup
      },
      kpis: {
        students: studentCount,
        avg: parseFloat(avgScore) || 0.0,
        achievements: evaluationsCount,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al cargar el panel de tutor" });
  }
});

export default router;
