'use client';

import { useEffect, useState } from 'react';
import { formatCalendarDate } from '@/lib/leaveDateUtils';

async function fetchEmployeeProfile(empcode) {
  try {
    const res = await fetch(`/api/employee?empcode=${encodeURIComponent(empcode)}&monitor=true`);
    const data = await res.json();
    return res.ok ? data.employee : null;
  } catch (error) {
    console.error('Failed to fetch employee profile:', error);
    return null;
  }
}

// Sorts attendance records by AttDate, oldest first.
function sortAttendanceAsc(records) {
  return [...records].sort((a, b) => new Date(a.AttDate) - new Date(b.AttDate));
}

// Sorts leave records by FromDate, newest first.
function sortLeaveDesc(records) {
  return [...records].sort((a, b) => new Date(b.FromDate) - new Date(a.FromDate));
}

export default function MonitorHodPage({ hodList = [] }) {
  // viewMode: 'list' | 'attendance' | 'leave'
  const [viewMode, setViewMode] = useState('list');
  const [selectedEmpCode, setSelectedEmpCode] = useState('');

  const [attendance, setAttendance] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [loading, setLoading] = useState(false);

  const [leaveRecords, setLeaveRecords] = useState([]);
  const [leaveEmployee, setLeaveEmployee] = useState(null);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const [hodProfiles, setHodProfiles] = useState({});
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);
  const [exportingLeave, setExportingLeave] = useState(false);
  const leaveHeaderEmployee = hodProfiles[selectedEmpCode];

  useEffect(() => {
    document.documentElement.classList.add('monitorHodDocument');
    document.body.classList.add('monitorHodDocument');

    return () => {
      document.documentElement.classList.remove('monitorHodDocument');
      document.body.classList.remove('monitorHodDocument');
    };
  }, []);

  useEffect(() => {
    async function loadProfiles() {
      const profiles = {};
      for (const hod of hodList) {
        const profile = await fetchEmployeeProfile(hod.id);
        profiles[hod.id] = profile;
      }
      setHodProfiles(profiles);
    }

    loadProfiles();
  }, [hodList]);

  useEffect(() => {
    if (!selectedEmpCode || viewMode !== 'attendance') return undefined;

    let active = true;
    async function fetchAttendance() {
      try {
        const res = await fetch(`/api/employee?empcode=${selectedEmpCode}&month=${month}&year=${year}&monitor=true`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load attendance.');
        if (active && data.attendance) {
          setAttendance(sortAttendanceAsc(data.attendance));
          setSelectedEmployee(data.employee || null);
        }
      } catch (err) {
        console.error('Failed to load attendance:', err);
        if (active) {
          setAttendance([]);
          setSelectedEmployee(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchAttendance();
    return () => {
      active = false;
    };
  }, [selectedEmpCode, viewMode, month, year]);

  useEffect(() => {
    if (!selectedEmpCode || viewMode !== 'leave') return undefined;

    let active = true;
    async function fetchLeave() {
      try {
        const res = await fetch(`/api/leave-history?empcode=${encodeURIComponent(selectedEmpCode)}&year=${year}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load leave records.');
        if (active) {
          setLeaveRecords(sortLeaveDesc(data.leave || []));
          setLeaveEmployee(data.employee || null);
        }
      } catch (err) {
        console.error('Failed to load leave records:', err);
        if (active) {
          setLeaveRecords([]);
          setLeaveEmployee(null);
        }
      } finally {
        if (active) setLeaveLoading(false);
      }
    }

    fetchLeave();
    return () => {
      active = false;
    };
  }, [selectedEmpCode, viewMode, year]);

  function handleViewAttendance(empcode) {
    setSelectedEmpCode(empcode);
    setLoading(true);
    setViewMode('attendance');
  }

  function handleViewLeave(empcode) {
    setSelectedEmpCode(empcode);
    setLeaveLoading(true);
    setViewMode('leave');
  }

  function handleCloseDetail() {
    setSelectedEmpCode('');
    setViewMode('list');
    setAttendance([]);
    setSelectedEmployee(null);
    setLeaveRecords([]);
    setLeaveEmployee(null);
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Builds the .xlsx file from the currently loaded attendance rows and
  // triggers a browser download. Uses the `xlsx` (SheetJS) package.
  async function handleDownloadExcel() {
    if (!attendance.length) return;

    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      const rows = attendance.map((record) => ({
        Date: formatCalendarDate(record.AttDate),
        'Attendance Type': record.AttType || '-',
        'In Time': record.InTime || '-',
        'Out Time': record.OutTime || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

      const empLabel = (selectedEmployee?.EmpName || selectedEmpCode || 'employee')
        .toString()
        .replace(/[^a-z0-9]+/gi, '_');
      const fileName = `Attendance_${empLabel}_${monthNames[month - 1]}_${year}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Failed to export attendance to Excel:', err);
    } finally {
      setExporting(false);
    }
  }

  // Builds the .xlsx file from the currently loaded leave rows and
  // triggers a browser download. Uses the `xlsx` (SheetJS) package.
  async function handleDownloadLeaveExcel() {
    if (!leaveRecords.length) return;

    setExportingLeave(true);
    try {
      const XLSX = await import('xlsx');

      const rows = leaveRecords.map((record) => ({
        'From Date': formatCalendarDate(record.FromDate),
        'To Date': formatCalendarDate(record.ToDate),
        'From Time': record.FromTime || '-',
        'To Time': record.ToTime || '-',
        'Leave Type': record.LeaveType || '-',
        'No. of Days': record.NoofDays ?? '-',
        Reason: record.Reason || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 12 }, { wch: 30 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leave');

      const empLabel = (leaveEmployee?.EmpName || selectedEmpCode || 'employee')
        .toString()
        .replace(/[^a-z0-9]+/gi, '_');
      const fileName = `Leave_${empLabel}_${year}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Failed to export leave to Excel:', err);
    } finally {
      setExportingLeave(false);
    }
  }

  return (
    <div className="dashboardPage monitorHodPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="dashboardAttendance">
        {viewMode === 'list' ? (
          <div className="hodTableWrapper">
            <div className="scrollableTableWrapper hodListWrapper">
              <table className="attendanceTable hodListTable">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Emp ID</th>
                    <th>Emp Name</th>
                    <th>Dept</th>
                    <th>Section</th>
                    <th>Desig</th>
                    <th>Joining Date</th>
                    <th>View</th>
                  </tr>
                </thead>
                <tbody>
                  {hodList.map((hod, index) => {
                    const profile = hodProfiles[hod.id];
                    return (
                      <tr key={hod.id}>
                        <td>{index + 1}</td>
                        <td>{hod.id}</td>
                        <td>{profile?.EmpName || '-'}</td>
                        <td>{profile?.DeptCode || '-'}</td>
                        <td>{profile?.Section || '-'}</td>
                        <td>{profile?.Designation || '-'}</td>
                        <td>{formatCalendarDate(profile?.JoinDate)}</td>
                        <td className="hodViewCell">
                          <div className="hodActionsCell">
                            <button
                              type="button"
                              className="viewAttendanceButton"
                              onClick={() => handleViewAttendance(hod.id)}
                            >
                              👁️ View Attendance
                            </button>
                            <button
                              type="button"
                              className="viewLeaveButton"
                              onClick={() => handleViewLeave(hod.id)}
                            >
                              📋 View Leaves
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === 'attendance' ? (
          <>
            <div className="hodFilterBar">
              <button
                type="button"
                className="backToListButton"
                onClick={handleCloseDetail}
              >
                ← Back to List
              </button>

              <div className="hodDetailFilterControls">
                <div className="hodFilterField">
                  <label>Month:</label>
                  <select
                    value={month}
                    onChange={(e) => {
                      setLoading(true);
                      setMonth(parseInt(e.target.value));
                    }}
                  >
                    {monthNames.map((m, i) => (
                      <option key={i} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hodFilterField">
                  <label>Year:</label>
                  <input
                    type="number"
                    className="yearInput"
                    value={year}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setLoading(true);
                      setYear(Number.isNaN(val) ? new Date().getFullYear() : val);
                    }}
                    min="2000"
                    max="2100"
                  />
                </div>

                <button
                  type="button"
                  className="downloadExcelButton"
                  onClick={handleDownloadExcel}
                  disabled={exporting || loading || attendance.length === 0}
                >
                  {exporting ? 'Exporting…' : '⬇️ Download Excel'}
                </button>
              </div>
            </div>

            <div className="hodSelectedInfo">
              <div>
                <strong>Selected:</strong>
                <span className="hodHighlightValue">
                  {selectedEmployee?.EmpName || selectedEmpCode}
                </span>
              </div>
              <div>
                <strong>Department:</strong>
                <span className="hodHighlightValue">
                  {selectedEmployee?.DeptCode || '-'}
                </span>
              </div>
            </div>

            {loading ? (
              <p>Loading attendance data...</p>
            ) : attendance.length === 0 ? (
              <p>No attendance records found for the selected employee.</p>
            ) : (
              <div className="hodTableWrapper">
                <div className="scrollableTableWrapper attendanceDetailWrapper">
                  <table className="attendanceTable attendanceDetailTable">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>In Time</th>
                        <th>Out Time</th>
                        <th>Attendance Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((record, idx) => {
                        const rowKey = `${record.Empcode || selectedEmpCode}-${record.AttDate ? new Date(record.AttDate).toISOString() : idx}`;
                        return (
                          <tr key={rowKey}>
                            <td>{formatCalendarDate(record.AttDate)}</td>
                            <td>{record.InTime || '-'}</td>
                            <td>{record.OutTime || '-'}</td>
                            <td>{record.AttType || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="hodFilterBar">
              <button
                type="button"
                className="backToListButton"
                onClick={handleCloseDetail}
              >
                ← Back to List
              </button>

              <div className="hodDetailFilterControls">
                <div className="hodFilterField">
                  <label>Year:</label>
                  <input
                    type="number"
                    className="yearInput"
                    value={year}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setLeaveLoading(true);
                      setYear(Number.isNaN(val) ? new Date().getFullYear() : val);
                    }}
                    min="2000"
                    max="2100"
                  />
                </div>

                <button
                  type="button"
                  className="downloadExcelButton"
                  onClick={handleDownloadLeaveExcel}
                  disabled={exportingLeave || leaveLoading || leaveRecords.length === 0}
                >
                  {exportingLeave ? 'Exporting…' : '⬇️ Download Excel'}
                </button>
              </div>
            </div>

            <div className="leaveInfoGrid">
              <div>
                <strong>Empcode:</strong>
                <span className="hodHighlightValue">
                  {leaveHeaderEmployee?.EmpCode || selectedEmpCode}
                </span>
              </div>
              <div>
                <strong>Empname:</strong>
                <span className="hodHighlightValue">
                  {leaveHeaderEmployee?.EmpName || '-'}
                </span>
              </div>
              <div>
                <strong>Department:</strong>
                <span className="hodHighlightValue">
                  {leaveHeaderEmployee?.DeptCode || '-'}
                </span>
              </div>
              <div>
                <strong>Section:</strong>
                <span className="hodHighlightValue">
                  {leaveHeaderEmployee?.Section || '-'}
                </span>
              </div>
            </div>

            {leaveLoading ? (
              <p>Loading leave records...</p>
            ) : leaveRecords.length === 0 ? (
              <p>No leave records found for the selected employee.</p>
            ) : (
              <div className="hodTableWrapper leaveRecordsTableWrapper">
                <div className="scrollableTableWrapper leaveDetailWrapper">
                  <table className="attendanceTable leaveDetailTable">
                    <thead>
                      <tr>
                        <th>S.No</th>
                        <th>From Date</th>
                        <th>To Date</th>
                        <th>From Time</th>
                        <th>To Time</th>
                        <th>Leave Type</th>
                        <th>No. of Days</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveRecords.map((record, idx) => {
                        const rowKey = `${record.Empcode || selectedEmpCode}-${record.FromDate || idx}-${idx}`;
                        return (
                          <tr key={rowKey}>
                            <td>{idx + 1}</td>
                            <td>{formatCalendarDate(record.FromDate)}</td>
                            <td>{formatCalendarDate(record.ToDate)}</td>
                            <td>{record.FromTime || '-'}</td>
                            <td>{record.ToTime || '-'}</td>
                            <td>{record.LeaveType || '-'}</td>
                            <td>{record.NoofDays ?? '-'}</td>
                            <td>{record.Reason || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}