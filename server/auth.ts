import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("\n❌ ERROR: JWT_SECRET environment variable is required");
  console.error("   Please set JWT_SECRET before starting the server.\n");
  process.exit(1);
}
const JWT_SECRET: string = jwtSecret;

export type UserRole = "admin" | "sales" | "leader";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  email?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "未登錄" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as unknown as AuthUser & {
      displayName?: string;
    };
    const row = db
      .prepare(
        `SELECT COALESCE(enabled, 1) as enabled, display_name, role, email
         FROM users WHERE id = ?`
      )
      .get(payload.id) as
      | { enabled: number; display_name: string; role: UserRole; email: string | null }
      | undefined;
    if (!row || row.enabled === 0) {
      res.status(401).json({ error: "賬號已停用，請聯繫管理員" });
      return;
    }
    req.user = {
      id: payload.id,
      username: payload.username,
      displayName: row.display_name,
      role: row.role,
      email: row.email,
    };
    next();
  } catch {
    res.status(401).json({ error: "登錄已過期，請重新登錄" });
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "需要管理員權限" });
    return;
  }
  next();
}

export function leaderOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "leader") {
    res.status(403).json({ error: "需要主管權限" });
    return;
  }
  next();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
