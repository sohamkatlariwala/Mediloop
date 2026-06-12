import express from "express";
import cors from "cors";
import path from "path";

// Routes imports
import authRoutes from "./routes/auth";
import hospitalRoutes from "./routes/hospitals";
import rotationRoutes from "./routes/rotations";
import attendanceRoutes from "./routes/attendance";
import reportRoutes from "./routes/reports";
import evaluationRoutes from "./routes/evaluations";
import incidentRoutes from "./routes/incidents";
import libraryRoutes from "./routes/library";
import prepRoutes from "./routes/prep";
import feedbackRoutes from "./routes/feedback";
import analyticsRoutes from "./routes/analytics";
import aiRoutes from "./routes/ai";
import adminRoutes from "./routes/admin";
import messageRoutes from "./routes/messages";
import dashboardRoutes from "./routes/dashboard";
import communityRoutes from "./routes/community";
import groupRoutes from "./routes/groups";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Serve static frontend assets
app.use(express.static(path.join(__dirname, "..", "..", "frontend", "public"), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  }
}));

// API Routes mounting
app.use("/api/auth", authRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/rotations", rotationRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/evaluations", evaluationRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/prep", prepRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/study-groups", groupRoutes);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "mediloop-backend-ts" });
});

// Root route redirects to landing page
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "..", "frontend", "public", "index.html"));
});

// Fallback 404 handler
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ message: "Ruta de API no encontrada" });
  }
  res.status(404).sendFile(path.join(__dirname, "..", "..", "frontend", "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`Mediloop backend TypeScript escuchando en puerto ${PORT}`);
});
