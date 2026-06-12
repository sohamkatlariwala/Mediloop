/// <reference types="jest" />
import request from 'supertest';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import authRoutes from '../src/routes/auth';
import rotationRoutes from '../src/routes/rotations';
import attendanceRoutes from '../src/routes/attendance';
import groupRoutes from '../src/routes/groups';
import prepRoutes from '../src/routes/prep';
import evaluationRoutes from '../src/routes/evaluations';
import feedbackRoutes from '../src/routes/feedback';
import analyticsRoutes from '../src/routes/analytics';
import prisma from '../src/prisma';

// Create test express application
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/rotations', rotationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/study-groups', groupRoutes);
app.use('/api/prep', prepRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);

// Helper function from attendance.ts to test token validation logic
function makeQrToken(rotationId: string, tutorId: string, periodOffset: number = 0): string {
  const period = Math.floor(Date.now() / 43200000) + periodOffset;
  return crypto
    .createHash('sha256')
    .update(`${rotationId}:${tutorId}:${period}`)
    .digest('hex')
    .slice(0, 32);
}

describe('Mediloop v4.0 - E2E Integration and Unit Tests', () => {
  
  beforeAll(async () => {
    // Clean test accounts if present
    const testUsers = await prisma.user.findMany({
      where: {
        email: {
          in: ['test.student@uji.es', 'invalid.email@gmail.com', 'test.tutor@uji.es']
        }
      },
      select: { id: true }
    });
    const testUserIds = testUsers.map(u => u.id);
    if (testUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          userId: { in: testUserIds }
        }
      });
      await prisma.user.deleteMany({
        where: {
          id: { in: testUserIds }
        }
      });
    }
  });

  afterAll(async () => {
    // Clean up
    const testUsers = await prisma.user.findMany({
      where: {
        email: {
          in: ['test.student@uji.es', 'invalid.email@gmail.com', 'test.tutor@uji.es']
        }
      },
      select: { id: true }
    });
    const testUserIds = testUsers.map(u => u.id);
    if (testUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          userId: { in: testUserIds }
        }
      });
      await prisma.user.deleteMany({
        where: {
          id: { in: testUserIds }
        }
      });
    }
    await prisma.$disconnect();
  });

  describe('Module 1: Authentication & GDPR Gatekeeper', () => {
    it('should reject registration with a non-@uji.es domain email address', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid.email@gmail.com',
          name: 'Jane Doe',
          password: 'securePassword123',
          role: 'student',
          nia: '123456',
          curso: 3
        });
      
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Solo se permiten correos @uji.es');
    });

    it('should successfully register a valid student with an @uji.es email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test.student@uji.es',
          name: 'Ana Test',
          password: 'securePassword123',
          role: 'student',
          nia: '999999',
          curso: 4,
          grupo: 'A',
          planEstudios: 'Medicina UJI'
        });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('test.student@uji.es');
      expect(response.body.token).toBeDefined();
    });

    it('should authenticate user and return rotated refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test.student@uji.es',
          password: 'securePassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
    });
  });

  describe('Module 4: Attendance QR Token Rotation Cryptography', () => {
    it('should generate identical tokens in the same 12h window', () => {
      const rotId = 'rotation-uuid';
      const tutorId = 'tutor-uuid';
      
      const token1 = makeQrToken(rotId, tutorId, 0);
      const token2 = makeQrToken(rotId, tutorId, 0);
      
      expect(token1).toBe(token2);
      expect(token1.length).toBe(32);
    });

    it('should generate a different token if the 12h window changes', () => {
      const rotId = 'rotation-uuid';
      const tutorId = 'tutor-uuid';
      
      const tokenCurrent = makeQrToken(rotId, tutorId, 0);
      const tokenPrevious = makeQrToken(rotId, tutorId, -1);
      
      expect(tokenCurrent).not.toBe(tokenPrevious);
    });
  });

  describe('Module 5 & 6: Pre-Rotation Assessments, Tutor Evaluations, and SPSS Analytics', () => {
    let studentToken: string;
    let tutorToken: string;
    let coordToken: string;
    let studentId: string;
    let tutorId: string;
    let rotationId: string;
    let rubricId: string;
    let criteriaIds: string[] = [];

    beforeAll(async () => {
      // 1. Register/Login Student
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test.student@uji.es',
          name: 'Ana Test',
          password: 'securePassword123',
          role: 'student',
          nia: '999999',
          curso: 4,
          grupo: 'A',
          planEstudios: 'Medicina UJI'
        });

      const studLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test.student@uji.es', password: 'securePassword123' });
      studentToken = studLogin.body.token;

      // 2. Register/Login Tutor
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test.tutor@uji.es',
          name: 'Doctor Test',
          password: 'securePassword123',
          role: 'tutor',
          especialidad: 'Medicina Interna',
          servicioPrincipal: 'Medicina Interna'
        });

      const tutLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test.tutor@uji.es', password: 'securePassword123' });
      tutorToken = tutLogin.body.token;

      // 3. Login Coordinator
      const coordLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'coordinator@uji.es', password: '123456' });
      coordToken = coordLogin.body.token;

      // 4. Fetch profiles to create Rotation
      const studentProfile = await prisma.student.findFirst({
        where: { user: { email: 'test.student@uji.es' } }
      });
      studentId = studentProfile!.id;

      const tutorProfile = await prisma.tutor.findFirst({
        where: { user: { email: 'test.tutor@uji.es' } }
      });
      tutorId = tutorProfile!.id;

      const hospital = await prisma.hospital.findFirst();
      const service = await prisma.service.findFirst();

      const rotation = await prisma.rotation.create({
        data: {
          studentId: studentId,
          tutorId: tutorId,
          hospitalId: hospital!.id,
          serviceId: service!.id,
          startDate: new Date(),
          endDate: new Date(Date.now() + 86400000 * 14),
          academicYear: '2025/2026',
          status: 'en_curso'
        }
      });
      rotationId = rotation.id;

      // 5. Fetch Rubric
      const rubric = await prisma.rubric.findFirst({
        where: { tipo: 'eval_estudiante', activo: true },
        include: { criteria: true }
      });
      rubricId = rubric!.id;
      criteriaIds = rubric!.criteria.map(c => c.id);
    });

    afterAll(async () => {
      // Clean up rotation & assessments & evaluations we created
      if (rotationId) {
        await prisma.evaluationAnswer.deleteMany({
          where: { evaluation: { rotationId } }
        });
        await prisma.evaluation.deleteMany({
          where: { rotationId }
        });
        await prisma.selfAssessment.deleteMany({
          where: { rotationId }
        });
        await prisma.rotation.deleteMany({
          where: { id: rotationId }
        });
      }
    });

    it('should submit student T0 self-assessment successfully', async () => {
      const answersT0: Record<string, number> = {};
      for (let i = 1; i <= 10; i++) {
        answersT0[`epa${i}`] = 2; // initial baseline of 2
      }

      const response = await request(app)
        .post('/api/prep/assessments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          rotationId,
          timepoint: 'T0',
          answers: answersT0,
          goals: 'Quiero mejorar mi razonamiento clínico y la anamnesis.'
        });

      expect(response.status).toBe(201);
      expect(response.body.timepoint).toBe('T0');
      expect(response.body.goals).toContain('razonamiento clínico');
    });

    it('should submit student T1 and Then-T0 assessments successfully', async () => {
      const answersT1: Record<string, number> = {};
      const answersRetro: Record<string, number> = {};
      for (let i = 1; i <= 10; i++) {
        answersT1[`epa${i}`] = 4; // confident score of 4 at the end
        answersRetro[`epa${i}`] = 1; // retrospective realization of baseline 1
      }

      const resT1 = await request(app)
        .post('/api/prep/assessments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          rotationId,
          timepoint: 'T1',
          answers: answersT1
        });

      expect(resT1.status).toBe(201);

      const resRetro = await request(app)
        .post('/api/prep/assessments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          rotationId,
          timepoint: 'retro_T0',
          answers: answersRetro
        });

      expect(resRetro.status).toBe(201);
    });

    it('should reject student self-assessments with invalid timepoint', async () => {
      const response = await request(app)
        .post('/api/prep/assessments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          rotationId,
          timepoint: 'T2',
          answers: { epa1: 3 }
        });

      expect(response.status).toBe(400);
    });

    it('should reject tutor evaluation if comments are less than 30 characters', async () => {
      const answers = criteriaIds.map(critId => ({
        criterionId: critId,
        valor: 4,
        comentario: 'OK'
      }));

      const response = await request(app)
        .post('/api/evaluations/student')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          rotationId,
          rubricId,
          answers,
          strengthText: 'Short', // <30 chars
          improvementText: 'Este es un texto largo que sí cumple los treinta caracteres mínimos.',
          autonomyDecision: 'Supervisión indirecta'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('debe tener al menos 30 caracteres');
    });

    it('should evaluate student and trigger Ottawa rule "Needs to repeat" if any score is < 3', async () => {
      // 1 of the scores is 2 (< 3), which triggers "Needs to repeat"
      const answers = criteriaIds.map((critId, index) => ({
        criterionId: critId,
        valor: index === 0 ? 2 : 4,
        comentario: 'Buen desempeño clínico en general'
      }));

      const response = await request(app)
        .post('/api/evaluations/student')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          rotationId,
          rubricId,
          answers,
          strengthText: 'Demuestra excelente puntualidad y empatía con los pacientes.',
          improvementText: 'Debe profundizar más en el diagnóstico diferencial complejo.',
          autonomyDecision: 'Supervisión directa'
        });

      expect(response.status).toBe(201);
      expect(response.body.decision).toBe('Needs to repeat');
    });

    it('should evaluate student and trigger Ottawa rule "Ready to progress" if all scores are >= 4', async () => {
      const answers = criteriaIds.map(critId => ({
        criterionId: critId,
        valor: 4,
        comentario: 'Excelente trabajo clínico'
      }));

      // Delete existing evaluation to avoid duplicates
      await prisma.evaluationAnswer.deleteMany({
        where: { evaluation: { rotationId } }
      });
      await prisma.evaluation.deleteMany({
        where: { rotationId }
      });

      const response = await request(app)
        .post('/api/evaluations/student')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          rotationId,
          rubricId,
          answers,
          strengthText: 'Demuestra excelente puntualidad y empatía con los pacientes.',
          improvementText: 'Debe profundizar más en el diagnóstico diferencial complejo.',
          autonomyDecision: 'Supervisión de guardia'
        });

      expect(response.status).toBe(201);
      expect(response.body.decision).toBe('Ready to progress');
      expect(response.body.average).toBe(4.0);
    });

    it('should export SPSS CSV with T0/T1 delta scores, feedback status, and checklist completed count', async () => {
      const response = await request(app)
        .get('/api/analytics/export-spss')
        .set('Authorization', `Bearer ${coordToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      
      const csv = response.text;
      // Check headers
      expect(csv).toContain('checklist_completed');
      expect(csv).toContain('feedback_status');
      expect(csv).toContain('t0_avg');
      expect(csv).toContain('t1_avg');
      expect(csv).toContain('del_epa1');
      expect(csv).toContain('ret_del1');
      
      // Since we just submitted T0 (epa=2) and T1 (epa=4) and retro_T0 (epa=1)
      // the averages should be 2.00, 4.00, 1.00 respectively
      // and del_avg = 4 - 2 = 2.00
      // and ret_del_avg = 4 - 1 = 3.00
      expect(csv).toContain('2.00,4.00,1.00,2.00,3.00');
    });
  });
});
