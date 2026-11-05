import { cookies } from 'next/headers';
import * as jose from 'jose';
import LogoutButton from './LogoutButton';
import DashboardNavLink from './DashboardNavLink';
import {
  getLeaveRoleRules,
  isCccUser,
  isApproverUser,
  isApplicantUser,
  isHrUser,
  isMfPrimaryApprover,
  canAccessMonitorHod,
  canAccessMyAttendance,
} from '@/lib/leaveApprovalConfig';
import './layout.css';
import './monitorhod.css';

export default async function DashboardLayout({ children }) {
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

  const rules = await getLeaveRoleRules();
  const mfApplicantIds = rules.mf.ids;
  const admApplicantIds = rules.adm.ids;
  const vipApplicantIds = rules.vip.ids;
  const isCCC = await isCccUser(currentUserId);
  const isMfApplicant = mfApplicantIds.includes(currentUserId);
  const isAdmApplicant = admApplicantIds.includes(currentUserId);
  const isVipApplicant = vipApplicantIds.includes(currentUserId);
  const isApprover = await isApproverUser(currentUserId);

  const isHr = await isHrUser(currentUserId);
  const isMfPrimaryApproverUser = await isMfPrimaryApprover(currentUserId);
  const showMonitorHodLink = await canAccessMonitorHod(currentUserId);
  const showMyAttendanceLink = await canAccessMyAttendance(currentUserId);
  const showDashboardLink = !isCCC && !isHr;
  const showApplyLeaveLink = !isCCC && !isHr && !isMfPrimaryApproverUser;
  const showApproveLink = isCCC || (isApprover || isVipApplicant) && !isHr;
  const showMyLeavesLink = !isCCC && !isHr && (isMfApplicant || isAdmApplicant || isVipApplicant || isApprover);
  const showPendingLeavesLink = isHr;
  const showAllLeavesLink = isHr;

  return (
    <div className="dashboardShell">
      <nav className="dashboardNavbar">
        <div className="dashboardNavBrand">
          <span className="dashboardNavBrandMark">GTI</span>
          <span className="dashboardNavBrandText">HOD&apos;s Leave Management System</span>
        </div>

        <div className="dashboardNavRight">
          <div className="dashboardNavLinks">

            {showApplyLeaveLink && (
              <DashboardNavLink href="/apply-leave">
                <span className="navIcon">📝</span> Apply for a Leave
              </DashboardNavLink>
            )}
            {showApproveLink && (
              <DashboardNavLink href="/dashboard/leave-approvals">
                <span className="navIcon">✅</span> Approve a Leave
              </DashboardNavLink>
            )}
            {showMonitorHodLink && (
              <DashboardNavLink href="/dashboard/monitor-hod">
                <span className="navIcon">📊</span> Monitor HOD&apos;s Attendance
              </DashboardNavLink>
            )}
            {showMyLeavesLink && (
              <DashboardNavLink href="/dashboard/my-leaves">
                <span className="navIcon">📋</span> My Leaves
              </DashboardNavLink>
            )}
            {showMyAttendanceLink && (
              <DashboardNavLink href="/dashboard/my-attendance">
                <span className="navIcon">🕒</span> My Attendance
              </DashboardNavLink>
            )}
            {showPendingLeavesLink && (
              <DashboardNavLink href="/dashboard/pending-leaves">
                <span className="navIcon">📥</span> Track Pending Leave Status
              </DashboardNavLink>
            )}
            {showAllLeavesLink && (
              <DashboardNavLink href="/dashboard/all-leaves">
                <span className="navIcon">📂</span> All Leaves
              </DashboardNavLink>
            )}
          </div>
          <span className="dashboardNavDivider" />
          <LogoutButton />
        </div>
      </nav>
      {children}
    </div>
  );
}
