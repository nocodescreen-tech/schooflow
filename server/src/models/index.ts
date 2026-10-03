import School from './School.js';
import User from './User.js';
import Student from './Student.js';
import Class from './Class.js';
import Subject from './Subject.js';
import Grade from './Grade.js';
import Attendance from './Attendance.js';
import Fee from './Fee.js';
import Payment from './Payment.js';
import ReportCard from './ReportCard.js';
import Notification from './Notification.js';
import AuditLog from './AuditLog.js';
import VacationTicket from './VacationTicket.js';
import OTPCode from './OTPCode.js';
import Timetable from './Timetable.js';
import CashTransaction from './CashTransaction.js';
import Document from './Document.js';
import DocumentTemplate from './DocumentTemplate.js';
import GeneratedDocument from './GeneratedDocument.js';
import Announcement from './Announcement.js';
import Message from './Message.js';
import Permission from './Permission.js';
import Role from './Role.js';
import RolePermission from './RolePermission.js';
import UserRole from './UserRole.js';
import UserScope from './UserScope.js';
import RefreshToken from './RefreshToken.js';
import Parent from './Parent.js';
import StudentParent from './StudentParent.js';
import AcademicYear from './AcademicYear.js';
import Incident from './Incident.js';
import Sanction from './Sanction.js';
import Convocation from './Convocation.js';
import CalendarEvent from './CalendarEvent.js';
import Cycle from './Cycle.js';
import Filiere from './Filiere.js';
import Section from './Section.js';
import Option from './Option.js';
import Niveau from './Niveau.js';
import SchoolModule from './SchoolModule.js';
import UserPermissionOverride from './UserPermissionOverride.js';
import Delegation from './Delegation.js';
import Assignment from './Assignment.js';
import PasswordResetToken from './PasswordResetToken.js';
import ActivationCode from './ActivationCode.js';
import EvaluationPeriod from './EvaluationPeriod.js';
import Assessment from './Assessment.js';
import GradingConfig from './GradingConfig.js';
import PromotionDecision from './PromotionDecision.js';
import ExchangeRate from './ExchangeRate.js';
import Enrollment from './Enrollment.js';
import SchoolIdentity from './SchoolIdentity.js';
import DocumentSequence from './DocumentSequence.js';
import OtpChallenge from './OtpChallenge.js';

// Associations
School.hasMany(User, { foreignKey: 'schoolId', as: 'users' });
User.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Student, { foreignKey: 'schoolId', as: 'students' });
Student.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Class, { foreignKey: 'schoolId', as: 'classes' });
Class.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Subject, { foreignKey: 'schoolId', as: 'subjects' });
Subject.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Grade, { foreignKey: 'schoolId', as: 'grades' });
Grade.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Attendance, { foreignKey: 'schoolId', as: 'attendance' });
Attendance.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Fee, { foreignKey: 'schoolId', as: 'fees' });
Fee.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Payment, { foreignKey: 'schoolId', as: 'payments' });
Payment.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(ReportCard, { foreignKey: 'schoolId', as: 'reportCards' });
ReportCard.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Notification, { foreignKey: 'schoolId', as: 'notifications' });
Notification.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(AuditLog, { foreignKey: 'schoolId', as: 'auditLogs' });
AuditLog.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(VacationTicket, { foreignKey: 'schoolId', as: 'vacationTickets' });
VacationTicket.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

// Class relationships
Class.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
User.hasMany(Class, { foreignKey: 'teacherId', as: 'classes' });

Class.hasMany(Subject, { foreignKey: 'classId', as: 'subjects' });
Subject.belongsTo(Class, { foreignKey: 'classId', as: 'class' });

Class.hasMany(Student, { foreignKey: 'classId', as: 'students' });
Student.belongsTo(Class, { foreignKey: 'classId', as: 'class' });

Class.hasMany(Attendance, { foreignKey: 'classId', as: 'attendance' });
Attendance.belongsTo(Class, { foreignKey: 'classId', as: 'class' });

// Student relationships
Student.hasMany(Grade, { foreignKey: 'studentId', as: 'grades' });
Grade.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

Student.hasMany(Attendance, { foreignKey: 'studentId', as: 'attendance' });
Attendance.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

Student.hasMany(Fee, { foreignKey: 'studentId', as: 'fees' });
Fee.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

Student.hasMany(Payment, { foreignKey: 'studentId', as: 'payments' });
Payment.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

Student.hasMany(ReportCard, { foreignKey: 'studentId', as: 'reportCards' });
ReportCard.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

Student.hasMany(VacationTicket, { foreignKey: 'studentId', as: 'vacationTickets' });
VacationTicket.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

