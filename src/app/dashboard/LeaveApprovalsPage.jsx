'use client';

import { useCallback, useEffect, useState } from 'react';
import './page.css';
import './leave-approval.css';
import { formatApproverList, normalizeApproverList } from '@/lib/leaveUtils';
import { formatCalendarDate, getCalendarDateParts } from '@/lib/leaveDateUtils';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatApprovalStatus(status, approverId) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (!normalizedStatus || normalizedStatus === 'PENDING') return 'Pending';
  if (normalizedStatus === 'ACCEPT' || normalizedStatus === 'APPROVED') {
    const normalizedApproverId = String(approverId || '').trim();
    return normalizedApproverId ? `Accept (${normalizedApproverId})` : 'Accept';
  }
  if (normalizedStatus === 'REJECTED') return 'Rejected';
  return status;
}

function formatRequestStatus(status) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (normalizedStatus === 'APPROVED') return 'Approved';
  if (normalizedStatus === 'PENDING') return 'Pending';
  if (normalizedStatus === 'REJECTED') return 'Rejected';
  return status || '-';
}

function getApprovalStatusClass(status) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (!normalizedStatus || normalizedStatus === 'PENDING') return 'leaveApprovalStatusPending';
  if (normalizedStatus === 'ACCEPT' || normalizedStatus === 'APPROVED') return 'leaveApprovalStatusAccepted';
  if (normalizedStatus === 'REJECTED') return 'leaveApprovalStatusRejected';
  return '';
}

