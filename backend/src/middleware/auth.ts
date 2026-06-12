import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "mediloop-secret-dev-2026";

export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    role: string;
    email: string;
    name?: string;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  
  if (!token) {
    return res.status(401).json({ message: "No autorizado. Token faltante." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido o expirado." });
  }
}

export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: "Permisos insuficientes." });
    }
    return next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Acceso restringido a administradores." });
  }
  return next();
}
