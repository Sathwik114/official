'use client';

import { usePathname } from 'next/navigation';

export default function SiteFooter() {
  const pathname = usePathname();
  const isApplyLeavePage = pathname === '/apply-leave';

  return (
    <footer className={`siteFooter${isApplyLeavePage ? ' siteFooterFlow' : ''}`}>
      Greentech Industries (India) Pvt.Ltd.
    </footer>
  );
}
