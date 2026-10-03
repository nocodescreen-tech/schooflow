import sequelize from '../config/database.js';
import { Parent, Student, StudentParent } from '../models/index.js';
import { Op } from 'sequelize';

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync();

  const students = await Student.findAll({ order: [['createdAt', 'ASC']] });
  let studentsProcessed = 0;
  let parentsCreated = 0;
  let linksCreated = 0;
  let skipped = 0;

  for (const s of students) {
    const email = (s.parentEmail || '').trim() || null;
    const phone = (s.parentPhone || '').trim() || null;
    const name = (s.parentName || '').trim();
    if (!email && !phone && !name) {
      skipped += 1;
      continue;
    }
    studentsProcessed += 1;

    let parent: Parent | null = null;
    if (email || phone) {
      const orConds: Record<string, unknown>[] = [];
      if (email) orConds.push({ email });
      if (phone) orConds.push({ phone });
      parent = await Parent.findOne({ where: { schoolId: s.schoolId, [Op.or]: orConds } });
    }
    if (!parent) {
      const { firstName, lastName } = splitName(name || email || phone || 'Parent');
      parent = await Parent.create({
        schoolId: s.schoolId,
        firstName: firstName || 'Parent',
        lastName: lastName || '',
        phone,
        email,
      });
      parentsCreated += 1;
    }
    const [, created] = await StudentParent.findOrCreate({
      where: { studentId: s.id, parentId: parent.id },
      defaults: { studentId: s.id, parentId: parent.id, relation: 'parent', isPrimaryContact: true, emergencyContact: false },
    });
    if (created) {
      linksCreated += 1;
    } else {
      const link = await StudentParent.findOne({ where: { studentId: s.id, parentId: parent.id } });
      if (link && !link.isPrimaryContact) await link.update({ isPrimaryContact: true });
    }
  }

  console.log(JSON.stringify({ studentsProcessed, parentsCreated, linksCreated, skipped }));
  await sequelize.close();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