export default function LeaveApprovalsPage({ directMode = false, directToken = '' }) {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [directLinkUnavailable, setDirectLinkUnavailable] = useState(false);
  const [message, setMessage] = useState('');
  const [actionPopup, setActionPopup] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('pending');
  const currentDate = new Date();
  const [monthFilter, setMonthFilter] = useState(String(currentDate.getMonth()));
  const [yearFilter, setYearFilter] = useState(String(currentDate.getFullYear()));
  const [approvedSearch, setApprovedSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(directMode ? '/api/leave/approve-direct' : '/api/leave', {
        cache: 'no-store',
        headers: directToken ? { Authorization: 'Bearer ' + directToken } : undefined,
      });
      if (directMode && res.status === 401) {
        setDirectLinkUnavailable(true);
        setPendingApprovals([]);
        setApprovedRequests([]);
        setMessage('');
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load leave approvals.');
      setPendingApprovals(data.pendingApprovals || []);
      setApprovedRequests(data.approvedRequests || []);
      setDirectLinkUnavailable(false);
    } catch (err) {
      console.error('Failed to load leave approvals:', err);
      setMessage(err.message || 'Failed to load leave approvals.');
    } finally {
      setLoading(false);
    }
  }, [directMode, directToken]);

  useEffect(() => {
    if (!actionPopup) return undefined;

    const timer = setTimeout(() => setActionPopup(null), 1000);
    return () => clearTimeout(timer);
  }, [actionPopup]);

  useEffect(() => {
    if (!directMode) return undefined;

    document.documentElement.classList.add('directApprovalDocument');
    document.body.classList.add('directApprovalDocument');

    return () => {
      document.documentElement.classList.remove('directApprovalDocument');
      document.body.classList.remove('directApprovalDocument');
    };
  }, [directMode]);

  async function handleBulkAction(decision, remarks = '', requestIds = Array.from(selectedIds)) {
    if (requestIds.length === 0) return;

    const first = pendingApprovals.find((p) => p.Id === requestIds[0]);
    const approverId = first?.CurrentApproverId || first?.CurrentApprover || '';

    try {
      const res = await fetch(directMode ? '/api/leave/approve-direct' : '/api/leave/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(directToken ? { Authorization: 'Bearer ' + directToken } : {}),
        },
        body: JSON.stringify({ ids: requestIds, approverId, decision: decision.toUpperCase(), remarks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk action failed');
      const results = data.results || [];
      const failedResults = results.filter((result) => !result.success);
      const succeededCount = results.length - failedResults.length;
      const actionLabel = decision === 'APPROVED' ? 'approved' : 'rejected';
      setActionPopup({
        title: failedResults.length ? 'Action partially completed' : 'Action completed',
        message: failedResults.length
          ? `${succeededCount} selected request(s) ${actionLabel}; ${failedResults.length} could not be processed.${failedResults[0]?.error ? ` ${failedResults[0].error}` : ''}`
          : `Selected requests ${actionLabel}.`,
        isError: failedResults.length > 0,
      });
      setSelectedIds(new Set());
      await loadData();
    } catch (err) {
      setActionPopup({
        title: 'Action failed',
        message: err.message || 'Bulk action failed',
        isError: true,
      });
    }
  }

  async function handleRejectSelected() {
    const requestIds = Array.from(selectedIds);
    if (requestIds.length === 0) return;

    const reason = window.prompt(
      `Enter one rejection reason to apply to all ${requestIds.length} selected leave request(s):`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setMessage('A rejection reason is required.');
      return;
    }

    await handleBulkAction('REJECTED', reason.trim(), requestIds);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function selectAllToggle() {
    if (selectedIds.size === pendingApprovals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingApprovals.map((p) => p.Id)));
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);

    return () => clearTimeout(timer);
  }, [directMode, directToken, loadData]);

  function getDateValue(request) {
    return request.DateApplied || request.CreatedAt || request.StartDate;
  }

  function formatApplicationDate(request) {
    const value = getDateValue(request);
    return formatCalendarDate(value);
  }

  function filterByMonthYear(list) {
    if (monthFilter === 'all' && (yearFilter === 'all' || yearFilter === '')) return list;
    return list.filter((r) => {
      const val = getDateValue(r);
      const date = getCalendarDateParts(val);
      if (!date) return false;
      const monthOk = monthFilter === 'all' || date.month - 1 === Number(monthFilter);
      const yearOk = yearFilter === 'all' || yearFilter === '' || date.year === Number(yearFilter);
      return monthOk && yearOk;
    });
  }

  const renderRequestRow = (request, isPending = true, index = 0) => {
    const rowKey = request.Id ? `${request.Id}-${isPending ? 'pending' : 'approved'}-${index}` : `${isPending ? 'pending' : 'approved'}-${index}`;

    return (
      <tr
        key={rowKey}
        className={selectedRowId === request.Id ? 'leaveApprovalSelectedRow' : ''}
        aria-selected={selectedRowId === request.Id}
        onClick={() => setSelectedRowId(request.Id)}
      >
        {isPending && (
          <td style={{ textAlign: 'center' }}>
            <input type="checkbox" checked={selectedIds.has(request.Id)} onChange={() => toggleSelect(request.Id)} />
          </td>
        )}
        {!isPending && <td>{request.ApplicantId || '-'}</td>}
        <td>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="applyLeaveButton" onClick={() => setExpandedId(request.Id)}>
              View Form
            </button>
          </div>
        </td>
        {isPending && <td>{request.ApplicantId || '-'}</td>}
        <td>{request.ApplicantName || '-'}</td>
        <td>{request.Department || '-'}</td>
        <td>{request.Section || '-'}</td>
        <td>{formatApplicationDate(request)}</td>
        <td>{formatCalendarDate(request.StartDate || request.FromDate)}</td>
        <td>{formatCalendarDate(request.EndDate || request.ToDate)}</td>
        <td>{request.FromTime || '-'}</td>
        <td>{request.ToTime || '-'}</td>
        <td>{request.TotalDays}</td>
        <td>{request.LeaveType}</td>
        <td>{formatRequestStatus(request.Status)}</td>
        <td className={getApprovalStatusClass(request.HodStatus)}>
          {formatApprovalStatus(request.HodStatus, request.HodApproval)}
        </td>
        <td className={getApprovalStatusClass(request.CccStatus)}>
          {formatApprovalStatus(request.CccStatus, request.CccApproval)}
        </td>
        <td className="leaveReasonCell">{request.Reason || '-'}</td>
        <td>{request.CurrentApprover || '-'}</td>
      </tr>
    );
  };

  const combined = pendingApprovals.concat(approvedRequests || []);
  const uniqueById = Array.from(new Map(combined.map((r) => [r.Id, r])).values());
  const activeRequest = expandedId ? uniqueById.find((r) => r.Id === expandedId) : null;

  const filteredApproved = filterByMonthYear(approvedRequests).filter((request) => {
    const query = approvedSearch.trim().toLowerCase();
    if (!query) return true;

    return [
      request.ApplicantId,
      request.ApplicantName,
      request.Department,
      request.Section,
      formatApplicationDate(request),
      formatCalendarDate(request.StartDate || request.FromDate),
      formatCalendarDate(request.EndDate || request.ToDate),
      request.FromTime,
      request.ToTime,
      request.TotalDays,
      request.LeaveType,
      request.Reason,
      request.AttachmentName,
      request.CurrentApprover,
      request.Status,
    ].some((value) => String(value ?? '').toLowerCase().includes(query));
  });

  async function handleApproveDetail() {
    if (!activeRequest) return;
    try {
      const res = await fetch(directMode ? '/api/leave/approve-direct' : `/api/leave/${activeRequest.Id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(directToken ? { Authorization: 'Bearer ' + directToken } : {}),
        },
        body: JSON.stringify({
          ids: directMode ? [activeRequest.Id] : undefined,
          approverId: activeRequest.CurrentApproverId || activeRequest.CurrentApprover,
          decision: 'APPROVED',
          currentApprover: activeRequest.CurrentApproverId || activeRequest.CurrentApprover,
          approvalFlow: activeRequest.ApprovalFlow,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      if (directMode && data.results?.some((result) => !result.success)) {
        throw new Error(data.results.find((result) => !result.success)?.error || 'Unable to approve this request.');
      }
      setActionPopup({
        title: 'Action completed',
        message: directMode
          ? 'Leave request approved.'
          : data.nextApprover ? `Approved. Next approver: ${data.nextApprover}` : 'Approved successfully.',
      });
      setExpandedId(null);
      await loadData();
    } catch (err) {
      setActionPopup({ title: 'Action failed', message: err.message || 'Approval failed', isError: true });
    }
  }

  async function handleRejectDetail() {
    if (!activeRequest) return;
    const reason = window.prompt('Rejection reason:');
    if (reason === null) return;
    try {
      const res = await fetch(directMode ? '/api/leave/approve-direct' : '/api/leave/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(directToken ? { Authorization: 'Bearer ' + directToken } : {}),
        },
        body: JSON.stringify({ ids: [activeRequest.Id], approverId: activeRequest.CurrentApproverId || activeRequest.CurrentApprover, decision: 'REJECTED', remarks: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reject failed');
      if (directMode && data.results?.some((result) => !result.success)) {
        throw new Error(data.results.find((result) => !result.success)?.error || 'Unable to reject this request.');
      }
      setActionPopup({ title: 'Action completed', message: 'Request rejected.' });
      setExpandedId(null);
      await loadData();
    } catch (err) {
      setActionPopup({ title: 'Action failed', message: err.message || 'Reject failed', isError: true });
    }
  }

  const approvedByList = activeRequest ? normalizeApproverList(activeRequest.ApprovedBy) : [];
  const isActionableRequest = Boolean(
    activeTab === 'pending'
    && activeRequest
    && !['APPROVED', 'REJECTED'].includes(String(activeRequest.Status || '').toUpperCase())
  );

  if (directMode && directLinkUnavailable) return null;

  return (
    <div className={`dashboardPage leaveFitScreenRoot${directMode ? ' directApprovalPage' : ''}`}>
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="leaveTabBar">
        <button
          type="button"
          className={`leaveTabButton ${activeTab === 'pending' ? 'leaveTabButtonActive' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          New leave requests
        </button>
        <button
          type="button"
          className={`leaveTabButton ${activeTab === 'approved' ? 'leaveTabButtonActive' : ''}`}
          onClick={() => setActiveTab('approved')}
        >
          Approved leaves
        </button>
      </div>

      <div className="leaveApprovalMessageWrap">
        {message && <p className="leaveApprovalMessage">{message}</p>}
      </div>

        {actionPopup && (
          <div className="leaveActionPopupOverlay" role="presentation">
            <section
              className={`leaveActionPopup${actionPopup.isError ? ' leaveActionPopupError' : ''}`}
              role="status"
              aria-live={actionPopup.isError ? 'assertive' : 'polite'}
            >
              <h2>{actionPopup.title}</h2>
              <p>{actionPopup.message}</p>
            </section>
          </div>
        )}

      {loading ? (
        <p className="leaveLoadingText">Loading...</p>
      ) : (
        <>
          {activeTab === 'pending' && (
            <div className="leaveTableCard leavePendingCard">
              <h2>New leave requests</h2>
              {pendingApprovals.length === 0 ? (
                <p>No pending approvals.</p>
              ) : (
                <>
                  <div className="leaveTableScrollWrapper leavePendingTableScrollWrapper">
                    <table className="leaveNoScrollTable">
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.size === pendingApprovals.length && pendingApprovals.length > 0}
                              onChange={selectAllToggle}
                            />
                          </th>
                          <th>Action</th>
                          <th>Emp ID</th>
                          <th>Emp Name</th>
                          <th>Dept</th>
                          <th>Section</th>
                          <th>Date Applied</th>
                          <th>Start Date</th>
                          <th>End Date</th>
                          <th>From Time</th>
                          <th>To Time</th>
                          <th>Days</th>
                          <th>Leave Type</th>
                          <th>Status</th>
                          <th>VPre Status</th>
                          <th>Pre Status</th>
                          <th>Reason</th>
                          <th>Current Approver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingApprovals.map((request, index) => renderRequestRow(request, true, index))}
                      </tbody>
                    </table>
                  </div>
                  <div className="leaveBulkActionsRow">
                    <button className="applyLeaveButton leaveBulkApproveButton" disabled={selectedIds.size === 0} onClick={() => handleBulkAction('APPROVED')}>Approve Selected</button>
                    {directMode && (
                      <button
                        className="applyLeaveButton leaveBulkRejectButton"
                        disabled={selectedIds.size === 0}
                        onClick={handleRejectSelected}
                      >
                        Reject Selected
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'approved' && (
            <div className="leaveTableCard leaveApprovedCard">
              <div className="leaveApprovedCardHeader">
                <h2>Approved leaves</h2>
                <div className="leaveFilterBar">
                  <input
                    className="leaveFilterSelect leaveApprovedSearch"
                    type="search"
                    value={approvedSearch}
                    onChange={(e) => setApprovedSearch(e.target.value)}
                    placeholder="Search approved leaves"
                    aria-label="Search approved leaves"
                  />
                  <select
                    className="leaveFilterSelect"
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                  >
                    <option value="all">All Months</option>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>
                  <input
                    className="leaveFilterSelect"
                    type="number"
                    min="1900"
                    step="1"
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    placeholder="Year"
                  />
                </div>
              </div>
              {filteredApproved.length === 0 ? (
                <p>
                  {approvedRequests.length === 0
                    ? 'No approved requests yet.'
                    : 'No approved requests match these filters.'}
                </p>
              ) : (
                <div className="leaveTableScrollWrapper leaveApprovedTableScrollWrapper">
                  <table className="leaveNoScrollTable">
                    <thead>
                      <tr>
                        <th>Emp ID</th>
                        <th>Action</th>
                        <th>Emp Name</th>
                        <th>Dept</th>
                        <th>Section</th>
                        <th>Date Applied</th>
                        <th>Start Date</th>
                        <th>End Date</th>
                        <th>From Time</th>
                        <th>To Time</th>
                        <th>Days</th>
                        <th>Leave Type</th>
                        <th>Status</th>
                        <th>VPre Status</th>
                        <th>Pre Status</th>
                        <th>Reason</th>
                        <th>Current Approver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApproved.map((request, index) => renderRequestRow(request, false, index))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeRequest && (
        <div className="leaveDetailOverlay" onClick={() => setExpandedId(null)}>
          <div className="leaveDetailCardWrap" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="leaveDetailCloseButton" onClick={() => setExpandedId(null)}>
              ×
            </button>

            <div className="leaveDetailCard">
              <div className="leaveDetailTable">
                <div className="leaveDetailRow leaveDetailRowHeader">
                  <div className="leaveDetailCell leaveDetailCellLabel">Balance Leaves :-</div>
                  <div className="leaveDetailCell">EL :- {activeRequest.EarnLeaveBalance ?? 0}</div>
                  <div className="leaveDetailCell">SL :- {activeRequest.SickLeaveBalance ?? 0}</div>
                  <div className="leaveDetailCell leaveDetailCellDate">
                    Date of Application :- <span className="leaveDetailHighlight">
                      {formatApplicationDate(activeRequest)}
                    </span>
                  </div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Employee Name :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.ApplicantName}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">Employee ID :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.ApplicantId}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Department :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.Department || '-'}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">Section :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.Section || '-'}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">From Time :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.FromTime || '-'}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">To Time :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.ToTime || '-'}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Shift :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.Shift || '-'}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">Employee Type :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.EmpType || '-'}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Leave Type :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.LeaveType}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">No of Days :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.TotalDays}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Leave Start Date :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">
                    {formatCalendarDate(activeRequest.StartDate)}
                  </div>
                  <div className="leaveDetailCell leaveDetailCellLabel">End Date :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">
                    {formatCalendarDate(activeRequest.EndDate)}
                  </div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Contact Number :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.ContactNumber || '-'}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">Reliever :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.RelieverName || activeRequest.RelieverId || '-'}</div>
                </div>

                <div className="leaveDetailRow leaveDetailRowReason">
                  <div className="leaveDetailCell leaveDetailCellLabel">Reason :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue leaveDetailCellSpan">{activeRequest.Reason || '-'}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Attachment :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue leaveDetailCellSpan">
                    {activeRequest.TranId && activeRequest.AttachmentName ? (
                      <a
                        href={`/api/leave/document/${activeRequest.TranId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#2563eb', textDecoration: 'underline' }}
                      >
                        {activeRequest.AttachmentName}
                      </a>
                    ) : (
                      activeRequest.AttachmentName || '-'
                    )}
                  </div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">HoD Status :-</div>
                  <div className={`leaveDetailCell leaveDetailCellValue ${getApprovalStatusClass(activeRequest.HodStatus)}`}>
                    {formatApprovalStatus(activeRequest.HodStatus, activeRequest.HodApproval)}
                  </div>
                  <div className="leaveDetailCell leaveDetailCellLabel">CCC Status :-</div>
                  <div className={`leaveDetailCell leaveDetailCellValue ${getApprovalStatusClass(activeRequest.CccStatus)}`}>
                    {formatApprovalStatus(activeRequest.CccStatus, activeRequest.CccApproval)}
                  </div>
                </div>
              </div>

              {isActionableRequest && (
                <div className="leaveDetailActions">
                  <button type="button" className="leaveDetailRejectButton" onClick={handleRejectDetail}>
                    Reject
                  </button>
                  <button type="button" className="leaveDetailApproveButton" onClick={handleApproveDetail}>
                    Accept
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}