// Subject relationships
Subject.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
User.hasMany(Subject, { foreignKey: 'teacherId', as: 'subjects' });

Subject.hasMany(Grade, { foreignKey: 'subjectId', as: 'grades' });
Grade.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

// Fee-Payment relationships
Fee.hasMany(Payment, { foreignKey: 'feeId', as: 'payments' });
Payment.belongsTo(Fee, { foreignKey: 'feeId', as: 'fee' });

// User relationships
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Payment, { foreignKey: 'receivedById', as: 'receivedPayments' });
Payment.belongsTo(User, { foreignKey: 'receivedById', as: 'receivedBy' });

User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(OTPCode, { foreignKey: 'userId', as: 'otpCodes' });
OTPCode.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Timetable relationships
School.hasMany(Timetable, { foreignKey: 'schoolId', as: 'timetables' });
Timetable.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

Class.hasMany(Timetable, { foreignKey: 'classId', as: 'timetables' });
Timetable.belongsTo(Class, { foreignKey: 'classId', as: 'class' });

Subject.hasMany(Timetable, { foreignKey: 'subjectId', as: 'timetables' });
Timetable.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

User.hasMany(Timetable, { foreignKey: 'teacherId', as: 'timetables' });
Timetable.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });

// CashTransaction relationships
School.hasMany(CashTransaction, { foreignKey: 'schoolId', as: 'cashTransactions' });
CashTransaction.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

User.hasMany(CashTransaction, { foreignKey: 'recordedById', as: 'recordedCashTransactions' });
CashTransaction.belongsTo(User, { foreignKey: 'recordedById', as: 'recordedBy' });

// Document relationships
School.hasMany(Document, { foreignKey: 'schoolId', as: 'documents' });
Document.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

User.hasMany(Document, { foreignKey: 'uploadedById', as: 'uploadedDocuments' });
Document.belongsTo(User, { foreignKey: 'uploadedById', as: 'uploadedBy' });

Student.hasMany(Document, { foreignKey: 'studentId', as: 'documents' });
Document.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

// Document-Teplante relationship
Document.belongsTo(DocumentTemplate, { foreignKey: 'templateId', as: 'template' });
DocumentTemplate.hasMany(Document, { foreignKey: 'templateId', as: 'documents' });

// DocumentTemplate relationships
School.hasMany(DocumentTemplate, { foreignKey: 'schoolId', as: 'documentTemplates' });
DocumentTemplate.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

User.hasMany(DocumentTemplate, { foreignKey: 'creatorId', as: 'createdDocumentTemplates' });
DocumentTemplate.belongsTo(User, { foreignKey: 'creatorId', as: 'creator' });

// GeneratedDocument relationships
School.hasMany(GeneratedDocument, { foreignKey: 'schoolId', as: 'generatedDocuments' });
GeneratedDocument.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
AcademicYear.hasMany(GeneratedDocument, { foreignKey: 'academicYearId', as: 'generatedDocuments' });
GeneratedDocument.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' });
User.hasMany(GeneratedDocument, { foreignKey: 'issuedBy', as: 'documentsIssued' });
GeneratedDocument.belongsTo(User, { foreignKey: 'issuedBy', as: 'issuedByUser' });

DocumentTemplate.hasMany(GeneratedDocument, { foreignKey: 'templateId', as: 'generatedDocuments' });
GeneratedDocument.belongsTo(DocumentTemplate, { foreignKey: 'templateId', as: 'template' });

Student.hasMany(GeneratedDocument, { foreignKey: 'studentId', as: 'generatedDocuments' });
GeneratedDocument.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

// Announcement relationships
School.hasMany(Announcement, { foreignKey: 'schoolId', as: 'announcements' });
Announcement.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

User.hasMany(Announcement, { foreignKey: 'authorId', as: 'authoredAnnouncements' });
Announcement.belongsTo(User, { foreignKey: 'authorId', as: 'author' });

Class.hasMany(Announcement, { foreignKey: 'classId', as: 'announcements' });
Announcement.belongsTo(Class, { foreignKey: 'classId', as: 'class' });

// Message relationships
School.hasMany(Message, { foreignKey: 'schoolId', as: 'messages' });
Message.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });

User.hasMany(Message, { foreignKey: 'recipientId', as: 'receivedMessages' });
Message.belongsTo(User, { foreignKey: 'recipientId', as: 'recipient' });

// RBAC relationships
User.hasMany(UserScope, { foreignKey: 'userId', as: 'scopes' });
UserScope.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Role.hasMany(RolePermission, { foreignKey: 'roleId', as: 'rolePermissions' });
RolePermission.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

