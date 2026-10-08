import { relations } from 'drizzle-orm';
import { attendanceDevice, attendanceRecord, content, contentProgress, course, courseModule, diaryEntry, exam, examGroup, examSchedule, gradeScale, homework, homeworkSubmission, leaveRequest, lesson, liveAttendance, liveSession, markEntry, onlineTest, onlineTestAttempt, question, questionBank, reportCardTemplate, result, topic } from './academics_ops';
import { appFlavour, breakGlassRequest, companyExpense, featureFlag, invoice, invoiceLine, plan, platformLead, platformPayment, platformUser, priceBookItem, subscription, subscriptionItem, supportTicket, tenant, tenantDomain, tenantModule, usageRecord, wallet, walletTxn } from './base';
import { abuseReport, aiRequest, batch, batchStudent, call, campaign, contactHash, conversation, conversationMember, coupon, creditResult, dpdpRequest, formSubmission, lead, leadActivity, mediaBlob, messageReceipt, messengerDevice, messengerEnvelope, messengerPrekey, order, pendingInvite, pipeline, pipelineStage, placementDrive, programme, siteForm, siteMenu, sitePage, sitePost, siteRedirect, userBlock, waAccount, waConversation, waFlow, waMessage, waTemplate } from './engage';
import { feeDiscount, feeHead, feeStructure, feeStructureItem, incomeExpense, journalEntry, journalLine, leaveBalance, leaveType, ledgerAccount, numberSeries, paymentIntent, payrollRun, payslip, receipt, receiptLine, salaryStructure, studentFee } from './finance_hr';
import { auditLog, commRoutingRule, consentRecord, file, membership, messageDelivery, notice, notification, notificationTemplate, outboxEvent, pushToken, role, roleAssignment, session, user } from './identity';
import { academicSession, branch, calendarEvent, schoolClass, classSubject, customFieldDef, department, designation, document, enrollment, guardian, period, section, staff, student, studentGuardian, subject, substitution, timetableSlot } from './people_academics';
import { alumni, book, bookCopy, bookIssue, callLog, canteenTxn, certificateTemplate, complaint, enquiry, healthRecord, hostel, hostelAllocation, hostelRoom, incident, infirmaryVisit, inventoryItem, issuedCertificate, locationPing, outpass, postalRecord, route, stockMove, stop, studentTransport, studentWallet, supplier, trackingLink, trip, tripEvent, vehicle, visitor } from './transport_ops';

export const homeworkRelations = relations(homework, ({ one, many }) => ({
  submissions: many(homeworkSubmission),
}));

export const homeworkSubmissionRelations = relations(homeworkSubmission, ({ one, many }) => ({
  homework: one(homework, { fields: [homeworkSubmission.homeworkId], references: [homework.id] }),
}));

export const lessonRelations = relations(lesson, ({ one, many }) => ({
  topics: many(topic),
}));

export const topicRelations = relations(topic, ({ one, many }) => ({
  lesson: one(lesson, { fields: [topic.lessonId], references: [lesson.id] }),
}));

export const examGroupRelations = relations(examGroup, ({ one, many }) => ({
  exams: many(exam),
}));

export const examRelations = relations(exam, ({ one, many }) => ({
  group: one(examGroup, { fields: [exam.groupId], references: [examGroup.id] }),
  schedules: many(examSchedule),
}));

export const examScheduleRelations = relations(examSchedule, ({ one, many }) => ({
  exam: one(exam, { fields: [examSchedule.examId], references: [exam.id] }),
  marks: many(markEntry),
}));

export const markEntryRelations = relations(markEntry, ({ one, many }) => ({
  schedule: one(examSchedule, { fields: [markEntry.scheduleId], references: [examSchedule.id] }),
}));

export const questionBankRelations = relations(questionBank, ({ one, many }) => ({
  questions: many(question),
}));

export const questionRelations = relations(question, ({ one, many }) => ({
  bank: one(questionBank, { fields: [question.bankId], references: [questionBank.id] }),
}));

export const onlineTestRelations = relations(onlineTest, ({ one, many }) => ({
  attempts: many(onlineTestAttempt),
}));

export const onlineTestAttemptRelations = relations(onlineTestAttempt, ({ one, many }) => ({
  test: one(onlineTest, { fields: [onlineTestAttempt.testId], references: [onlineTest.id] }),
}));

