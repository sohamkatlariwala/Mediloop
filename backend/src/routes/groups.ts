import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

router.use(requireAuth);

// Get list of study groups
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) {
      // Tutors can see study groups but don't join them
      const groups = await prisma.studyGroup.findMany({});
      return res.json(groups.map(g => ({ ...g, member_count: 0, isMember: false })));
    }

    const groups = await prisma.studyGroup.findMany({
      orderBy: { createdAt: "desc" },
    });

    const membersMap = await prisma.studyGroupMember.findMany({
      where: { studentId: student.id },
    });
    
    const myJoinedGroupIds = membersMap.map(m => m.groupId);

    const result = [];
    for (const g of groups) {
      const count = await prisma.studyGroupMember.count({ where: { groupId: g.id } });
      result.push({
        id: g.id,
        name: g.name,
        description: g.description || "",
        creator_id: g.creatorId,
        created_at: g.createdAt.toISOString(),
        member_count: count,
        isMember: myJoinedGroupIds.includes(g.id),
      });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener grupos de estudio" });
  }
});

// Create study group
router.post("/", requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { name, description } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "El nombre es obligatorio" });
  }

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Perfil de estudiante no encontrado" });

    const group = await prisma.studyGroup.create({
      data: {
        name: name.trim(),
        description: description ? String(description).trim() : "",
        creatorId: student.id,
      },
    });

    // Creator automatically joins the group
    await prisma.studyGroupMember.create({
      data: {
        groupId: group.id,
        studentId: student.id,
      },
    });

    return res.status(201).json({ ok: true, id: group.id });
  } catch (err) {
    return res.status(500).json({ message: "Error al crear grupo de estudio" });
  }
});

// Join study group
router.post("/:id/join", requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Perfil de estudiante no encontrado" });

    const group = await prisma.studyGroup.findUnique({ where: { id: String(req.params.id) } });
    if (!group) return res.status(404).json({ message: "Grupo no encontrado" });

    const existing = await prisma.studyGroupMember.findUnique({
      where: {
        groupId_studentId: {
          groupId: String(req.params.id),
          studentId: student.id,
        },
      },
    });

    if (existing) {
      return res.status(409).json({ message: "Ya eres miembro de este grupo" });
    }

    await prisma.studyGroupMember.create({
      data: {
        groupId: String(req.params.id),
        studentId: student.id,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al unirse al grupo" });
  }
});

// Leave study group
router.delete("/:id/leave", requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  try {
    const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
    if (!student) return res.status(404).json({ message: "Perfil de estudiante no encontrado" });

    await prisma.studyGroupMember.delete({
      where: {
        groupId_studentId: {
          groupId: String(req.params.id),
          studentId: student.id,
        },
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al abandonar el grupo" });
  }
});

export default router;
