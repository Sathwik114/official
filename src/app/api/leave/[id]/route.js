import { NextResponse } from 'next/server';
import { addLeaveApproval, getLeaveRequestById, updateLeaveRequestRejection, updateLeaveRequestStatus } from '@/lib/leaveDb';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { getUserEmail, sendMail, buildLeaveRequestEmailContent, buildLeaveApprovalNotificationEmailContent, getApprovalStatusesForEmail, getDirectApprovalsLink } from '@/lib/mail';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function POST(request, { params }) {
  try {
    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { id } = await params;
    const leaveRequestId = Number(id);

    let body = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }

    const { decision, remarks } = body;
    const leaveRequest = await getLeaveRequestById(leaveRequestId);

    if (!leaveRequest) {
      return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
    }

    const requestCurrentApproverId = String(leaveRequest.CurrentApproverId || '').trim();
    if (String(leaveRequest.Status || '').toUpperCase() !== 'PENDING' || requestCurrentApproverId !== currentUserId) {
      return NextResponse.json({ error: 'This request is not pending with the signed-in user.' }, { status: 403 });
    }

    const flow = String(leaveRequest.ApprovalFlow || '').split(',').map((approver) => approver.trim()).filter(Boolean);
    const currentStep = flow.indexOf(currentUserId);
    const nextApprover = flow[currentStep + 1] || null;

    if (currentStep === -1) {
      return NextResponse.json({ error: 'Signed-in user is not configured in this request’s approval flow.' }, { status: 403 });
    }

    const decisionValue = String(decision || 'APPROVED').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decisionValue)) {
      return NextResponse.json({ error: 'Decision must be APPROVED or REJECTED.' }, { status: 400 });
    }
    if (decisionValue === 'REJECTED' && !String(remarks || '').trim()) {
      return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
    }

    const approvedBy = currentUserId;
    await addLeaveApproval(leaveRequestId, approvedBy, decisionValue, remarks || '', currentStep + 1);
    if (decisionValue === 'REJECTED') {
      await updateLeaveRequestRejection(leaveRequestId, approvedBy, remarks || '', currentStep + 1);
    } else {
      await updateLeaveRequestStatus(
        leaveRequestId,
        nextApprover || '',
        nextApprover ? 'PENDING' : 'APPROVED',
        approvedBy,
        currentStep + 1
      );
    }

    const approverName = (await getEmployeeDetails(approvedBy).catch(() => null))?.EmpName || approvedBy;
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

    if (decisionValue === 'APPROVED') {
      if (nextApprover) {
        recipientEmail = getUserEmail(nextApprover);
        emailSubject = `Leave Request Approved by ${approverName} - Next Approval Required`;
        emailContent = buildLeaveApprovalNotificationEmailContent({
          applicantId: emailRequest.applicantId,
          applicantName: emailRequest.applicantName,
          department: emailRequest.department,
          startDate: emailRequest.startDate,
          endDate: emailRequest.endDate,
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
    } else if (decisionValue === 'REJECTED') {
      recipientEmail = getUserEmail(leaveRequest.ApplicantId);
      emailSubject = `Leave Request Rejected: ${emailRequest.applicantName}`;
      emailContent = buildLeaveRequestEmailContent(emailRequest, {
        action: 'Rejected',
        currentApproverName: approverName,
        nextApproverName: '',
        status: 'REJECTED',
        remarks: remarks || '',
        senderName: approverName,
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
        console.error('Failed to send leave decision notification email:', mailError);
      }
    }

    return NextResponse.json({
      success: true,
      nextApprover,
      status: decisionValue === 'REJECTED' ? 'REJECTED' : (nextApprover ? 'PENDING' : 'APPROVED'),
    });
  } catch (error) {
    console.error('Approval update error:', error);
    return NextResponse.json(
      { error: 'Failed to update approval state.' },
      { status: 500 }
    );
  }
}