Permission.hasMany(RolePermission, { foreignKey: 'permissionId', as: 'rolePermissions' });
RolePermission.belongsTo(Permission, { foreignKey: 'permissionId', as: 'permission' });

User.belongsToMany(Role, { through: UserRole, foreignKey: 'userId', otherKey: 'roleId', as: 'customRoles' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'roleId', otherKey: 'userId', as: 'users' });

UserRole.belongsTo(User, { foreignKey: 'userId', as: 'user' });
UserRole.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

// Refresh tokens
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Parents junction
School.hasMany(Parent, { foreignKey: 'schoolId', as: 'parents' });
Parent.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

Student.belongsToMany(Parent, { through: StudentParent, foreignKey: 'studentId', otherKey: 'parentId', as: 'parents' });
Parent.belongsToMany(Student, { through: StudentParent, foreignKey: 'parentId', otherKey: 'studentId', as: 'children' });
StudentParent.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
StudentParent.belongsTo(Parent, { foreignKey: 'parentId', as: 'parent' });
Student.hasMany(StudentParent, { foreignKey: 'studentId', as: 'parentLinks' });
Parent.hasMany(StudentParent, { foreignKey: 'parentId', as: 'studentLinks' });

// Account <-> profile links (one account per person)
User.hasOne(Student, { foreignKey: 'userId', as: 'studentProfile' });
Student.belongsTo(User, { foreignKey: 'userId', as: 'userAccount' });
User.hasOne(Parent, { foreignKey: 'userId', as: 'parentProfile' });
Parent.belongsTo(User, { foreignKey: 'userId', as: 'userAccount' });

// Academic years
School.hasMany(AcademicYear, { foreignKey: 'schoolId', as: 'academicYears' });
AcademicYear.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

// Discipline
School.hasMany(Incident, { foreignKey: 'schoolId', as: 'incidents' });
Incident.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
Student.hasMany(Incident, { foreignKey: 'studentId', as: 'incidents' });
Incident.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
User.hasMany(Incident, { foreignKey: 'reportedById', as: 'reportedIncidents' });
Incident.belongsTo(User, { foreignKey: 'reportedById', as: 'reportedBy' });
Incident.hasMany(Sanction, { foreignKey: 'incidentId', as: 'sanctions' });
Sanction.belongsTo(Incident, { foreignKey: 'incidentId', as: 'incident' });
User.hasMany(Sanction, { foreignKey: 'decidedById', as: 'decidedSanctions' });
Sanction.belongsTo(User, { foreignKey: 'decidedById', as: 'decidedBy' });
School.hasMany(Convocation, { foreignKey: 'schoolId', as: 'convocations' });
Convocation.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
Student.hasMany(Convocation, { foreignKey: 'studentId', as: 'convocations' });
Convocation.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Parent.hasMany(Convocation, { foreignKey: 'parentId', as: 'convocations' });
Convocation.belongsTo(Parent, { foreignKey: 'parentId', as: 'parent' });

// Calendar
School.hasMany(CalendarEvent, { foreignKey: 'schoolId', as: 'calendarEvents' });
CalendarEvent.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

// Academic structure
School.hasMany(Cycle, { foreignKey: 'schoolId', as: 'cycles' });
Cycle.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Filiere, { foreignKey: 'schoolId', as: 'filieres' });
Filiere.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Section, { foreignKey: 'schoolId', as: 'sections' });
Section.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Option, { foreignKey: 'schoolId', as: 'options' });
Option.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(Niveau, { foreignKey: 'schoolId', as: 'niveaux' });
Niveau.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

Cycle.hasMany(Filiere, { foreignKey: 'cycleId', as: 'filieres' });
Filiere.belongsTo(Cycle, { foreignKey: 'cycleId', as: 'cycle' });

Cycle.hasMany(Niveau, { foreignKey: 'cycleId', as: 'niveaux' });
Niveau.belongsTo(Cycle, { foreignKey: 'cycleId', as: 'cycle' });

Filiere.hasMany(Section, { foreignKey: 'filiereId', as: 'sections' });
Section.belongsTo(Filiere, { foreignKey: 'filiereId', as: 'filiere' });

Section.hasMany(Option, { foreignKey: 'sectionId', as: 'options' });
Option.belongsTo(Section, { foreignKey: 'sectionId', as: 'section' });

Cycle.hasMany(Class, { foreignKey: 'cycleId', as: 'cycleClasses' });
Class.belongsTo(Cycle, { foreignKey: 'cycleId', as: 'cycle' });

