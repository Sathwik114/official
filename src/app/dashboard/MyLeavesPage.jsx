'use client';

import './MyLeavesPage.css';
import { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { formatCalendarDate, getCalendarDateParts } from '@/lib/leaveDateUtils';

function formatDisplayDate(value) {
  return formatCalendarDate(value);
}

function formatStatus(value) {
  if (!value || String(value).trim() === '') return 'Waiting';
  const normalized = String(value).trim();
  if (/^accept(ed)?$/i.test(normalized)) return 'Accept';
  if (/^reject(ed)?$/i.test(normalized)) return 'Reject';
  return normalized;
}

function getStatusClass(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized || normalized === 'PENDING' || normalized === 'WAITING') return 'leaveApprovalStatusWaiting';
  if (normalized === 'ACCEPT' || normalized === 'ACCEPTED' || normalized === 'APPROVED') return 'leaveApprovalStatusAccepted';
  if (normalized === 'REJECT' || normalized === 'REJECTED') return 'leaveApprovalStatusRejected';
  return '';
}

const CUTOFF_DATE = new Date('2026-09-30T23:59:59.999Z');

function formatDays(val) {
  if (val === undefined || val === null || val === '') return '-';
  const num = Number(val);
  return isNaN(num) ? val : num;
}

function resolveTotalDays(request) {
  const reqDate = new Date(request.StartDate || request.DateApplied || request.CreatedAt);
  const isLegacy = !isNaN(reqDate.getTime()) && reqDate <= CUTOFF_DATE;
  const daysRaw = isLegacy
    ? (request.NoofDays !== undefined && request.NoofDays !== null ? request.NoofDays : request.TotalDays)
    : (request.TotalDays !== undefined && request.TotalDays !== null ? request.TotalDays : request.NoofDays);
  return formatDays(daysRaw);
}

