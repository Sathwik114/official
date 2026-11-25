import { NextResponse } from 'next/server';
import { getLeaveRequestById, addLeaveApproval, updateLeaveRequestStatus, updateLeaveRequestRejection } from '@/lib/leaveDb';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { getUserEmail, sendMail, buildLeaveRequestEmailContent, buildLeaveApprovalNotificationEmailContent, getApprovalStatusesForEmail, getDirectApprovalsLink } from '@/lib/mail';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function POST(request) {
  try {
    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, approverId, decision, remarks } = body || {};

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
      return NextResponse.json({ error: 'Select between 1 and 500 leave requests.' }, { status: 400 });
    }
    const leaveRequestIds = ids.map(Number);
    if (leaveRequestIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
      || new Set(leaveRequestIds).size !== leaveRequestIds.length) {
      return NextResponse.json({ error: 'Leave request IDs must be unique positive integers.' }, { status: 400 });
    }
    if (String(approverId || '').trim() !== currentUserId) {
      return NextResponse.json({ error: 'Approver does not match the signed-in user.' }, { status: 403 });
    }
    const decisionValue = String(decision || 'APPROVED').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decisionValue)) {
      return NextResponse.json({ error: 'Decision must be APPROVED or REJECTED.' }, { status: 400 });
    }
    if (decisionValue === 'REJECTED' && !String(remarks || '').trim()) {
      return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
    }

    const results = [];

    for (const id of leaveRequestIds) {
      const leaveRequest = await getLeaveRequestById(Number(id));
      if (!leaveRequest) {
        results.push({ id, success: false, error: 'not found' });
        continue;
      }

      const requestCurrentApproverId = String(leaveRequest.CurrentApproverId || '').trim();
      if (String(leaveRequest.Status || '').toUpperCase() !== 'PENDING' || requestCurrentApproverId !== currentUserId) {
        results.push({ id, success: false, error: 'This request is not pending with the signed-in user.' });
        continue;
      }

      const flow = String(leaveRequest.ApprovalFlow || '').split(',').map((approver) => approver.trim()).filter(Boolean);
      const currentStep = flow.indexOf(currentUserId);
      if (currentStep === -1) {
        results.push({ id, success: false, error: 'Signed-in user is not configured in the approval flow.' });
        continue;
      }
      const nextApprover = flow[currentStep + 1] || null;

      await addLeaveApproval(Number(id), currentUserId, decisionValue, remarks || '', currentStep + 1);

      if (decisionValue === 'APPROVED') {
        await updateLeaveRequestStatus(Number(id), nextApprover || '', nextApprover ? 'PENDING' : 'APPROVED', currentUserId, currentStep + 1);
        results.push({ id, success: true, nextApprover });

        const approverName = (await getEmployeeDetails(currentUserId).catch(() => null))?.EmpName || currentUserId;
        const applicantEmployee = await getEmployeeDetails(leaveRequest.ApplicantId);

        const emailRequest = {
          applicantId: leaveRequest.ApplicantId,
          applicantName: leaveRequest.ApplicantName || applicantEmployee?.EmpName || '',
          department: applicantEmployee?.DeptCode || '',
          section: applicantEmployee?.Section || '',
          leaveType: leaveRequest.LeaveType,
          startDate: leaveRequest.StartDate,
          endDate: leaveRequest.EndDate,
          totalDays: leaveRequest.TotalDays,
          reason: leaveRequest.Reason,
          relieverId: leaveRequest.RelieverId || '',
          relieverName: leaveRequest.RelieverName || '',
          contactNumber: leaveRequest.ContactNumber || '',
          approvalFlow: flow,
          EarnLeaveBalance: leaveRequest.EarnLeaveBalance ?? applicantEmployee?.EarnLeaveBalance ?? 0,
          SickLeaveBalance: leaveRequest.SickLeaveBalance ?? applicantEmployee?.SickLeaveBalance ?? 0,
          fromTime: leaveRequest.FromTime || '',
          toTime: leaveRequest.ToTime || '',
          shift: leaveRequest.Shift || '',
          empType: leaveRequest.EmpType || '',
          createdAt: leaveRequest.CreatedAt || new Date(),
          TranId: leaveRequest.TranId || '',
          AttachmentName: leaveRequest.AttachmentName || '',
          HodApproval: leaveRequest.HodApproval || '',
          HodStatus: leaveRequest.HodStatus || 'PENDING',
          CccApproval: leaveRequest.CccApproval || '',
          CccStatus: leaveRequest.CccStatus || 'PENDING',
          ...getApprovalStatusesForEmail(leaveRequest, currentStep + 1, decisionValue),
        };

        let emailSubject = '';
        let emailContent = null;
        let recipientEmail = '';

        if (nextApprover) {
          recipientEmail = getUserEmail(nextApprover);
          emailSubject = `Leave Request Approved by ${approverName} - Next Approval Required`;
          emailContent = buildLeaveApprovalNotificationEmailContent({
            applicantId: emailRequest.applicantId,
            applicantName: emailRequest.applicantName,
            department: emailRequest.department,
            startDate: emailRequest.startDate,
            endDate: emailRequest.endDate,
            fromTime: emailRequest.fromTime,
            toTime: emailRequest.toTime,
            leaveType: emailRequest.leaveType,
            totalDays: emailRequest.totalDays,
            reason: emailRequest.reason,
            approvalLink: await getDirectApprovalsLink(nextApprover, {
              TranId: emailRequest.TranId,
              EmpCode: emailRequest.applicantId,
              EmpName: emailRequest.applicantName,
              StartDate: emailRequest.startDate,
              EndDate: emailRequest.endDate,
              LeaveType: emailRequest.leaveType,
            }),
          });
        }

        if (emailContent && recipientEmail) {
          try {
            await sendMail({
              to: recipientEmail,
              subject: emailSubject,
              html: emailContent.html,
              text: emailContent.text,
            });
          } catch (mailError) {
            console.error('Failed to send mail in bulk approval:', mailError);
          }
        }
      } else {
        await updateLeaveRequestRejection(Number(id), currentUserId, remarks || '', currentStep + 1);
        results.push({ id, success: true, rejected: true });

        const approverName = (await getEmployeeDetails(currentUserId).catch(() => null))?.EmpName || currentUserId;
        const applicantEmployee = await getEmployeeDetails(leaveRequest.ApplicantId);

        const emailRequest = {
          applicantId: leaveRequest.ApplicantId,
          applicantName: leaveRequest.ApplicantName || applicantEmployee?.EmpName || '',
          department: applicantEmployee?.DeptCode || '',
          section: applicantEmployee?.Section || '',
          leaveType: leaveRequest.LeaveType,
          startDate: leaveRequest.StartDate,
          endDate: leaveRequest.EndDate,
          totalDays: leaveRequest.TotalDays,
          reason: leaveRequest.Reason,
          relieverId: leaveRequest.RelieverId || '',
          relieverName: leaveRequest.RelieverName || '',
          contactNumber: leaveRequest.ContactNumber || '',
          approvalFlow: flow,
          EarnLeaveBalance: leaveRequest.EarnLeaveBalance ?? applicantEmployee?.EarnLeaveBalance ?? 0,
          SickLeaveBalance: leaveRequest.SickLeaveBalance ?? applicantEmployee?.SickLeaveBalance ?? 0,
          fromTime: leaveRequest.FromTime || '',
          toTime: leaveRequest.ToTime || '',
          shift: leaveRequest.Shift || '',
          empType: leaveRequest.EmpType || '',
          createdAt: leaveRequest.CreatedAt || new Date(),
          TranId: leaveRequest.TranId || '',
          AttachmentName: leaveRequest.AttachmentName || '',
          HodApproval: leaveRequest.HodApproval || '',
          HodStatus: leaveRequest.HodStatus || 'PENDING',
          CccApproval: leaveRequest.CccApproval || '',
          CccStatus: leaveRequest.CccStatus || 'PENDING',
          ...getApprovalStatusesForEmail(leaveRequest, currentStep + 1, 'REJECTED'),
        };

        const recipientEmail = getUserEmail(leaveRequest.ApplicantId);
        const emailSubject = `Leave Request Rejected: ${emailRequest.applicantName}`;
        const emailContent = buildLeaveRequestEmailContent(emailRequest, {
          action: 'Rejected',
          rejectedById: currentUserId,
          rejectedByName: approverName,
          currentApproverName: approverName,
          nextApproverName: '',
          status: 'REJECTED',
          remarks: remarks || '',
          senderName: approverName,
        });

        if (emailContent && recipientEmail) {
          try {
            await sendMail({
              to: recipientEmail,
              subject: emailSubject,
              html: emailContent.html,
              text: emailContent.text,
            });
          } catch (mailError) {
            console.error('Failed to send mail in bulk rejection:', mailError);
          }
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('Bulk approval error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