Filiere.hasMany(Class, { foreignKey: 'filiereId', as: 'filiereClasses' });
Class.belongsTo(Filiere, { foreignKey: 'filiereId', as: 'filiere' });

Section.hasMany(Class, { foreignKey: 'sectionId', as: 'sectionRef' });
Class.belongsTo(Section, { foreignKey: 'sectionId', as: 'sectionRef' });

Option.hasMany(Class, { foreignKey: 'optionId', as: 'optionClasses' });
Class.belongsTo(Option, { foreignKey: 'optionId', as: 'optionRef' });

Niveau.hasMany(Class, { foreignKey: 'niveauId', as: 'niveauClasses' });
Class.belongsTo(Niveau, { foreignKey: 'niveauId', as: 'niveau' });

// School modules
School.hasMany(SchoolModule, { foreignKey: 'schoolId', as: 'modules' });
SchoolModule.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
User.hasMany(SchoolModule, { foreignKey: 'enabledById', as: 'enabledModules' });
SchoolModule.belongsTo(User, { foreignKey: 'enabledById', as: 'enabledBy' });

// Central authorization architecture
User.hasMany(UserPermissionOverride, { foreignKey: 'userId', as: 'permissionOverrides' });
UserPermissionOverride.belongsTo(User, { foreignKey: 'userId', as: 'user' });
UserPermissionOverride.belongsTo(User, { foreignKey: 'authorizedBy', as: 'grantedBy' });

User.hasMany(Assignment, { foreignKey: 'userId', as: 'assignments' });
Assignment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Assignment.belongsTo(User, { foreignKey: 'assignedBy', as: 'assignedByUser' });
Assignment.belongsTo(Class, { foreignKey: 'classId', as: 'class' });
Assignment.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
School.hasMany(Assignment, { foreignKey: 'schoolId', as: 'assignments' });
Assignment.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

Delegation.belongsTo(User, { foreignKey: 'fromUserId', as: 'delegationSource' });
Delegation.belongsTo(User, { foreignKey: 'toUserId', as: 'delegationTarget' });
User.hasMany(Delegation, { foreignKey: 'fromUserId', as: 'delegationsGiven' });
User.hasMany(Delegation, { foreignKey: 'toUserId', as: 'delegationsReceived' });
School.hasMany(Delegation, { foreignKey: 'schoolId', as: 'delegations' });
Delegation.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

User.hasMany(PasswordResetToken, { foreignKey: 'userId', as: 'resetTokens' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

School.hasMany(ActivationCode, { foreignKey: 'schoolId', as: 'activationCodes' });
ActivationCode.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
ActivationCode.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

// Admissions & inscriptions
School.hasMany(Enrollment, { foreignKey: 'schoolId', as: 'enrollments' });
Enrollment.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
AcademicYear.hasMany(Enrollment, { foreignKey: 'academicYearId', as: 'enrollments' });
Enrollment.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' });
Class.hasMany(Enrollment, { foreignKey: 'requestedClassId', as: 'enrollmentRequests' });
Enrollment.belongsTo(Class, { foreignKey: 'requestedClassId', as: 'requestedClass' });
Student.hasMany(Enrollment, { foreignKey: 'studentId', as: 'enrollments' });
Enrollment.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
User.hasMany(Enrollment, { foreignKey: 'createdBy', as: 'enrollmentsCreated' });
Enrollment.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
User.hasMany(Enrollment, { foreignKey: 'decidedBy', as: 'enrollmentsDecided' });
Enrollment.belongsTo(User, { foreignKey: 'decidedBy', as: 'decidedByUser' });

// Document identity & official numbering
// The identity is 1:1 with a school and never shared: multi-school safety (§25).
School.hasOne(SchoolIdentity, { foreignKey: 'schoolId', as: 'identity' });
SchoolIdentity.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

School.hasMany(OtpChallenge, { foreignKey: 'schoolId', as: 'otpChallenges' });
OtpChallenge.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
User.hasMany(OtpChallenge, { foreignKey: 'userId', as: 'otpChallenges' });
OtpChallenge.belongsTo(User, { foreignKey: 'userId', as: 'user' });

School.hasMany(DocumentSequence, { foreignKey: 'schoolId', as: 'documentSequences' });
DocumentSequence.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
AcademicYear.hasMany(DocumentSequence, { foreignKey: 'academicYearId', as: 'documentSequences' });
DocumentSequence.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' });

// Academic Engine
School.hasMany(EvaluationPeriod, { foreignKey: 'schoolId', as: 'evaluationPeriods' });
EvaluationPeriod.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
AcademicYear.hasMany(EvaluationPeriod, { foreignKey: 'academicYearId', as: 'periods' });
EvaluationPeriod.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' });

School.hasMany(Assessment, { foreignKey: 'schoolId', as: 'assessments' });
Assessment.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
Subject.hasMany(Assessment, { foreignKey: 'subjectId', as: 'assessments' });
Assessment.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
Class.hasMany(Assessment, { foreignKey: 'classId', as: 'assessments' });
Assessment.belongsTo(Class, { foreignKey: 'classId', as: 'class' });
AcademicYear.hasMany(Assessment, { foreignKey: 'academicYearId', as: 'assessments' });
Assessment.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' });
EvaluationPeriod.hasMany(Assessment, { foreignKey: 'periodId', as: 'assessments' });
Assessment.belongsTo(EvaluationPeriod, { foreignKey: 'periodId', as: 'period' });
User.hasMany(Assessment, { foreignKey: 'teacherId', as: 'authoredAssessments' });
Assessment.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });

