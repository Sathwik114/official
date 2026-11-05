import nodemailer from 'nodemailer';
import { getCalendarDateParts } from '@/lib/leaveDateUtils';
import { createDirectApprovalToken } from '@/lib/directApprovalToken';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_AUTH_METHOD = process.env.SMTP_AUTH_METHOD?.trim();
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const MAIL_FROM_ADDRESS = MAIL_FROM?.match(/<([^>]+)>/)?.[1]?.trim() || MAIL_FROM;
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://10.40.10.125:7000';
const APPROVAL_APP_URL = APP_URL;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
  console.warn('SMTP configuration is incomplete. Email sending may fail.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  ...(SMTP_AUTH_METHOD ? { authMethod: SMTP_AUTH_METHOD } : {}),
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000,

  greetingTimeout: 10000,
});

function normalizeUserId(userId) {
  return String(userId || '').trim();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function buildLeaveApprovalNotificationEmailContent({
  applicantId,
  applicantName,
  department,
  startDate,
  endDate,
  leaveType,
  totalDays,
  reason,
  approvalLink,
}) {
  const safeApplicantName = escapeHtml(applicantName || 'An employee');
  const safeApplicantId = escapeHtml(applicantId || '-');
  const safeDepartment = escapeHtml(department || '-');
  const safeStartDate = escapeHtml(formatEmailCalendarDate(startDate));
  const safeEndDate = escapeHtml(formatEmailCalendarDate(endDate));
  const safeLeaveType = escapeHtml(leaveType || '-');
  const safeTotalDays = escapeHtml(totalDays ?? '-');
  const safeReason = escapeHtml(reason || '-');
  const safeApprovalLink = escapeHtml(approvalLink);
  const labelStyle = 'padding:8px;border:1px solid #ddd;white-space:nowrap;text-align:left;';
  const valueStyle = 'padding:8px;border:1px solid #ddd;text-align:left;';

  return {
    html: `
      <div style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">Leave approval required</h2>
        <p>The following Employee was Applied for a Leave, waiting for your approval.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;table-layout:fixed;">
          <colgroup>
            <col style="width:16%;">
            <col style="width:34%;">
            <col style="width:16%;">
            <col style="width:34%;">
          </colgroup>
          <tbody>
            <tr>
              <td style="${labelStyle}"><strong>Emp name</strong></td>
              <td colspan="3" style="${valueStyle}">${safeApplicantName}</td>
            </tr>
            <tr>
              <td style="${labelStyle}"><strong>Emp code</strong></td>
              <td style="${valueStyle}">${safeApplicantId}</td>
              <td style="${labelStyle}"><strong>Department</strong></td>
              <td style="${valueStyle}">${safeDepartment}</td>
            </tr>
            <tr>
              <td style="${labelStyle}"><strong>Start date</strong></td>
              <td style="${valueStyle}">${safeStartDate}</td>
              <td style="${labelStyle}"><strong>End date</strong></td>
              <td style="${valueStyle}">${safeEndDate}</td>
            </tr>
            <tr>
              <td style="${labelStyle}"><strong>Leave type</strong></td>
              <td style="${valueStyle}">${safeLeaveType}</td>
              <td style="${labelStyle}"><strong>Total days</strong></td>
              <td style="${valueStyle}">${safeTotalDays}</td>
            </tr>
            <tr>
              <td style="${labelStyle}"><strong>Reason</strong></td>
              <td colspan="3" style="${valueStyle}white-space:normal;overflow-wrap:anywhere;word-break:break-word;">${safeReason}</td>
            </tr>
          </tbody>
        </table>
        <p><a href="${safeApprovalLink}" style="display:inline-block;padding:12px 20px;background:#ffffff;color:#dc2626;border:1px solid #dc2626;text-decoration:none;border-radius:6px;font-weight:700;">Review pending leave requests</a></p>
        <p style="font-size:12px;color:#64748b;">Use the secure link above to review and take action on all pending leave requests directly. This link expires after 35 days.</p>
      </div>
    `,
    text: [
      'Leave approval required',
      `A leave request from ${applicantName || 'an employee'} is waiting for your approval.`,
      `Empcode: ${applicantId || '-'}`,
      `Emp name: ${applicantName || '-'}`,
      `Department: ${department || '-'}`,
      `Start date: ${formatEmailCalendarDate(startDate)}`,
      `End date: ${formatEmailCalendarDate(endDate)}`,
      `Leave type: ${leaveType || '-'}`,
      `Total days: ${totalDays ?? '-'}`,
      `Reason: ${reason || '-'}`,
      `Review pending leave requests: ${approvalLink}`,
      'Use the secure link above to review and take action on all pending leave requests directly. This link expires after 35 days.',
    ].join('\n'),
  };
}

export function getUserEmail(userId) {
  const normalized = normalizeUserId(userId);
  return normalized ? `${normalized}@gti.nws.cn` : '';
}

export function getApprovalStatusesForEmail(leaveRequest, stepNumber, decision) {
  const statuses = {
    HodStatus: leaveRequest.HodStatus || 'PENDING',
    CccStatus: leaveRequest.CccStatus || 'PENDING',
  };
  const normalizedDecision = String(decision || '').toUpperCase();

  if (stepNumber === 1 && ['APPROVED', 'REJECTED'].includes(normalizedDecision)) {
    statuses.HodStatus = normalizedDecision === 'APPROVED' ? 'Accept' : 'REJECTED';
  } else if (stepNumber === 2 && ['APPROVED', 'REJECTED'].includes(normalizedDecision)) {
    statuses.CccStatus = normalizedDecision === 'APPROVED' ? 'Accept' : 'REJECTED';
  }

  return statuses;
}

function formatDate(value, timeString) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const calendarDate = getCalendarDateParts(value);
  if (!calendarDate) return String(value);

  const day = String(calendarDate.day).padStart(2, '0');
  const month = String(calendarDate.month).padStart(2, '0');
  const year = calendarDate.year;

  let formattedHours = '12';
  let minutes = '00';
  let ampm = 'AM';
  
  if (timeString && typeof timeString === 'string') {
    const cleanTime = timeString.trim();
    const match = cleanTime.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?/i);
    if (match) {
      formattedHours = String(Number(match[1])).padStart(2, '0');
      minutes = match[2];
      if (match[3]) {
        ampm = match[3].toUpperCase();
      } else {
        let h = Number(match[1]);
        ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        formattedHours = String(h).padStart(2, '0');
      }
    }
  } else {
    let hours = date.getUTCHours();
    minutes = String(date.getUTCMinutes()).padStart(2, '0');
    ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    formattedHours = String(hours).padStart(2, '0');
  }
  
  return `${day}/${month}/${year} ${formattedHours}:${minutes} ${ampm}`;
}

