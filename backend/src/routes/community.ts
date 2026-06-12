import express, { Response } from "express";
import prisma from "../prisma";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

router.use(requireAuth);

// Helper to format timestamps to relative time strings (e.g. "Hace 2 min")
function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "Ahora";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `Hace ${m} min`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `Hace ${h} h`;
  }
  const d = Math.floor(diff / 86400);
  return `Hace ${d} ${d === 1 ? "día" : "días"}`;
}

// ── Student Community Feed ──────────────────────────────────────────────────

// Get student posts
router.get("/student-posts", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const posts = await prisma.studentPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    
    // Seed some sample community posts if empty
    if (posts.length === 0) {
      const p1 = await prisma.studentPost.create({
        data: {
          author: "María Rodríguez",
          text: "¿Alguien puede explicar la diferencia entre taquicardia sinusal y fibrilación auricular?",
          likes: 12,
        },
      });
      const p2 = await prisma.studentPost.create({
        data: {
          author: "Juan Pérez",
          text: "Compartiendo mis apuntes de neuroanatomía. ¡Espero que os sirvan!",
          likes: 28,
        },
      });
      
      return res.json([
        { id: p1.id, author: p1.author, text: p1.text, likes: p1.likes, ago: "Hace 2 h" },
        { id: p2.id, author: p2.author, text: p2.text, likes: p2.likes, ago: "Hace 4 h" },
      ]);
    }

    const mapped = posts.map(p => ({
      id: p.id,
      author: p.author,
      text: p.text,
      likes: p.likes,
      ago: timeAgo(p.createdAt),
    }));

    return res.json(mapped);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener posts de alumnos" });
  }
});

// Create student post
router.post("/student-posts", requireRole("student"), async (req: AuthenticatedRequest, res: Response) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ message: "El texto no puede estar vacío" });
  }

  try {
    const post = await prisma.studentPost.create({
      data: {
        author: req.user?.name || "Alumno",
        text: String(text).trim(),
      },
    });

    return res.status(201).json({
      id: post.id,
      author: post.author,
      text: post.text,
      likes: post.likes,
      ago: "Ahora",
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al publicar post" });
  }
});

// Like student post
router.post("/student-posts/:id/like", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await prisma.studentPost.update({
      where: { id: String(req.params.id) },
      data: {
        likes: { increment: 1 },
      },
    });
    return res.json({ likes: updated.likes });
  } catch (err) {
    return res.status(500).json({ message: "Error al dar like" });
  }
});

// ── Tutor Community Feed ────────────────────────────────────────────────────

// Get tutor posts
router.get("/tutor-posts", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const posts = await prisma.tutorPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Seed some sample community posts if empty
    if (posts.length === 0) {
      const p1 = await prisma.tutorPost.create({
        data: {
          author: "Dra. Patricia Ruiz",
          text: "¿Alguien tiene experiencia evaluando estudiantes de intercambio internacional?",
          likes: 12,
          comments: 5,
        },
      });
      const p2 = await prisma.tutorPost.create({
        data: {
          author: "Dr. Miguel Torres",
          text: "Excelente webinar sobre evaluación por competencias. ¡Muy recomendado!",
          likes: 8,
          comments: 3,
        },
      });
      
      return res.json([
        { id: p1.id, author: p1.author, text: p1.text, likes: p1.likes, comments: p1.comments, ago: "Hace 2 h" },
        { id: p2.id, author: p2.author, text: p2.text, likes: p2.likes, comments: p2.comments, ago: "Hace 4 h" },
      ]);
    }

    const mapped = posts.map(p => ({
      id: p.id,
      author: p.author,
      text: p.text,
      likes: p.likes,
      comments: p.comments,
      ago: timeAgo(p.createdAt),
    }));

    return res.json(mapped);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener posts de tutores" });
  }
});

// Create tutor post
router.post("/tutor-posts", requireRole("tutor"), async (req: AuthenticatedRequest, res: Response) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ message: "El texto no puede estar vacío" });
  }

  try {
    const post = await prisma.tutorPost.create({
      data: {
        author: req.user?.name || "Tutor",
        text: String(text).trim(),
      },
    });

    return res.status(201).json({
      id: post.id,
      author: post.author,
      text: post.text,
      likes: post.likes,
      comments: post.comments,
      ago: "Ahora",
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al publicar post" });
  }
});

// Like tutor post
router.post("/tutor-posts/:id/like", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await prisma.tutorPost.update({
      where: { id: String(req.params.id) },
      data: {
        likes: { increment: 1 },
      },
    });
    return res.json({ likes: updated.likes });
  } catch (err) {
    return res.status(500).json({ message: "Error al dar like" });
  }
});

export default router;