Grade.belongsTo(Assessment, { foreignKey: 'assessmentId', as: 'assessment' });
Assessment.hasMany(Grade, { foreignKey: 'assessmentId', as: 'grades' });
Grade.belongsTo(EvaluationPeriod, { foreignKey: 'periodId', as: 'period' });
EvaluationPeriod.hasMany(Grade, { foreignKey: 'periodId', as: 'grades' });
Grade.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYearRef' });
AcademicYear.hasMany(Grade, { foreignKey: 'academicYearId', as: 'grades' });

School.hasMany(GradingConfig, { foreignKey: 'schoolId', as: 'gradingConfigs' });
GradingConfig.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
Cycle.hasMany(GradingConfig, { foreignKey: 'cycleId', as: 'gradingConfigs' });
GradingConfig.belongsTo(Cycle, { foreignKey: 'cycleId', as: 'cycle' });
Niveau.hasMany(GradingConfig, { foreignKey: 'niveauId', as: 'gradingConfigs' });
GradingConfig.belongsTo(Niveau, { foreignKey: 'niveauId', as: 'niveau' });

// Promotion / deliberation
School.hasMany(PromotionDecision, { foreignKey: 'schoolId', as: 'promotionDecisions' });
PromotionDecision.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
Student.hasMany(PromotionDecision, { foreignKey: 'studentId', as: 'promotionDecisions' });
PromotionDecision.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
AcademicYear.hasMany(PromotionDecision, { foreignKey: 'academicYearId', as: 'promotionDecisions' });
PromotionDecision.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' });
Class.hasMany(PromotionDecision, { foreignKey: 'fromClassId', as: 'leavingStudents' });
Class.hasMany(PromotionDecision, { foreignKey: 'toClassId', as: 'arrivingStudents' });
PromotionDecision.belongsTo(Class, { foreignKey: 'fromClassId', as: 'fromClass' });
PromotionDecision.belongsTo(Class, { foreignKey: 'toClassId', as: 'toClass' });
PromotionDecision.belongsTo(User, { foreignKey: 'decidedBy', as: 'decidedByUser' });
PromotionDecision.belongsTo(User, { foreignKey: 'appliedBy', as: 'appliedByUser' });

// Multi-currency
School.hasMany(ExchangeRate, { foreignKey: 'schoolId', as: 'exchangeRates' });
ExchangeRate.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });
ExchangeRate.belongsTo(User, { foreignKey: 'setBy', as: 'setByUser' });
Payment.belongsTo(ExchangeRate, { foreignKey: 'rateId', as: 'rateRecord' });

export {
  School,
  User,
  Student,
  Class,
  Subject,
  Grade,
  Attendance,
  Fee,
  Payment,
  ReportCard,
  Notification,
  AuditLog,
  VacationTicket,
  OTPCode,
  Timetable,
  CashTransaction,
  Document,
  DocumentTemplate,
  GeneratedDocument,
  Announcement,
  Message,
  Permission,
  Role,
  RolePermission,
  UserRole,
  UserScope,
  RefreshToken,
  Parent,
  StudentParent,
  AcademicYear,
  Incident,
  Sanction,
  Convocation,
  CalendarEvent,
  Cycle,
  Filiere,
  Section,
  Option,
  Niveau,
  SchoolModule,
  UserPermissionOverride,
  Delegation,
  Assignment,
  PasswordResetToken,
  ActivationCode,
  EvaluationPeriod,
  Assessment,
  GradingConfig,
  PromotionDecision,
  ExchangeRate,
  Enrollment,
  SchoolIdentity,
  DocumentSequence,
  OtpChallenge,
};

export { OTP_PURPOSES } from './OtpChallenge.js';
export type { OtpPurpose, OtpStatus } from './OtpChallenge.js';