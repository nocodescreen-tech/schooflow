import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { School, Student, Subject, Grade, Attendance, Class } from '../models/index.js';
import { getStudentReportData, StudentReportData } from './grades.js';

const uploadsDir = path.resolve(process.cwd(), 'uploads');

/**
 * Generate a Congolese report card PDF for a student
 */
export async function generateReportCardPdf(
  schoolId: string,
  studentId: string,
  academicYear?: string
): Promise<Buffer> {
  // Fetch school info
  const school = await School.findByPk(schoolId);
  if (!school) throw new Error('School not found');

  // Fetch student report data
  const reportData = await getStudentReportData(schoolId, studentId, academicYear);
  if (!reportData) throw new Error('Student not found or not assigned to a class');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Header Section ---
    const pageWidth = doc.page.width;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    // School logo (if exists)
    let headerY = margin;
    if (school.logo) {
      const logoPath = path.resolve(process.cwd(), school.logo.replace(/^\//, ''));
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, margin, headerY, { fit: [60, 60] });
        } catch {
          // Skip logo if it can't be loaded
        }
      }
    }

    // School info
    const textX = school.logo ? margin + 80 : margin;
    doc.fontSize(16).font('Helvetica-Bold').text(school.name, textX, headerY, { width: contentWidth - 80 });
    doc.fontSize(10).font('Helvetica');
    if (school.address) {
      doc.text(school.address, textX, headerY + 22, { width: contentWidth - 80 });
    }
    if (school.phone) {
      doc.text(`Tél: ${school.phone}`, textX, headerY + 36, { width: contentWidth - 80 });
    }

    // Title
    headerY += 70;
    doc.fontSize(14).font('Helvetica-Bold').text('BULLETIN SCOLAIRE', margin, headerY, { width: contentWidth, align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Année Académique: ${academicYear || '2025-2026'}`, margin, headerY + 20, { width: contentWidth, align: 'center' });

    // Horizontal line
    headerY += 40;
    doc.moveTo(margin, headerY).lineTo(pageWidth - margin, headerY).stroke();

    // --- Student Info Section ---
    headerY += 15;
    doc.fontSize(11).font('Helvetica-Bold').text('Informations de l\'élève', margin, headerY);
    headerY += 20;

    const infoData = [
      ['Nom complet:', `${reportData.student.lastName} ${reportData.student.firstName}`],
      ['Matricule:', reportData.student.studentId],
      ['Classe:', reportData.student.className],
    ];

    doc.fontSize(10).font('Helvetica');
    for (const [label, value] of infoData) {
      doc.font('Helvetica-Bold').text(label, margin, headerY, { width: 120 });
      doc.font('Helvetica').text(value, margin + 130, headerY, { width: contentWidth - 130 });
      headerY += 16;
    }

    // --- Grades Table ---
    headerY += 15;
    doc.moveTo(margin, headerY).lineTo(pageWidth - margin, headerY).stroke();
    headerY += 15;

    doc.fontSize(11).font('Helvetica-Bold').text('Résultats par matière', margin, headerY);
    headerY += 20;

    // Table header
    const colWidths = [30, 180, 50, 55, 55, 55, 65]; // #, Subject, Coef, T1, T2, T3, Annual
    const colX: number[] = [margin];
    for (let i = 0; i < colWidths.length - 1; i++) {
      colX.push(colX[i] + colWidths[i]);
    }

    const drawTableHeader = (y: number) => {
      doc.font('Helvetica-Bold').fontSize(9);
      const headers = ['#', 'Matière', 'Coef', 'T1', 'T2', 'T3', 'Moyenne'];
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], colX[i] + 2, y, { width: colWidths[i] - 4 });
      }
      doc.rect(margin, y - 2, contentWidth, 16).stroke();
    };

    drawTableHeader(headerY);
    headerY += 18;

    // Table rows
    doc.font('Helvetica').fontSize(9);
    reportData.subjects.forEach((subject, index) => {
      if (headerY > doc.page.height - 150) {
        doc.addPage();
        headerY = margin;
        drawTableHeader(headerY);
        headerY += 18;
      }

      const rowY = headerY;
      const values = [
        String(index + 1),
        subject.subjectName,
        String(subject.coefficient),
        subject.term1 !== null ? subject.term1.toFixed(2) : '-',
        subject.term2 !== null ? subject.term2.toFixed(2) : '-',
        subject.term3 !== null ? subject.term3.toFixed(2) : '-',
        subject.annualAverage !== null ? subject.annualAverage.toFixed(2) : '-',
      ];

      for (let i = 0; i < values.length; i++) {
        doc.text(values[i], colX[i] + 2, rowY, { width: colWidths[i] - 4 });
      }

      doc.rect(margin, rowY - 2, contentWidth, 14).stroke();
      headerY += 14;
    });

    // --- Summary Section ---
    headerY += 15;
    if (headerY > doc.page.height - 200) {
      doc.addPage();
      headerY = margin;
    }

    doc.moveTo(margin, headerY).lineTo(pageWidth - margin, headerY).stroke();
    headerY += 15;

    doc.fontSize(11).font('Helvetica-Bold').text('Résumé', margin, headerY);
    headerY += 20;

    const summaryData = [
      ['Moyenne T1:', reportData.trimesterAverages.term1 !== null ? reportData.trimesterAverages.term1.toFixed(2) : '-'],
      ['Moyenne T2:', reportData.trimesterAverages.term2 !== null ? reportData.trimesterAverages.term2.toFixed(2) : '-'],
      ['Moyenne T3:', reportData.trimesterAverages.term3 !== null ? reportData.trimesterAverages.term3.toFixed(2) : '-'],
      ['Moyenne Annuelle:', reportData.annualAverage !== null ? reportData.annualAverage.toFixed(2) : '-'],
      ['Rang:', reportData.rank ? `${reportData.rank} / ${reportData.totalStudents}` : '-'],
    ];

    doc.fontSize(10).font('Helvetica');
    for (const [label, value] of summaryData) {
      doc.font('Helvetica-Bold').text(label, margin, headerY, { width: 120 });
      doc.font('Helvetica').text(value, margin + 130, headerY, { width: contentWidth - 130 });
      headerY += 16;
    }

    // --- Attendance Section ---
    headerY += 10;
    if (headerY > doc.page.height - 180) {
      doc.addPage();
      headerY = margin;
    }

    doc.moveTo(margin, headerY).lineTo(pageWidth - margin, headerY).stroke();
    headerY += 15;

    doc.fontSize(11).font('Helvetica-Bold').text('Assiduité', margin, headerY);
    headerY += 20;

    const att = reportData.attendance;
    const attendanceData = [
      ['Présences:', String(att.present)],
      ['Absences:', String(att.absent)],
      ['Retards:', String(att.late)],
      ['Excusées:', String(att.excused)],
      ['Taux de présence:', att.rate !== null ? `${att.rate.toFixed(1)}%` : '-'],
    ];

    doc.fontSize(10).font('Helvetica');
    for (const [label, value] of attendanceData) {
      doc.font('Helvetica-Bold').text(label, margin, headerY, { width: 120 });
      doc.font('Helvetica').text(value, margin + 130, headerY, { width: contentWidth - 130 });
      headerY += 16;
    }

    // --- Comments Section ---
    headerY += 10;
    if (headerY > doc.page.height - 150) {
      doc.addPage();
      headerY = margin;
    }

    doc.moveTo(margin, headerY).lineTo(pageWidth - margin, headerY).stroke();
    headerY += 15;

    doc.fontSize(11).font('Helvetica-Bold').text('Appréciations de l\'enseignant', margin, headerY);
    headerY += 20;

    doc.fontSize(10).font('Helvetica');
    const comment = 'Travail sérieux et continu. L\'élève fait preuve d\'un bon esprit de participation et de respect des règles. Continuez ainsi.';
    doc.text(comment, margin, headerY, { width: contentWidth, align: 'justify' });
    headerY += 40;

    // --- Signature Section ---
    headerY += 20;
    if (headerY > doc.page.height - 120) {
      doc.addPage();
      headerY = margin;
    }

    doc.moveTo(margin, headerY).lineTo(pageWidth - margin, headerY).stroke();
    headerY += 15;

    const sigY = headerY + 40;
    doc.fontSize(10).font('Helvetica');

    // Teacher signature
    doc.text('L\'enseignant(e)', margin, sigY, { width: 150 });
    doc.moveTo(margin, sigY + 50).lineTo(margin + 150, sigY + 50).stroke();

    // Principal signature
    const principalX = pageWidth - margin - 150;
    doc.text('Le Directeur/Directrice', principalX, sigY, { width: 150 });
    doc.moveTo(principalX, sigY + 50).lineTo(principalX + 150, sigY + 50).stroke();

    // Date
    const dateStr = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Fait à ${school.address || ''}, le ${dateStr}`, margin, sigY + 70, { width: contentWidth, align: 'center' });

    // Footer
    doc.fontSize(8).font('Helvetica').text(
      'Ce bulletin est un document officiel. Toute falsification ou modification entraîne des poursuites disciplinaires.',
      margin,
      doc.page.height - 40,
      { width: contentWidth, align: 'center' }
    );

    doc.end();
  });
}
