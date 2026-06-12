import express, { Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "mediloop-secret-dev-2026";
const ACCESS_TOKEN_EXPIRES = "15m";
const REFRESH_TOKEN_EXPIRES = "7d";

// Helper to log system activity
async function logActivity(userId: string | null, userName: string, action: string, details?: string | null) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || "adm-1", // default fallback or system id
        action,
        details: details || null,
      },
    });
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}

// Generate tokens
function generateTokens(user: { id: string; email: string; role: string; name: string }) {
  const accessToken = jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );
  
  const refreshToken = jwt.sign(
    { sub: user.id },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES }
  );
  
  return { accessToken, refreshToken };
}

// ── Auth Endpoints ───────────────────────────────────────────────────────────

// Register
router.post("/register", async (req: express.Request, res: Response) => {
  const { email, name, password, role, nia, curso, grupo, planEstudios, especialidad, servicioPrincipal } = req.body || {};

  if (!email || !name || !password || !role) {
    return res.status(400).json({ message: "Faltan campos obligatorios" });
  }

  const emailLower = email.toLowerCase().trim();
  if (!emailLower.endsWith("@uji.es")) {
    return res.status(400).json({ message: "Solo se permiten correos @uji.es" });
  }

  if (!["student", "tutor", "coordinator", "admin"].includes(role)) {
    return res.status(400).json({ message: "Rol inválido" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe una cuenta con ese correo" });
    }

    const hash = bcrypt.hashSync(password, 10);
    
    // Create transaction to create user and role-specific profile
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: emailLower,
          name: name.trim(),
          role,
          passwordHash: hash,
          isVerified: false,
        },
      });

      if (role === "student") {
        if (!nia || !curso) {
          throw new Error("Estudiantes deben proveer NIA y curso");
        }
        await tx.student.create({
          data: {
            userId: newUser.id,
            nia: String(nia).trim(),
            curso: Number(curso),
            grupo: grupo ? String(grupo).trim() : null,
            planEstudios: planEstudios ? String(planEstudios).trim() : null,
          },
        });
      } else if (role === "tutor") {
        await tx.tutor.create({
          data: {
            userId: newUser.id,
            especialidad: especialidad ? String(especialidad).trim() : null,
            servicioPrincipal: servicioPrincipal ? String(servicioPrincipal).trim() : null,
          },
        });
      }

      return newUser;
    });

    const tokens = generateTokens({ id: result.id, email: result.email, role: result.role, name: result.name });
    
    // Save refresh token to DB
    await prisma.user.update({
      where: { id: result.id },
      data: { refreshToken: tokens.refreshToken },
    });

    await logActivity(result.id, result.name, "Nuevo usuario registrado", `Rol: ${role} · Email: ${emailLower}`);

    return res.status(201).json({
      user: { id: result.id, email: result.email, name: result.name, role: result.role },
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || "Error al registrar usuario" });
  }
});

// Login
router.post("/login", async (req: express.Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Faltan campos obligatorios" });
  }

  const emailLower = String(email).toLowerCase().trim();
  if (!emailLower.endsWith("@uji.es")) {
    return res.status(400).json({ message: "Solo se permiten correos @uji.es" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: emailLower } });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const tokens = generateTokens({ id: user.id, email: user.email, role: user.role, name: user.name });
    
    // Save new refresh token (rotation)
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    await logActivity(user.id, user.name, "Sesión iniciada", `Usuario: ${user.name}`);

    return res.json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Refresh Token Rotation
router.post("/refresh", async (req: express.Request, res: Response) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ message: "Falta el refresh token" });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    
    if (!user || user.refreshToken !== refreshToken) {
      // Refresh token mismatch or reused -> revoke session for security
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { refreshToken: null },
        });
      }
      return res.status(401).json({ message: "Sesión expirada o token inválido" });
    }

    const tokens = generateTokens({ id: user.id, email: user.email, role: user.role, name: user.name });
    
    // Save rotated refresh token
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    return res.json({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
});

// Get profile
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        studentProfile: true,
        tutorProfile: true,
      },
    });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// Update Profile
router.put("/profile", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "El nombre es obligatorio" });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.sub },
      data: { name: String(name).trim() },
      select: { id: true, email: true, name: true, role: true },
    });
    await logActivity(updated.id, updated.name, "Perfil actualizado", `Nombre cambiado a: ${updated.name}`);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar perfil" });
  }
});

// Update Password
router.put("/password", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "No autorizado" });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Faltan campos" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(401).json({ message: "Contraseña actual incorrecta" });
    }

    await prisma.user.update({
      where: { id: req.user.sub },
      data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
    });

    await logActivity(user.id, user.name, "Contraseña cambiada", null);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al cambiar contraseña" });
  }
});

// Request Password Reset Link
router.post("/forgot-password", async (req: express.Request, res: Response) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: "Falta el correo electrónico" });

  const emailLower = String(email).toLowerCase().trim();
  try {
    const user = await prisma.user.findUnique({ where: { email: emailLower } });
    // Secure design: do not reveal if the email exists
    if (!user) {
      return res.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExpires: expires,
      },
    });

    await logActivity(user.id, user.name, "Solicitud de recuperación de contraseña", `Email: ${emailLower}`);

    // If SMTP is configured, we would send the email here.
    // For demo purposes, we will return the token in the API response.
    return res.json({ ok: true, resetToken: token });
  } catch (err) {
    return res.status(500).json({ message: "Error al procesar recuperación" });
  }
});

// Reset Password with Token
router.post("/reset-password", async (req: express.Request, res: Response) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ message: "Faltan campos" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { resetToken: token },
    });

    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return res.status(400).json({ message: "Enlace inválido o expirado. Solicita uno nuevo." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: bcrypt.hashSync(newPassword, 10),
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    await logActivity(user.id, user.email, "Contraseña restablecida por token", null);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error al restablecer contraseña" });
  }
});

export default router;
