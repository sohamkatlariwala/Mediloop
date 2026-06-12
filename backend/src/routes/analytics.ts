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

// Get Research Analytics Dashboard overview data
router.get("/dashboard", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const totalRotations = await prisma.rotation.count();
    const completedRotations = await prisma.rotation.count({ where: { status: "finalizada" } });
    
    // Bidirectional feedback completion rates
    const feedbacks = await prisma.postRotationFeedback.findMany({});
    const studentFeedbackCount = feedbacks.filter(f => f.type === "student").length;
    const tutorFeedbackCount = feedbacks.filter(f => f.type === "tutor").length;
    
    // Preparation module adoption rate
    const totalStudents = await prisma.student.count();
    const studentsWithAccess = await prisma.student.count({
      where: {
        accessLogs: { some: {} },
      },
    });

    const adoptionRate = totalStudents > 0 ? (studentsWithAccess / totalStudents) * 100 : 0;

    // Hospital comparisons
    const hospitals = await prisma.hospital.findMany({
      where: { isArchived: false },
      include: {
        rotations: {
          include: {
            evaluations: {
              where: { evaluadoTipo: "student" },
            },
            feedbacks: true,
          },
        },
      },
    });

    const hospitalStats = hospitals.map(h => {
      let totalScoreSum = 0;
      let scoreCount = 0;
      let feedbackCount = 0;
      
      h.rotations.forEach(r => {
        r.evaluations.forEach(e => {
          if (e.totalScore !== null) {
            totalScoreSum += e.totalScore;
            scoreCount++;
          }
        });
        feedbackCount += r.feedbacks.length;
      });

      return {
        id: h.id,
        nombre: h.nombre,
        rotationsCount: h.rotations.length,
        avgStudentScore: scoreCount > 0 ? Number((totalScoreSum / scoreCount).toFixed(2)) : 0,
        feedbackCount,
      };
    });

    return res.json({
      summary: {
        totalRotations,
        completedRotations,
        adoptionRate: Number(adoptionRate.toFixed(1)),
        studentFeedbackCount,
        tutorFeedbackCount,
      },
      hospitalStats,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al recopilar analíticas de investigación" });
  }
});