export const courseRelations = relations(course, ({ one, many }) => ({
  modules: many(courseModule),
}));

export const courseModuleRelations = relations(courseModule, ({ one, many }) => ({
  course: one(course, { fields: [courseModule.courseId], references: [course.id] }),
  contents: many(content),
}));

export const contentRelations = relations(content, ({ one, many }) => ({
  module: one(courseModule, { fields: [content.moduleId], references: [courseModule.id] }),
}));

export const tenantRelations = relations(tenant, ({ one, many }) => ({
  domains: many(tenantDomain),
  modules: many(tenantModule),
  subscriptions: many(subscription),
  invoices: many(invoice),
  wallet: one(wallet),
}));

export const tenantDomainRelations = relations(tenantDomain, ({ one, many }) => ({
  tenant: one(tenant, { fields: [tenantDomain.tenantId], references: [tenant.id] }),
}));

export const tenantModuleRelations = relations(tenantModule, ({ one, many }) => ({
  tenant: one(tenant, { fields: [tenantModule.tenantId], references: [tenant.id] }),
}));

export const subscriptionRelations = relations(subscription, ({ one, many }) => ({
  tenant: one(tenant, { fields: [subscription.tenantId], references: [tenant.id] }),
  items: many(subscriptionItem),
}));

export const subscriptionItemRelations = relations(subscriptionItem, ({ one, many }) => ({
  subscription: one(subscription, { fields: [subscriptionItem.subscriptionId], references: [subscription.id] }),
}));

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  tenant: one(tenant, { fields: [invoice.tenantId], references: [tenant.id] }),
  lines: many(invoiceLine),
  payments: many(platformPayment),
}));

export const invoiceLineRelations = relations(invoiceLine, ({ one, many }) => ({
  invoice: one(invoice, { fields: [invoiceLine.invoiceId], references: [invoice.id] }),
}));

export const platformPaymentRelations = relations(platformPayment, ({ one, many }) => ({
  invoice: one(invoice, { fields: [platformPayment.invoiceId], references: [invoice.id] }),
}));

export const walletRelations = relations(wallet, ({ one, many }) => ({
  tenant: one(tenant, { fields: [wallet.tenantId], references: [tenant.id] }),
  txns: many(walletTxn),
}));

export const walletTxnRelations = relations(walletTxn, ({ one, many }) => ({
  wallet: one(wallet, { fields: [walletTxn.walletId], references: [wallet.id] }),
}));

export const pipelineRelations = relations(pipeline, ({ one, many }) => ({
  stages: many(pipelineStage),
}));

export const pipelineStageRelations = relations(pipelineStage, ({ one, many }) => ({
  pipeline: one(pipeline, { fields: [pipelineStage.pipelineId], references: [pipeline.id] }),
}));

export const leadRelations = relations(lead, ({ one, many }) => ({
  activities: many(leadActivity),
}));

export const leadActivityRelations = relations(leadActivity, ({ one, many }) => ({
  lead: one(lead, { fields: [leadActivity.leadId], references: [lead.id] }),
}));

export const waConversationRelations = relations(waConversation, ({ one, many }) => ({
  messages: many(waMessage),
}));

export const waMessageRelations = relations(waMessage, ({ one, many }) => ({
  conversation: one(waConversation, { fields: [waMessage.conversationId], references: [waConversation.id] }),
}));

export const messengerDeviceRelations = relations(messengerDevice, ({ one, many }) => ({
  prekeys: many(messengerPrekey),
}));

export const messengerPrekeyRelations = relations(messengerPrekey, ({ one, many }) => ({
  device: one(messengerDevice, { fields: [messengerPrekey.deviceRef], references: [messengerDevice.id] }),
}));

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  members: many(conversationMember),
}));

export const conversationMemberRelations = relations(conversationMember, ({ one, many }) => ({
  conversation: one(conversation, { fields: [conversationMember.conversationId], references: [conversation.id] }),
}));

export const batchRelations = relations(batch, ({ one, many }) => ({
  students: many(batchStudent),
}));

export const batchStudentRelations = relations(batchStudent, ({ one, many }) => ({
  batch: one(batch, { fields: [batchStudent.batchId], references: [batch.id] }),
}));

export const feeStructureRelations = relations(feeStructure, ({ one, many }) => ({
  items: many(feeStructureItem),
}));

