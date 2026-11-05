import { NextResponse } from 'next/server';
import {
  addLeaveApproval,
  addCurrentEmployeeDepartmentAndSection,
  getApprovedRequestsForApprover,
  getLeaveRequestById,
  getPendingApprovalsForUser,
  updateLeaveRequestRejection,
  updateLeaveRequestStatus,
} from '@/lib/leaveDb';
import {
  buildLeaveApprovalNotificationEmailContent,
  buildLeaveRequestEmailContent,
  getDirectApprovalsLink,
  getApprovalStatusesForEmail,
  getUserEmail,
  sendMail,
} from '@/lib/mail';
import { verifyDirectApprovalToken } from '@/lib/directApprovalToken';

function getToken(request) {
  const authorization = request.headers.get('authorization') || '';
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

async function getApproverId(request) {
  const token = getToken(request);
  if (!token) return null;
  return verifyDirectApprovalToken(token);
}

export async function GET(request) {
  let approverId;
  try {
    approverId = await getApproverId(request);
  } catch (error) {
    console.error('Direct approval token verification failed:', error);
    return NextResponse.json({ error: 'Unable to verify this approval link.' }, { status: 500 });
  }

  if (!approverId) {
    return NextResponse.json({ error: 'This approval link is missing, invalid, expired, or revoked.' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const [pendingApprovalsFromDb, approvedRequestsFromDb] = await Promise.all([
      getPendingApprovalsForUser(approverId),
      getApprovedRequestsForApprover(approverId),
    ]);
    const requestCount = pendingApprovalsFromDb.length;
    const approvalRequests = await addCurrentEmployeeDepartmentAndSection([
      ...pendingApprovalsFromDb,
      ...approvedRequestsFromDb,
    ]);
    const pendingApprovals = approvalRequests.slice(0, requestCount);
    const approvedRequests = approvalRequests.slice(requestCount);

    return NextResponse.json({
      pendingApprovals,
      approvedRequests,
      approverId,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Direct approval list error:', error);
    return NextResponse.json({ error: 'Unable to load pending leave requests.' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export async function POST(request) {
  let approverId;
  try {
    approverId = await getApproverId(request);
  } catch (error) {
    console.error('Direct approval token verification failed:', error);
    return NextResponse.json({ error: 'Unable to verify this approval link.' }, { status: 500 });
  }

  if (!approverId) {
    return NextResponse.json({ error: 'This approval link is missing, invalid, expired, or revoked.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }

  const { ids, decision, remarks } = body || {};
  const decisionValue = String(decision || '').toUpperCase();
  const rejectionReason = String(remarks || '').trim();

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
    return NextResponse.json({ error: 'Select between 1 and 500 leave requests.' }, { status: 400 });
  }

  const leaveRequestIds = ids.map(Number);
  if (leaveRequestIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
    || new Set(leaveRequestIds).size !== leaveRequestIds.length) {
    return NextResponse.json({ error: 'Leave request IDs must be unique positive integers.' }, { status: 400 });
  }

  if (!['APPROVED', 'REJECTED'].includes(decisionValue)) {
    return NextResponse.json({ error: 'Decision must be APPROVED or REJECTED.' }, { status: 400 });
  }

  if (decisionValue === 'REJECTED' && !rejectionReason) {
    return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
  }

  if (rejectionReason.length > 2000) {
    return NextResponse.json({ error: 'Rejection reason must be 2000 characters or fewer.' }, { status: 400 });
  }

  const results = [];

  for (const leaveRequestId of leaveRequestIds) {
    try {
      const leaveRequest = await getLeaveRequestById(leaveRequestId);
      if (!leaveRequest) {
        results.push({ id: leaveRequestId, success: false, error: 'Leave request not found.' });
        continue;
      }

      const currentApproverId = String(leaveRequest.CurrentApproverId || '').trim();
      if (String(leaveRequest.Status || '').toUpperCase() !== 'PENDING' || currentApproverId !== approverId) {
        results.push({ id: leaveRequestId, success: false, error: 'This request is no longer pending with you.' });
        continue;
      }

      const flow = String(leaveRequest.ApprovalFlow || '').split(',').map((id) => id.trim()).filter(Boolean);
      const currentStep = flow.indexOf(approverId);
      if (currentStep === -1) {
        results.push({ id: leaveRequestId, success: false, error: 'Approver is not configured for this request.' });
        continue;
      }

      const nextApprover = flow[currentStep + 1] || '';
      if (decisionValue === 'APPROVED') {
        await addLeaveApproval(leaveRequestId, approverId, decisionValue, 'Approved via secure email link', currentStep + 1);
        await updateLeaveRequestStatus(
          leaveRequestId,
          nextApprover,
          nextApprover ? 'PENDING' : 'APPROVED',
          approverId,
          currentStep + 1
        );
      } else {
        await addLeaveApproval(leaveRequestId, approverId, decisionValue, rejectionReason, currentStep + 1);
        await updateLeaveRequestRejection(leaveRequestId, approverId, rejectionReason, currentStep + 1);
      }

      if (decisionValue === 'APPROVED' && nextApprover) {
        try {
          const recipientEmail = getUserEmail(nextApprover);
          const content = buildLeaveApprovalNotificationEmailContent({
            applicantId: leaveRequest.ApplicantId,
            applicantName: leaveRequest.ApplicantName || leaveRequest.ApplicantId,
            department: leaveRequest.Department,
            startDate: leaveRequest.StartDate,
            endDate: leaveRequest.EndDate,
            leaveType: leaveRequest.LeaveType,
            totalDays: leaveRequest.TotalDays,
            reason: leaveRequest.Reason,
            approvalLink: await getDirectApprovalsLink(nextApprover, leaveRequest),
          });
          await sendMail({
            to: recipientEmail,
            subject: `Leave Request Approved - Next Approval Required`,
            html: content.html,
            text: content.text,
          });
        } catch (mailError) {
          console.error('Failed to send next direct approval notification:', mailError);
        }
      } else if (decisionValue === 'REJECTED') {
        try {
          const emailRequest = {
            applicantId: leaveRequest.ApplicantId,
            applicantName: leaveRequest.ApplicantName || '',
            department: leaveRequest.Department || '',
            section: leaveRequest.Section || '',
            leaveType: leaveRequest.LeaveType,
            startDate: leaveRequest.StartDate,
            endDate: leaveRequest.EndDate,
            totalDays: leaveRequest.TotalDays,
            reason: leaveRequest.Reason,
            approvalFlow: flow,
            fromTime: leaveRequest.FromTime || '',
            toTime: leaveRequest.ToTime || '',
            AttachmentName: leaveRequest.AttachmentName || '',
            ...getApprovalStatusesForEmail(leaveRequest, currentStep + 1, 'REJECTED'),
          };
          const content = buildLeaveRequestEmailContent(emailRequest, {
            action: 'Rejected',
            status: 'REJECTED',
            remarks: rejectionReason,
            senderName: approverId,
          });
          await sendMail({
            to: getUserEmail(leaveRequest.ApplicantId),
            subject: `Leave Request Rejected: ${emailRequest.applicantName}`,
            html: content.html,
            text: content.text,
          });
        } catch (mailError) {
          console.error('Failed to send direct rejection notification:', mailError);
        }
      }

      results.push({ id: leaveRequestId, success: true, nextApprover: nextApprover || null });
    } catch (error) {
      console.error(`Direct approval failed for leave request ${leaveRequestId}:`, error);
      results.push({ id: leaveRequestId, success: false, error: 'Unable to process this leave request.' });
    }
  }

  return NextResponse.json({
    success: results.every((result) => result.success),
    results,
  });
}