// Export SPSS-Compatible CSV
router.get("/export-spss", requireAuth, requireCoordinatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rotations = await prisma.rotation.findMany({
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            checklists: true,
            accessLogs: true,
          },
        },
        tutor: {
          include: { user: { select: { name: true } } },
        },
        hospital: true,
        service: true,
        evaluations: true,
        feedbacks: true,
        selfAssessments: true,
      },
      orderBy: { startDate: "asc" },
    });

    // CSV header row (SPSS compatible, short alphanumeric variable names, no spaces or special characters)
    let csvHeader = "student_id,student_name,nia,curso,rotation_id,hospital_name,service_name,start_date,end_date,prep_accessed,prep_access_count,checklist_pct,checklist_completed,feedback_status,student_feedback,tutor_feedback,eval_score_avg,eval_progress,t0_avg,t1_avg,ret0_avg,del_avg,ret_del_avg";
    for (let i = 1; i <= 10; i++) {
      csvHeader += `,del_epa${i}`;
    }
    for (let i = 1; i <= 10; i++) {
      csvHeader += `,ret_del${i}`;
    }
    let csvContent = csvHeader + "\n";

    for (const r of rotations) {
      if (!r.student) continue;
      const studentName = r.student.user.name.replace(/,/g, " "); // escape commas
      const hospitalName = r.hospital.nombre.replace(/,/g, " ");
      const serviceName = r.service.nombre.replace(/,/g, " ");
      
      // Determine if prep module was accessed for this service
      const accessedLog = r.student.accessLogs.filter(l => l.moduleId !== null);
      const prepAccessed = accessedLog.length > 0 ? 1 : 0;
      const prepAccessCount = accessedLog.length;
      
      // Checklist completion percentage & counts
      const totalChecklistItems = 10; // 9 core EPAs + 1 custom goal
      const completedItems = r.student.checklists.filter(c => c.isAcquired).length;
      const checklistPct = Number(((completedItems / totalChecklistItems) * 100).toFixed(1));

      // Feedback submissions
      const hasStudentFeedback = r.feedbacks.some(f => f.type === "student") ? 1 : 0;
      const hasTutorFeedback = r.feedbacks.some(f => f.type === "tutor") ? 1 : 0;
      
      // Bidirectional feedback status mapping: 0=none, 1=student only, 2=tutor only, 3=both
      let feedbackStatus = 0;
      if (hasStudentFeedback && hasTutorFeedback) {
        feedbackStatus = 3;
      } else if (hasStudentFeedback) {
        feedbackStatus = 1;
      } else if (hasTutorFeedback) {
        feedbackStatus = 2;
      }

      // Evaluation scores (Mini-CEX)
      const studentEval = r.evaluations.find(e => e.evaluadoTipo === "student" && e.estado === "enviada");
      const evalScoreAvg = studentEval && studentEval.totalScore !== null ? studentEval.totalScore.toFixed(2) : "SYSMIS"; // SPSS system missing value
      
      // Ottawa progress decision mapped to numeric scale for SPSS convenience (1=repeat, 2=conditional, 3=ready)
      let evalProgress = "SYSMIS";
      if (studentEval && studentEval.comentariosGenerales) {
        if (studentEval.comentariosGenerales.includes("Needs to repeat")) {
          evalProgress = "1";
        } else if (studentEval.comentariosGenerales.includes("Ready with conditions")) {
          evalProgress = "2";
        } else if (studentEval.comentariosGenerales.includes("Ready to progress")) {
          evalProgress = "3";
        }
      }

      // Self-Assessments (T0, T1, retro_T0)
      const t0Assessment = r.selfAssessments.find(a => a.timepoint === "T0");
      const t1Assessment = r.selfAssessments.find(a => a.timepoint === "T1");
      const retroT0Assessment = r.selfAssessments.find(a => a.timepoint === "retro_T0");

      let t0Answers: any = null;
      let t1Answers: any = null;
      let retroT0Answers: any = null;

      try { if (t0Assessment) t0Answers = JSON.parse(t0Assessment.answers); } catch (e) {}
      try { if (t1Assessment) t1Answers = JSON.parse(t1Assessment.answers); } catch (e) {}
      try { if (retroT0Assessment) retroT0Answers = JSON.parse(retroT0Assessment.answers); } catch (e) {}

      let t0_avg = "SYSMIS";
      let t1_avg = "SYSMIS";
      let ret0_avg = "SYSMIS";
      let del_avg = "SYSMIS";
      let ret_del_avg = "SYSMIS";

      const deltas: Record<string, string> = {};
      const ret_deltas: Record<string, string> = {};
      
      for (let i = 1; i <= 10; i++) {
        deltas[`del_epa${i}`] = "SYSMIS";
        ret_deltas[`ret_del${i}`] = "SYSMIS";
      }

      let t0Sum = 0, t0Count = 0;
      let t1Sum = 0, t1Count = 0;
      let ret0Sum = 0, ret0Count = 0;

      const t0Vals: Record<number, number> = {};
      const t1Vals: Record<number, number> = {};
      const ret0Vals: Record<number, number> = {};

      if (t0Answers) {
        for (let i = 1; i <= 10; i++) {
          const val = t0Answers[`epa${i}`] ?? t0Answers[`EPA${i}`];
          if (typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)))) {
            const numVal = Number(val);
            t0Vals[i] = numVal;
            t0Sum += numVal;
            t0Count++;
          }
        }
      }
      if (t1Answers) {
        for (let i = 1; i <= 10; i++) {
          const val = t1Answers[`epa${i}`] ?? t1Answers[`EPA${i}`];
          if (typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)))) {
            const numVal = Number(val);
            t1Vals[i] = numVal;
            t1Sum += numVal;
            t1Count++;
          }
        }
      }
      if (retroT0Answers) {
        for (let i = 1; i <= 10; i++) {
          const val = retroT0Answers[`epa${i}`] ?? retroT0Answers[`EPA${i}`];
          if (typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)))) {
            const numVal = Number(val);
            ret0Vals[i] = numVal;
            ret0Sum += numVal;
            ret0Count++;
          }
        }
      }

      if (t0Count > 0) t0_avg = (t0Sum / t0Count).toFixed(2);
      if (t1Count > 0) t1_avg = (t1Sum / t1Count).toFixed(2);
      if (ret0Count > 0) ret0_avg = (ret0Sum / ret0Count).toFixed(2);

      if (t0Count > 0 && t1Count > 0) {
        del_avg = (Number(t1_avg) - Number(t0_avg)).toFixed(2);
        for (let i = 1; i <= 10; i++) {
          if (t1Vals[i] !== undefined && t0Vals[i] !== undefined) {
            deltas[`del_epa${i}`] = (t1Vals[i] - t0Vals[i]).toString();
          }
        }
      }
      if (ret0Count > 0 && t1Count > 0) {
        ret_del_avg = (Number(t1_avg) - Number(ret0_avg)).toFixed(2);
        for (let i = 1; i <= 10; i++) {
          if (t1Vals[i] !== undefined && ret0Vals[i] !== undefined) {
            ret_deltas[`ret_del${i}`] = (t1Vals[i] - ret0Vals[i]).toString();
          }
        }
      }

      let deltasStr = "";
      for (let i = 1; i <= 10; i++) {
        deltasStr += `,${deltas[`del_epa${i}`]}`;
      }
      let retDeltasStr = "";
      for (let i = 1; i <= 10; i++) {
        retDeltasStr += `,${ret_deltas[`ret_del${i}`]}`;
      }

      csvContent += `${r.studentId},${studentName},${r.student.nia},${r.student.curso},${r.id},${hospitalName},${serviceName},${r.startDate.toISOString().slice(0, 10)},${r.endDate.toISOString().slice(0, 10)},${prepAccessed},${prepAccessCount},${checklistPct},${completedItems},${feedbackStatus},${hasStudentFeedback},${hasTutorFeedback},${evalScoreAvg},${evalProgress},${t0_avg},${t1_avg},${ret0_avg},${del_avg},${ret_del_avg}${deltasStr}${retDeltasStr}\n`;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=mediloop_research_spss.csv");
    return res.send(csvContent);
  } catch (err) {
    return res.status(500).json({ message: "Error al generar exportación de SPSS" });
  }
});

export default router;