export default function MyLeavesPage() {
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [leaveFilter, setLeaveFilter] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch('/api/leave');
        const data = await res.json();
        if (res.ok) {
          setMyRequests(data.myRequests || []);
        }
      } catch (err) {
        console.error('Failed to load leave requests:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filteredRequests = useMemo(() => {
      return myRequests
        .filter((request) => {
          const requestDateValue = request.DateApplied || request.CreatedAt || request.StartDate;
          if (!requestDateValue) return false;
          const requestDate = getCalendarDateParts(requestDateValue);
          if (!requestDate) return false;

          const dateKey = `${requestDate.year}-${String(requestDate.month).padStart(2, '0')}-${String(requestDate.day).padStart(2, '0')}`;
          if (dateFilter && dateKey !== dateFilter) {
            return false;
          }
          if (monthFilter && String(requestDate.month).padStart(2, '0') !== monthFilter) {
            return false;
          }
          if (leaveFilter) {
            const requestLeaveType = String(request.LeaveType || '').trim().toUpperCase();
            const selectedLeaveType = leaveFilter.toUpperCase();
            const matchesLeaveType = selectedLeaveType === '1HOUR'
              ? ['1HOUR', 'P/7H'].includes(requestLeaveType)
              : requestLeaveType === selectedLeaveType
                || requestLeaveType.startsWith(`${selectedLeaveType}/`)
                || requestLeaveType.endsWith(`/${selectedLeaveType}`);
            if (!matchesLeaveType) return false;
          }
          if (yearFilter && String(requestDate.year) !== yearFilter) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const dateA = new Date(a.DateApplied || a.CreatedAt || a.StartDate);
          const dateB = new Date(b.DateApplied || b.CreatedAt || b.StartDate);
          return dateB - dateA; // newest first
        });
    }, [myRequests, dateFilter, monthFilter, leaveFilter, yearFilter]);

  const hasActiveFilters = dateFilter || monthFilter || leaveFilter || yearFilter;
  const handleFilterModeChange = (event) => {
    const nextMode = event.target.value;
    setFilterMode(nextMode);
    setDateFilter('');
    setMonthFilter('');
    setLeaveFilter('');
  };

  const clearAllFilters = () => {
    setDateFilter('');
    setMonthFilter('');
    setLeaveFilter('');
    setYearFilter('');
  };

  const monthOptions = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  const totalRows = filteredRequests.length;

  const handleExportExcel = () => {
    const exportRows = filteredRequests.map((request, index) => ({
      'No.': totalRows - index,
      'Emp ID': request.ApplicantId || '-',
      'Emp Name': request.ApplicantName || '-',
      'Dept': request.Department || '-',
      'Section': request.Section || '-',
      'Leave Type': request.LeaveType || '-',
      'Start Date': formatDisplayDate(request.StartDate || request.FromDate),
      'End Date': formatDisplayDate(request.EndDate || request.ToDate),
      'From Time': request.FromTime || '-',
      'To Time': request.ToTime || '-',
      'Total Days': resolveTotalDays(request),
      'VPre Aprvl': formatStatus(request.HodStatus),
      'Pre Aprvl': formatStatus(request.CccStatus),
      'Attachment': request.AttachmentName || '-',
      'Reason': request.Reason || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'My Leaves');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `my-leaves-${today}.xlsx`);
  };

  return (
    <div className="dashboardPage myLeavesPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="dashboardAttendance">
        <div className="tableFilterBar">
          <h1 className="dashboardHeaderTitle">My Leaves</h1>

          <label htmlFor="filterMode">Filter by:</label>
          <select
            id="filterMode"
            value={filterMode}
            onChange={handleFilterModeChange}
          >
            <option value="">Select filter</option>
            <option value="date">Date</option>
            <option value="month">Month</option>
            <option value="leave">Leave type</option>
          </select>

          {filterMode === 'date' && (
            <>
              <label htmlFor="dateFilter">Date:</label>
              <input
                type="date"
                id="dateFilter"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </>
          )}

          {filterMode === 'month' && (
            <>
              <label htmlFor="monthFilter">Month:</label>
              <select
                id="monthFilter"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              >
                <option value="">All</option>
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </>
          )}

          {filterMode === 'leave' && (
            <>
              <label htmlFor="leaveFilter">Leave type:</label>
              <select
                id="leaveFilter"
                value={leaveFilter}
                onChange={(e) => setLeaveFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="EL">EL</option>
                <option value="SL">SL</option>
                <option value="OD">OD</option>
                <option value="LWP">LWP</option>
                <option value="1Hour">1 hour</option>
                <option value="COFF">COFF</option>
              </select>
            </>
          )}

          <label htmlFor="yearFilter">Year:</label>
          <input
            type="text"
            id="yearFilter"
            inputMode="numeric"
            maxLength={4}
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value.replace(/\D/g, ''))}
            className="yearFilterInput"
            aria-label="Filter by year"
          />

          {hasActiveFilters && (
            <button type="button" onClick={clearAllFilters} className="clearFilterBtn">
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="exportExcelBtn"
            disabled={filteredRequests.length === 0}
          >
            Download Excel
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : filteredRequests.length === 0 ? (
          <p>No leave requests found.</p>
        ) : (
          <div className="tableScrollWrapper">
            <table className="attendanceTable">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Emp ID</th>
                  <th>Emp Name</th>
                  <th>Dept</th>
                  <th>Section</th>
                  <th>Leave Type</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>From Time</th>
                  <th>To Time</th>
                  <th>Total Days</th>
                  <th>VPre Aprvl</th>
                  <th>Pre Aprvl</th>
                  <th>Attachment</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request, index) => (
                  <tr
                    key={request.Id}
                    className={selectedRequestId === String(request.Id) ? 'selectedLeaveRow' : ''}
                    aria-selected={selectedRequestId === String(request.Id)}
                    onClick={() => setSelectedRequestId(String(request.Id))}
                  >
                    <td>{totalRows - index}</td>
                    <td>{request.ApplicantId || '-'}</td>
                    <td>{request.ApplicantName || '-'}</td>
                    <td>{request.Department || '-'}</td>
                    <td>{request.Section || '-'}</td>
                    <td>{request.LeaveType}</td>
                    <td>{formatDisplayDate(request.StartDate || request.FromDate)}</td>
                    <td>{formatDisplayDate(request.EndDate || request.ToDate)}</td>
                    <td>{request.FromTime || '-'}</td>
                    <td>{request.ToTime || '-'}</td>
                    <td>{resolveTotalDays(request)}</td>
                    <td className={getStatusClass(request.HodStatus)}>{formatStatus(request.HodStatus)}</td>
                    <td className={getStatusClass(request.CccStatus)}>{formatStatus(request.CccStatus)}</td>
                    <td>
                      {request.TranId && request.AttachmentName ? (
                        <a
                          href={`/api/leave/document/${request.TranId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#2563eb', textDecoration: 'underline' }}
                        >
                          {request.AttachmentName}
                        </a>
                      ) : (
                        request.AttachmentName || '-'
                      )}
                    </td>
                    <td className="leaveReasonCell" title={request.Reason || ''}>
                      <span className="leaveReasonText">{request.Reason || '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}