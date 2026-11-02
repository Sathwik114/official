import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as jose from 'jose';
import { getLeaveApprovalApplicantIds, isHrUser } from '@/lib/leaveApprovalConfig';
import { getAllLeaveData } from '@/lib/attendanceDb';
import { getAllLeaveRequestsArchive } from '@/lib/leaveDb';
import { getEmployeeDetailsForIds } from '@/lib/payrollDb';
import { getCalendarDateParts } from '@/lib/leaveDateUtils';
import AllLeavesFilters from './AllLeavesFilters';
import AllLeavesTable from './AllLeavesTable';
import './all-leaves.css';

// Groups certain leave types together under one filter value
function matchesLeaveType(leaveType, filter) {
  if (!filter) return true;
  if (!leaveType) return false;
  const lt = leaveType.trim().toUpperCase();

  switch (filter) {
    case 'EL':
      return lt === 'EL' || lt === 'P/EL' || lt === 'EL/P';
    case 'LWP':
      return lt === 'LWP' || lt === 'P/LWP' || lt === 'LWP/P';
    case 'SL':
      return lt === 'SL';
    case 'OD':
      return lt === 'OD';
    case 'COFF':
      return lt === 'COFF' || lt === 'COFF/P' || lt === 'P/COFF' || lt.replace(/\s+/g, '') === 'COFF/P' || lt.replace(/\s+/g, '') === 'P/COFF';
    case 'P/7H':
      return lt === 'P/7H';
    default:
      return lt === filter.toUpperCase();
  }
}

export default async function AllLeavesPage({ searchParams }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  let currentUserId = '';

  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);
      currentUserId = String(payload.username || payload.name || '').trim();
    } catch (err) {
      console.error('JWT Error:', err);
    }
  }

  if (!(await isHrUser(currentUserId))) {
    redirect('/dashboard');
  }

  let leaves = [];
  try {
    const applicantIds = await getLeaveApprovalApplicantIds();
    const [onlineLeaves, archivedSpecialLeaves] = await Promise.all([
      getAllLeaveData(applicantIds),
      getAllLeaveRequestsArchive(applicantIds),
    ]);
    const seen = new Set();
    leaves = [...onlineLeaves, ...archivedSpecialLeaves].filter((leave) => {
      const key = [
        leave.ApplicantId,
        leave.LeaveType,
        leave.StartDate,
        leave.EndDate,
      ].map((value) => String(value || '').trim()).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    try {
      const employeeDetails = await getEmployeeDetailsForIds(
        leaves.map((leave) => leave.ApplicantId)
      );
      const employeeDetailsById = new Map(
        employeeDetails.map((employee) => [
          String(employee.ApplicantId || '').trim(),
          employee,
        ])
      );

      leaves = leaves.map((leave) => {
        const employee = employeeDetailsById.get(
          String(leave.ApplicantId || '').trim()
        );
        if (!employee) return leave;

        return {
          ...leave,
          ApplicantName: employee.ApplicantName || leave.ApplicantName,
          Department: employee.Department || leave.Department,
          Section: employee.Section || leave.Section,
        };
      });
    } catch (error) {
      console.error('Failed to load employee details for all leave requests:', error);
    }
  } catch (error) {
    console.error('Failed to load all leave requests:', error);
    leaves = [];
  }

  // Next.js 15: searchParams is async
  const params = await searchParams;
  const now = new Date();
  const selectedYear = params?.year || '2026'; // default year

  // 'month' distinguishes three states:
  //  - param absent            -> default to current month
  //  - param === 'all'         -> show all months (no filter)
  //  - param is a number 1-12  -> filter to that month
  const monthParam = params?.month;
  const selectedMonth =
    monthParam === undefined ? String(now.getMonth() + 1)
    : monthParam === 'all' ? ''
    : monthParam;

  const selectedLeaveType = params?.leaveType || '';

  // Apply year/month/leaveType filters based on StartDate
  const filteredLeaves = leaves.filter((leave) => {
    if (!leave.StartDate) return false;
    const date = getCalendarDateParts(leave.StartDate);
    if (!date) return false;

    if (selectedYear && String(date.year) !== String(selectedYear)) {
      return false;
    }
    if (selectedMonth && String(date.month) !== String(selectedMonth)) {
      return false;
    }
    if (!matchesLeaveType(leave.LeaveType, selectedLeaveType)) {
      return false;
    }
    return true;
  });

  return (
    <div className="allLeavesContainer">
      <h1 className="allLeavesTitle">All Leave Requests</h1>

      <AllLeavesFilters leaves={filteredLeaves} />

      <AllLeavesTable leaves={filteredLeaves} />
    </div>
  );
}
