import { Op } from 'sequelize';
import { Grade, Subject, Student, Attendance, Class } from '../models/index.js';

export interface SubjectGrade {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  term1: number | null;
  term2: number | null;
  term3: number | null;
  annualAverage: number | null;
}

export interface StudentReportData {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    studentId: string;
    classId: string;
    className: string;
  };
  subjects: SubjectGrade[];
  trimesterAverages: { term1: number | null; term2: number | null; term3: number | null };
  annualAverage: number | null;
  rank: number | null;
  totalStudents: number;
  attendance: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
    rate: number | null;
  };
}

/**
 * Calculate weighted average for a set of grades
 */
export function calculateWeightedAverage(grades: { score: number; coefficient: number }[]): number | null {
  if (grades.length === 0) return null;
  const totalScore = grades.reduce((sum, g) => sum + Number(g.score) * Number(g.coefficient), 0);
  const totalCoef = grades.reduce((sum, g) => sum + Number(g.coefficient), 0);
  if (totalCoef === 0) return null;
  return Math.round((totalScore / totalCoef) * 100) / 100;
}

/**
 * Calculate trimester average for a student (weighted by coefficient)
 */
export async function calculateTrimesterAverage(
  schoolId: string,
  studentId: string,
  term: number,
  academicYear?: string
): Promise<number | null> {
  const where: any = { schoolId, studentId, term, [Op.or]: [{ status: 'PUBLISHED' }, { status: null }] };
  if (academicYear) where.academicYear = academicYear;

  const grades = await Grade.findAll({ where });
  return calculateWeightedAverage(grades.map((g) => ({ score: g.score, coefficient: g.coefficient })));
}

/**
 * Calculate annual average (average of 3 trimesters)
 */
export function calculateAnnualAverage(
  term1: number | null,
  term2: number | null,
  term3: number | null
): number | null {
  const terms = [term1, term2, term3].filter((t): t is number => t !== null);
  if (terms.length === 0) return null;
  const sum = terms.reduce((acc, t) => acc + t, 0);
  return Math.round((sum / terms.length) * 100) / 100;
}

/**
 * Calculate class rank for a student
 */
export async function calculateClassRank(
  schoolId: string,
  studentId: string,
  classId: string,
  term: number,
  academicYear?: string
): Promise<{ rank: number; totalStudents: number }> {
  const students = await Student.findAll({
    where: { schoolId, classId, status: 'active' },
    attributes: ['id'],
  });

  const studentAverages: { id: string; avg: number }[] = [];
  for (const s of students) {
    const avg = await calculateTrimesterAverage(schoolId, s.id, term, academicYear);
    studentAverages.push({ id: s.id, avg: avg ?? 0 });
  }

  studentAverages.sort((a, b) => b.avg - a.avg);
  const rank = studentAverages.findIndex((s) => s.id === studentId) + 1;

  return { rank: rank > 0 ? rank : 0, totalStudents: students.length };
}

/**
 * Get attendance summary for a student
 */
export async function getAttendanceSummary(
  schoolId: string,
  studentId: string
): Promise<{ present: number; absent: number; late: number; excused: number; total: number; rate: number | null }> {
  const attendances = await Attendance.findAll({ where: { schoolId, studentId } });

  const present = attendances.filter((a) => a.status === 'present').length;
  const absent = attendances.filter((a) => a.status === 'absent').length;
  const late = attendances.filter((a) => a.status === 'late').length;
  const excused = attendances.filter((a) => a.status === 'excused').length;
  const total = attendances.length;
  const rate = total > 0 ? Math.round(((present + late) / total) * 10000) / 100 : null;

  return { present, absent, late, excused, total, rate };
}

/**
 * Get full report data for a student across all 3 trimesters
 */
export async function getStudentReportData(
  schoolId: string,
  studentId: string,
  academicYear?: string
): Promise<StudentReportData | null> {
  const student = await Student.findOne({
    where: { id: studentId, schoolId },
    include: [{ model: Class, as: 'class' }],
  });

  if (!student) return null;

  const classId = student.classId;
  if (!classId) return null;

  // Get all subjects for this class
  const subjects = await Subject.findAll({
    where: { schoolId, classId },
    order: [['name', 'ASC']],
  });

  // Get all grades for this student in this class
  const allGrades = await Grade.findAll({
    where: { schoolId, studentId, [Op.or]: [{ status: 'PUBLISHED' }, { status: null }] },
    include: [{ model: Subject, as: 'subject' }],
  });

  // Build subject grade data
  const subjectGrades: SubjectGrade[] = subjects.map((subject) => {
    const subjectGradeList = allGrades.filter((g) => g.subjectId === subject.id);

    const getTermAvg = (term: number): number | null => {
      const termGrades = subjectGradeList.filter((g) => g.term === term);
      if (termGrades.length === 0) return null;
      return calculateWeightedAverage(
        termGrades.map((g) => ({ score: g.score, coefficient: g.coefficient }))
      );
    };

    const t1 = getTermAvg(1);
    const t2 = getTermAvg(2);
    const t3 = getTermAvg(3);

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      coefficient: Number(subject.coefficient),
      term1: t1,
      term2: t2,
      term3: t3,
      annualAverage: calculateAnnualAverage(t1, t2, t3),
    };
  });

  // Calculate trimester averages
  const term1Avg = calculateWeightedAverage(
    allGrades.filter((g) => g.term === 1).map((g) => ({ score: g.score, coefficient: g.coefficient }))
  );
  const term2Avg = calculateWeightedAverage(
    allGrades.filter((g) => g.term === 2).map((g) => ({ score: g.score, coefficient: g.coefficient }))
  );
  const term3Avg = calculateWeightedAverage(
    allGrades.filter((g) => g.term === 3).map((g) => ({ score: g.score, coefficient: g.coefficient }))
  );

  const annualAverage = calculateAnnualAverage(term1Avg, term2Avg, term3Avg);

  // Calculate rank based on annual average
  const allStudents = await Student.findAll({
    where: { schoolId, classId, status: 'active' },
    attributes: ['id'],
  });

  const studentAnnualAverages: { id: string; avg: number }[] = [];
  for (const s of allStudents) {
    const sGrades = await Grade.findAll({ where: { schoolId, studentId: s.id, [Op.or]: [{ status: 'PUBLISHED' }, { status: null }] } });
    const sT1 = calculateWeightedAverage(
      sGrades.filter((g) => g.term === 1).map((g) => ({ score: g.score, coefficient: g.coefficient }))
    );
    const sT2 = calculateWeightedAverage(
      sGrades.filter((g) => g.term === 2).map((g) => ({ score: g.score, coefficient: g.coefficient }))
    );
    const sT3 = calculateWeightedAverage(
      sGrades.filter((g) => g.term === 3).map((g) => ({ score: g.score, coefficient: g.coefficient }))
    );
    const avg = calculateAnnualAverage(sT1, sT2, sT3);
    studentAnnualAverages.push({ id: s.id, avg: avg ?? 0 });
  }

  studentAnnualAverages.sort((a, b) => b.avg - a.avg);
  const rank = studentAnnualAverages.findIndex((s) => s.id === studentId) + 1;

  const attendance = await getAttendanceSummary(schoolId, studentId);

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      studentId: student.studentId,
      classId: student.classId,
      className: (student as any).class?.name || '',
    },
    subjects: subjectGrades,
    trimesterAverages: { term1: term1Avg, term2: term2Avg, term3: term3Avg },
    annualAverage,
    rank: rank > 0 ? rank : null,
    totalStudents: allStudents.length,
    attendance,
  };
}