export const feeStructureItemRelations = relations(feeStructureItem, ({ one, many }) => ({
  structure: one(feeStructure, { fields: [feeStructureItem.structureId], references: [feeStructure.id] }),
}));

export const studentFeeRelations = relations(studentFee, ({ one, many }) => ({
  student: one(student, { fields: [studentFee.studentId], references: [student.id] }),
}));

export const receiptRelations = relations(receipt, ({ one, many }) => ({
  lines: many(receiptLine),
}));

export const receiptLineRelations = relations(receiptLine, ({ one, many }) => ({
  receipt: one(receipt, { fields: [receiptLine.receiptId], references: [receipt.id] }),
}));

export const journalEntryRelations = relations(journalEntry, ({ one, many }) => ({
  lines: many(journalLine),
}));

export const journalLineRelations = relations(journalLine, ({ one, many }) => ({
  entry: one(journalEntry, { fields: [journalLine.entryId], references: [journalEntry.id] }),
}));

export const payrollRunRelations = relations(payrollRun, ({ one, many }) => ({
  payslips: many(payslip),
}));

export const payslipRelations = relations(payslip, ({ one, many }) => ({
  run: one(payrollRun, { fields: [payslip.runId], references: [payrollRun.id] }),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  memberships: many(membership),
}));

export const sessionRelations = relations(session, ({ one, many }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const membershipRelations = relations(membership, ({ one, many }) => ({
  user: one(user, { fields: [membership.userId], references: [user.id] }),
  roles: many(roleAssignment),
}));

export const roleRelations = relations(role, ({ one, many }) => ({
  assignments: many(roleAssignment),
}));

export const roleAssignmentRelations = relations(roleAssignment, ({ one, many }) => ({
  membership: one(membership, { fields: [roleAssignment.membershipId], references: [membership.id] }),
  role: one(role, { fields: [roleAssignment.roleId], references: [role.id] }),
}));

export const studentRelations = relations(student, ({ one, many }) => ({
  guardians: many(studentGuardian),
  enrollments: many(enrollment),
  transport: many(studentTransport),
  fees: many(studentFee),
}));

export const guardianRelations = relations(guardian, ({ one, many }) => ({
  students: many(studentGuardian),
}));

export const studentGuardianRelations = relations(studentGuardian, ({ one, many }) => ({
  student: one(student, { fields: [studentGuardian.studentId], references: [student.id] }),
  guardian: one(guardian, { fields: [studentGuardian.guardianId], references: [guardian.id] }),
}));

export const schoolClassRelations = relations(schoolClass, ({ one, many }) => ({
  sections: many(section),
}));

export const sectionRelations = relations(section, ({ one, many }) => ({
  class: one(schoolClass, { fields: [section.classId], references: [schoolClass.id] }),
  enrollments: many(enrollment),
}));

export const enrollmentRelations = relations(enrollment, ({ one, many }) => ({
  student: one(student, { fields: [enrollment.studentId], references: [student.id] }),
  section: one(section, { fields: [enrollment.sectionId], references: [section.id] }),
}));

export const routeRelations = relations(route, ({ one, many }) => ({
  stops: many(stop),
}));

export const stopRelations = relations(stop, ({ one, many }) => ({
  route: one(route, { fields: [stop.routeId], references: [route.id] }),
}));

export const studentTransportRelations = relations(studentTransport, ({ one, many }) => ({
  student: one(student, { fields: [studentTransport.studentId], references: [student.id] }),
}));

export const tripRelations = relations(trip, ({ one, many }) => ({
  events: many(tripEvent),
}));

export const tripEventRelations = relations(tripEvent, ({ one, many }) => ({
  trip: one(trip, { fields: [tripEvent.tripId], references: [trip.id] }),
}));

export const hostelRelations = relations(hostel, ({ one, many }) => ({
  rooms: many(hostelRoom),
}));

export const hostelRoomRelations = relations(hostelRoom, ({ one, many }) => ({
  hostel: one(hostel, { fields: [hostelRoom.hostelId], references: [hostel.id] }),
}));

export const bookRelations = relations(book, ({ one, many }) => ({
  copies: many(bookCopy),
}));

export const bookCopyRelations = relations(bookCopy, ({ one, many }) => ({
  book: one(book, { fields: [bookCopy.bookId], references: [book.id] }),
}));
