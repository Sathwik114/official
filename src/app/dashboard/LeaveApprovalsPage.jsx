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

const LEAVE_TYPE_FILTER_OPTIONS = [
  { value: 'SL', label: 'SL' },
  { value: 'EL', label: 'EL (EL/P, P/EL)' },
  { value: 'LWP', label: 'LWP (LWP/P, P/LWP)' },
  { value: 'OD', label: 'OD' },
  { value: 'COFF', label: 'COFF (COFF/P, P/COFF)' },
  { value: 'P/7H', label: 'P/7H' },
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

function formatApprovalFlowEntry(approverId, fallbackName = '') {
  const id = String(approverId || '').trim();
  if (!id) return '';

  const aliasMap = {
    '100002': 'CCC',
    '100209': 'Linus',
  };
  const name = aliasMap[id] || fallbackName;
  return name || id;
}

function isApprovalPending(status) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  return !['ACCEPT', 'ACCEPTED', 'APPROVED'].includes(normalizedStatus);
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
  const [selectedApprovedIds, setSelectedApprovedIds] = useState(new Set());
  const [selectedFlowApprovers, setSelectedFlowApprovers] = useState({
    requestId: null,
    flow: '',
    names: [],
  });
  const [activeTab, setActiveTab] = useState('pending');
  const currentDate = new Date();
  const [pendingFilters, setPendingFilters] = useState({
    search: '',
    date: '',
    month: '',
    leaveType: '',
    mode: '',
    year: String(currentDate.getFullYear()),
  });
  const [approvedFilters, setApprovedFilters] = useState({
    search: '',
    date: '',
    month: '',
    leaveType: '',
    mode: '',
    year: String(currentDate.getFullYear()),
  });

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

  function filterRequests(requests, filters) {
    const query = filters.search.trim().toLowerCase();

    return requests.filter((request) => {
      const applicationDate = getCalendarDateParts(getDateValue(request));
      if (filters.mode === 'date' && filters.date) {
        const requestDate = applicationDate
          ? `${applicationDate.year}-${String(applicationDate.month).padStart(2, '0')}-${String(applicationDate.day).padStart(2, '0')}`
          : '';
        if (requestDate !== filters.date) return false;
      }

      if (filters.mode === 'month' && filters.month
        && (!applicationDate || applicationDate.month - 1 !== Number(filters.month))) return false;
      if (filters.year
        && (!applicationDate || applicationDate.year !== Number(filters.year))) return false;
      if (filters.mode === 'leave' && filters.leaveType) {
        const requestLeaveType = String(request.LeaveType || '').trim().toUpperCase();
        const selectedLeaveType = filters.leaveType.toUpperCase();
        const matchesLeaveType = ['EL', 'LWP', 'COFF'].includes(selectedLeaveType)
          ? requestLeaveType === selectedLeaveType
            || requestLeaveType.startsWith(`${selectedLeaveType}/`)
            || requestLeaveType.endsWith(`/${selectedLeaveType}`)
          : requestLeaveType === selectedLeaveType
            || (selectedLeaveType === 'P/7H' && requestLeaveType === '1HOUR');
        if (!matchesLeaveType) return false;
      }
      if (!query) return true;

      return [
        'View Form',
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
        formatRequestStatus(request.Status),
        formatApprovalStatus(request.HodStatus, request.HodApproval),
        formatApprovalStatus(request.CccStatus, request.CccApproval),
        request.Reason,
        request.CurrentApprover,
      ].some((value) => String(value ?? '').toLowerCase().includes(query));
    });
  }

  function updateFilters(setFilters, field, value) {
    setFilters((filters) => ({ ...filters, [field]: value }));
  }

  function updateFilterMode(setFilters, mode) {
    setFilters((filters) => ({
      ...filters,
      mode,
      date: '',
      month: '',
      leaveType: '',
    }));
  }

  function clearFilters(setFilters) {
    setFilters((filters) => ({
      ...filters,
      date: '',
      month: '',
      leaveType: '',
      mode: '',
      year: String(currentDate.getFullYear()),
    }));
  }

  function renderFilterBar(filters, setFilters, label, searchPlaceholder) {
    return (
      <div className="leaveFilterBar">
        <input
          className="leaveFilterSelect leaveRequestSearch"
          type="search"
          value={filters.search}
          onChange={(event) => updateFilters(setFilters, 'search', event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        <select
          className="leaveFilterSelect"
          value={filters.mode}
          onChange={(event) => updateFilterMode(setFilters, event.target.value)}
          aria-label={`Choose a filter for ${label}`}
        >
          <option value="">Select filter</option>
          <option value="date">Date</option>
          <option value="month">Month</option>
          <option value="leave">Leave type</option>
        </select>
        {filters.mode === 'date' && (
          <input
            className="leaveFilterSelect"
            type="date"
            value={filters.date}
            onChange={(event) => updateFilters(setFilters, 'date', event.target.value)}
            aria-label={`Filter ${label} by application date`}
          />
        )}
        {filters.mode === 'month' && (
          <select
            className="leaveFilterSelect"
            value={filters.month}
            onChange={(event) => updateFilters(setFilters, 'month', event.target.value)}
            aria-label={`Filter ${label} by month`}
          >
            <option value="">All</option>
            {MONTH_NAMES.map((month, index) => (
              <option key={month} value={index}>{month}</option>
            ))}
          </select>
        )}
        {filters.mode === 'leave' && (
          <select
            className="leaveFilterSelect"
            value={filters.leaveType}
            onChange={(event) => updateFilters(setFilters, 'leaveType', event.target.value)}
            aria-label={`Filter ${label} by leave type`}
          >
            <option value="">All</option>
            {LEAVE_TYPE_FILTER_OPTIONS.map((leaveType) => (
              <option key={leaveType.value} value={leaveType.value}>{leaveType.label}</option>
            ))}
          </select>
        )}
        <label className="leaveYearFilter">
          <span>Year</span>
          <input
            className="leaveFilterSelect"
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={filters.year}
            onChange={(event) => updateFilters(setFilters, 'year', event.target.value.replace(/\D/g, ''))}
            aria-label={`Filter ${label} by year`}
          />
        </label>
        {(filters.mode || filters.year) && (
          <button
            type="button"
            className="leaveClearFiltersButton"
            onClick={() => clearFilters(setFilters)}
          >
            Clear
          </button>
        )}
      </div>
    );
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
        {isPending ? (
          <td style={{ textAlign: 'center' }}>
            <input type="checkbox" checked={selectedIds.has(request.Id)} onChange={() => toggleSelect(request.Id)} />
          </td>
        ) : (
          <td style={{ textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={selectedApprovedIds.has(request.Id)}
              onChange={() => toggleApprovedSelect(request.Id)}
              aria-label={`Select approved leave for ${request.ApplicantName || request.ApplicantId || 'employee'}`}
            />
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
  const filteredPending = filterRequests(pendingApprovals, pendingFilters);
  const filteredApproved = filterRequests(approvedRequests, approvedFilters);
  const selectedPendingRequests = pendingApprovals.filter((request) => selectedIds.has(request.Id));
  const selectedApprovedRequests = approvedRequests.filter((request) => selectedApprovedIds.has(request.Id));
  const isMultiFlowSelection = activeTab === 'pending' && selectedPendingRequests.length > 1;
  const isMultiApprovedFlowSelection = activeTab === 'approved' && selectedApprovedRequests.length > 1;
  const allVisiblePendingSelected = filteredPending.length > 1
    && filteredPending.every((request) => selectedIds.has(request.Id));
  const allVisibleApprovedSelected = filteredApproved.length > 1
    && filteredApproved.every((request) => selectedApprovedIds.has(request.Id));
  const hasSinglePendingSelection = selectedPendingRequests.length === 1;
  const hasSingleApprovedSelection = selectedApprovedRequests.length === 1;
  const isPendingFlowOverview = activeTab === 'pending'
    && (!hasSinglePendingSelection || allVisiblePendingSelected);
  const isApprovedFlowOverview = activeTab === 'approved'
    && (!hasSingleApprovedSelection || allVisibleApprovedSelected);
  const flowRequest = activeTab === 'pending'
    ? selectedPendingRequests[0]
    : selectedApprovedRequests[0];
  const flowRequestId = flowRequest?.Id;
  const flowDefinition = flowRequest?.ApprovalFlow || '';

  useEffect(() => {
    let cancelled = false;
    const approverIds = normalizeApproverList(flowDefinition);

    async function resolveApprovers() {
      const resolved = await Promise.all(approverIds.map(async (approverId) => {
        const id = String(approverId || '').trim();
        if (!id) return '';
        if (id === '100002' || id === '100209') return formatApprovalFlowEntry(id);

        try {
          const response = await fetch(`/api/employee?empcode=${encodeURIComponent(id)}`);
          if (!response.ok) throw new Error(`Employee lookup failed with status ${response.status}`);
          const data = await response.json();
          return formatApprovalFlowEntry(id, data.employee?.EmpName || '');
        } catch (error) {
          console.error('Approval flow lookup failed:', error);
          return formatApprovalFlowEntry(id);
        }
      }));

      if (!cancelled) {
        setSelectedFlowApprovers({
          requestId: flowRequestId,
          flow: flowDefinition,
          names: resolved.filter(Boolean),
        });
      }
    }

    if (flowRequestId && flowDefinition) resolveApprovers();

    return () => {
      cancelled = true;
    };
  }, [flowRequestId, flowDefinition]);

  function renderApprovalFlow() {
    if (!flowRequest && !isMultiFlowSelection && !isMultiApprovedFlowSelection
      && !isPendingFlowOverview && !isApprovedFlowOverview) {
      return (
        <div className="leaveApprovalFlowBanner" aria-label="Leave approval flow">
          <span className="leaveApprovalFlowLabel">FLOW:</span>
          <span className="leaveApprovalFlowPrompt">Please select a leave request to see the flow</span>
        </div>
      );
    }

    const showGenericFlow = isPendingFlowOverview || isApprovedFlowOverview;
    const multiSelectedRequests = isMultiFlowSelection
      ? selectedPendingRequests
      : isMultiApprovedFlowSelection ? selectedApprovedRequests : [];
    const vicePresidentPending = isMultiFlowSelection
      ? multiSelectedRequests.some((request) => isApprovalPending(request.HodStatus))
      : isApprovalPending(flowRequest?.HodStatus);
    const presidentPending = isMultiFlowSelection
      ? multiSelectedRequests.some((request) => isApprovalPending(request.CccStatus))
      : isApprovalPending(flowRequest?.CccStatus);
    const applicantName = String(flowRequest?.ApplicantName || '').trim();
    const applicant = !showGenericFlow && applicantName
      ? `Applicant (${applicantName})`
      : 'Applicant';
    const resolvedApprovers = selectedFlowApprovers.requestId === flowRequest?.Id
      && selectedFlowApprovers.flow === flowDefinition
      ? selectedFlowApprovers.names
      : [];
    const hasApprovers = normalizeApproverList(flowDefinition).length > 0;
    const vicePresident = showGenericFlow
      ? 'V/Pre (Jeyaram / Linus)'
      : `V/Pre (${resolvedApprovers[0] || (hasApprovers ? 'Loading...' : 'Not configured')})`;
    const president = showGenericFlow
      ? 'Pre (CCC)'
      : `Pre (${resolvedApprovers[1] || (hasApprovers ? 'Loading...' : 'Not configured')})`;
    const applicantClass = showGenericFlow
      ? 'leaveApprovalFlowOverviewStep'
      : 'leaveApprovalFlowComplete';
    const vicePresidentClass = showGenericFlow
      ? 'leaveApprovalFlowOverviewStep'
      : vicePresidentPending ? 'leaveApprovalFlowPending' : 'leaveApprovalFlowComplete';
    const presidentClass = showGenericFlow
      ? 'leaveApprovalFlowOverviewStep'
      : presidentPending ? 'leaveApprovalFlowPending' : 'leaveApprovalFlowComplete';

    return (
      <div className="leaveApprovalFlowBanner" aria-label="Leave approval flow">
        <span className="leaveApprovalFlowLabel">FLOW: </span>
        <span className={`leaveApprovalFlowStep ${applicantClass}`}>{applicant}</span>
        <span className="leaveApprovalFlowArrow" aria-hidden="true">→</span>
        <span className={`leaveApprovalFlowStep ${vicePresidentClass}`}>
          {vicePresident}
        </span>
        <span className="leaveApprovalFlowArrow" aria-hidden="true">→</span>
        <span className={`leaveApprovalFlowStep ${presidentClass}`}>
          {president}
        </span>
      </div>
    );
  }

  function selectAllToggle() {
    const visibleIds = filteredPending.map((request) => request.Id);
    const allVisibleSelected = visibleIds.length > 0
      && visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((previous) => {
      const next = new Set(previous);
      visibleIds.forEach((id) => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }

  function toggleApprovedSelect(id) {
    setSelectedApprovedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllApprovedToggle() {
    const visibleIds = filteredApproved.map((request) => request.Id);
    const allVisibleSelected = visibleIds.length > 0
      && visibleIds.every((id) => selectedApprovedIds.has(id));

    setSelectedApprovedIds((previous) => {
      const next = new Set(previous);
      visibleIds.forEach((id) => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }

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
          onClick={() => {
            setActiveTab('pending');
            setSelectedRowId(null);
          }}
        >
          New leave requests
        </button>
        <button
          type="button"
          className={`leaveTabButton ${activeTab === 'approved' ? 'leaveTabButtonActive' : ''}`}
          onClick={() => {
            setActiveTab('approved');
            setSelectedRowId(null);
          }}
        >
          Approved leaves
        </button>
        {renderApprovalFlow()}
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
              <div className="leaveApprovedCardHeader leaveRequestCardHeader">
                <h2>New leave requests</h2>
                {renderFilterBar(pendingFilters, setPendingFilters, 'new leave requests', 'Search new leave requests')}
              </div>
              {filteredPending.length === 0 ? (
                <p>
                  {pendingApprovals.length === 0
                    ? 'No pending approvals.'
                    : 'No pending requests match these filters.'}
                </p>
              ) : (
                <>
                  <div className="leaveTableScrollWrapper leavePendingTableScrollWrapper">
                    <table className="leaveNoScrollTable">
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={filteredPending.length > 0
                                && filteredPending.every((request) => selectedIds.has(request.Id))}
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
                        {filteredPending.map((request, index) => renderRequestRow(request, true, index))}
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
              <div className="leaveApprovedCardHeader leaveRequestCardHeader">
                <h2>Approved leaves</h2>
                {renderFilterBar(approvedFilters, setApprovedFilters, 'approved leaves', 'Search leaves')}
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
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={filteredApproved.length > 0
                              && filteredApproved.every((request) => selectedApprovedIds.has(request.Id))}
                            onChange={selectAllApprovedToggle}
                            aria-label="Select all visible approved leaves"
                          />
                        </th>
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