function formatEmailCalendarDate(value) {
  const date = getCalendarDateParts(value);
  if (!date) return value ? String(value) : '-';
  return `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}/${date.year}`;
}

export function buildLeaveRequestEmailContent(request, options = {}) {
  const {
    action = 'Submitted',
    status = 'PENDING',
    remarks = '',
    senderName = 'HR Department',
  } = options;

  const approvalFlow = Array.isArray(request.approvalFlow)
    ? request.approvalFlow.join(' → ')
    : String(request.approvalFlow || '');

  const html = `
    <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
      <div style="max-width: 850px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
        <!-- Header banner -->
        <div style="background: linear-gradient(135deg, #0284c7, #0f172a); padding: 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">Leave Request Details</h2>
          <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9; font-weight: 500;">Status: ${status} (${action})</p>
        </div>

        <!-- Info message -->
        <div style="padding: 20px 24px 0 24px;">
          <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">
            A leave request has been <strong>${action.toLowerCase()}</strong>. Please find the details of the leave application form below.
          </p>
        </div>

        <!-- Table Form (View Form representation) -->
        <div style="padding: 20px 24px;">
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <!-- Header row -->
            <tr style="background-color: #f8fafc; border-bottom: 1px solid #cbd5e1;">
              <td colspan="2" style="padding: 10px 12px; font-weight: 600; color: #334155; border-right: 1px solid #cbd5e1;">
                Balance Leaves: EL: <strong>${request.EarnLeaveBalance ?? 0}</strong> | SL: <strong>${request.SickLeaveBalance ?? 0}</strong>
              </td>
              <td colspan="2" style="padding: 10px 12px; font-weight: 600; color: #334155; text-align: right;">
                Date of Application: <span style="color: #dc2626; font-weight: bold;">${formatDate(request.createdAt || request.CreatedAt || new Date())}</span>
              </td>
            </tr>
            <!-- Row 1: Employee details -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1; width: 25%;">Employee Name:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1; width: 25%;">${request.applicantName || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1; width: 25%;">Employee ID:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; width: 25%;">${request.applicantId || '-'}</td>
            </tr>
            <!-- Row 2: Department and Section -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Department:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${request.department || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Section:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.section || '-'}</td>
            </tr>
            <!-- Row 3: From Time and To Time -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">From Time:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${request.fromTime || request.FromTime || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">To Time:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.toTime || request.ToTime || '-'}</td>
            </tr>
            <!-- Row 4: Shift and Employee Type -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Shift:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${request.shift || request.Shift || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Employee Type:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.empType || request.EmpType || '-'}</td>
            </tr>
            <!-- Row 5: Leave Type and Days -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Leave Type:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${request.leaveType || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">No of Days:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.totalDays || '-'}</td>
            </tr>
            <!-- Row 6: Start Date and End Date -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Leave Start Date:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${formatDate(request.startDate, request.fromTime || request.FromTime)}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">End Date:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${formatDate(request.endDate, request.toTime || request.ToTime)}</td>
            </tr>
            <!-- Row 7: Contact and Reliever -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Contact Number:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${request.contactNumber || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Reliever:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.relieverName || request.relieverId || '-'}</td>
            </tr>
            <!-- Row 8: Reason -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Reason:</td>
              <td colspan="3" style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.reason || '-'}</td>
            </tr>
            <!-- Row 9: Attachment -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Attachment:</td>
              <td colspan="3" style="padding: 10px 12px; font-weight: 700; color: #0f172a;">
                ${request.TranId && request.AttachmentName ? `
                  <a href="${APP_URL}/api/leave/document/${request.TranId}" target="_blank" style="color: #2563eb; text-decoration: underline;">
                    ${request.AttachmentName}
                  </a>
                ` : (request.AttachmentName || '-')}
              </td>
            </tr>
            <!-- Row 10: HoD Status and CCC Status -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1; width: 25%;">Vice President Status:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1; width: 25%;">${request.HodStatus || 'PENDING'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1; width: 25%;">President Status:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; width: 25%;">${request.CccStatus || 'PENDING'}</td>
            </tr>
            <!-- Row 12: Approval Flow -->
            ${remarks ? `
            <tr style="border-top: 1px solid #cbd5e1; background-color: #fffbeb;">
              <td style="padding: 10px 12px; font-weight: 600; color: #b45309; border-right: 1px solid #cbd5e1;">Remarks:</td>
              <td colspan="3" style="padding: 10px 12px; font-weight: 700; color: #78350f;">${remarks}</td>
            </tr>` : ''}
           </table>
          </div>
        </div>

        <!-- Actions block -->
        <div style="padding: 0 24px 24px 24px; text-align: center; background-color: #fafafa; border-top: 1px solid #f1f5f9;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 20px auto 8px auto;">
            <tr>
            </tr>
          </table>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">This email was automatically generated by the Leave Management System.</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    `Leave Request ${action}`,
    `Applicant ID: ${request.applicantId || '-'}`,
    `Applicant Name: ${request.applicantName || '-'}`,
    `Department: ${request.department || '-'}`,
    `Section: ${request.section || '-'}`,
    `From Time: ${request.fromTime || request.FromTime || '-'}`,
    `To Time: ${request.toTime || request.ToTime || '-'}`,
    `Shift: ${request.shift || request.Shift || '-'}`,
    `Employee Type: ${request.empType || request.EmpType || '-'}`,
    `Leave Type: ${request.leaveType || '-'}`,
    `Start Date: ${formatDate(request.startDate, request.fromTime || request.FromTime)}`,
    `End Date: ${formatDate(request.endDate, request.toTime || request.ToTime)}`,
    `Total Days: ${request.totalDays || '-'}`,
    `Reason: ${request.reason || '-'}`,
    `Attachment: ${request.AttachmentName || '-'}`,
    `Reliever ID: ${request.relieverId || '-'}`,
    `Reliever Name: ${request.relieverName || '-'}`,
    `Contact Number: ${request.contactNumber || '-'}`,
    `HoD Status: ${request.HodStatus || 'PENDING'}`,
    `CCC Status: ${request.CccStatus || 'PENDING'}`,
    `Remarks: ${remarks || '-'}`,
    `Sender: ${senderName}`,
  ].join('\n');

  return { html, text };
}

export async function getDirectApprovalsLink(approverId, leaveRequest) {
  const normalizedApproverId = normalizeUserId(approverId);
  if (!normalizedApproverId) return '';

  const token = await createDirectApprovalToken(normalizedApproverId, leaveRequest);
  const url = new URL(`${APPROVAL_APP_URL}/approve-leaves-direct`);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function sendMail({ to, subject, html, text }) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
    throw new Error('SMTP is not properly configured. Please set SMTP_HOST, SMTP_USER, SMTP_PASS, and MAIL_FROM.');
  }

  if (!to) {
    throw new Error('Recipient email is required.');
  }

  const result = await transporter.sendMail({
    from: {
      name: 'Leave Application',
      address: MAIL_FROM_ADDRESS,
    },
    to,
    subject,
    text,
    html,
  });

  console.log(`Mail sent successfully to: ${to}`);
  return result;
}