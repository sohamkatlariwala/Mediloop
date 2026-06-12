import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

router.use(requireAuth);

// Get unread count
router.get("/unread-count", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const count = await prisma.message.count({
      where: {
        toId: req.user.sub,
        readAt: null,
      },
    });
    return res.json({ count });
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener recuento de no leídos" });
  }
});

// Get contacts list (tutors see their students, students see their tutors)
router.get("/contacts", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  try {
    let contacts: { id: string; name: string; role: string }[] = [];

    if (req.user.role === "tutor") {
      const tutor = await prisma.tutor.findUnique({ where: { userId: req.user.sub } });
      if (tutor) {
        // Fetch students in this tutor's rotations
        const students = await prisma.student.findMany({
          where: {
            rotations: { some: { tutorId: tutor.id } },
          },
          include: { user: { select: { id: true, name: true, role: true } } },
        });
        contacts = students.map(s => ({
          id: s.user.id,
          name: s.user.name,
          role: s.user.role,
        }));
      }
    } else if (req.user.role === "student") {
      const student = await prisma.student.findUnique({ where: { userId: req.user.sub } });
      if (student) {
        // Fetch tutors in this student's rotations
        const tutors = await prisma.tutor.findMany({
          where: {
            rotations: { some: { studentId: student.id } },
          },
          include: { user: { select: { id: true, name: true, role: true } } },
        });
        contacts = tutors.map(t => ({
          id: t.user.id,
          name: t.user.name,
          role: t.user.role,
        }));
      }
    } else {
      // Coordinator/Admin can talk to anyone
      const users = await prisma.user.findMany({
        where: { role: { not: "admin" } },
        select: { id: true, name: true, role: true },
        take: 30,
      });
      contacts = users;
    }

    const results = [];

    // Retrieve last message and unread counts for each contact
    for (const c of contacts) {
      const unreadCount = await prisma.message.count({
        where: {
          fromId: c.id,
          toId: req.user.sub,
          readAt: null,
        },
      });

      const lastMsg = await prisma.message.findFirst({
        where: {
          OR: [
            { fromId: req.user.sub, toId: c.id },
            { fromId: c.id, toId: req.user.sub },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      results.push({
        id: c.id,
        name: c.name,
        role: c.role,
        unread: unreadCount,
        lastMessage: lastMsg ? lastMsg.content : null,
        lastAt: lastMsg ? lastMsg.createdAt.toISOString() : null,
      });
    }

    return res.json(results);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener lista de contactos" });
  }
});

// Get chat thread with specific user
router.get("/thread/:userId", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const targetId = String(req.params.userId);

  try {
    const msgs = await prisma.message.findMany({
      where: {
        OR: [
          { fromId: req.user.sub, toId: targetId },
          { fromId: targetId, toId: req.user.sub },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    // Mark incoming messages as read
    await prisma.message.updateMany({
      where: {
        fromId: targetId,
        toId: req.user.sub,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    const results = msgs.map(m => ({
      id: m.id,
      fromId: m.fromId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    }));

    return res.json(results);
  } catch (err) {
    return res.status(500).json({ message: "Error al cargar hilo de conversación" });
  }
});

// Send message
router.post("/thread/:userId", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const targetId = String(req.params.userId);
  const { content } = req.body || {};

  if (!content || !content.trim()) {
    return res.status(400).json({ message: "El mensaje no puede estar vacío" });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ message: "Destinatario no encontrado" });

    const msg = await prisma.message.create({
      data: {
        fromId: req.user.sub,
        toId: targetId,
        content: content.trim(),
      },
    });

    return res.status(201).json({
      id: msg.id,
      fromId: msg.fromId,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al enviar mensaje" });
  }
});

// Search users to start new chat
router.get("/search-users", async (req: AuthenticatedRequest, res: Response) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) return res.json([]);
  
  const oppositeRole = req.user!.role === "tutor" ? "student" : "tutor";
  
  try {
    const users = await prisma.user.findMany({
      where: {
        role: req.user!.role === "coordinator" || req.user!.role === "admin" ? undefined : oppositeRole,
        OR: [
          { name: { contains: query } },
          { email: { contains: query } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      take: 10,
    });
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ message: "Error al buscar usuarios" });
  }
});

export default router;
