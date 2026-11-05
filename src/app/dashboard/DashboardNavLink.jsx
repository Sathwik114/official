'use client';

import { usePathname } from 'next/navigation';

export default function DashboardNavLink({ href, children }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <a
      href={href}
      className={`dashboardNavLink${isActive ? ' active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {children}
    </a>
  );
}
