import LeaveApprovalsPage from '@/app/dashboard/LeaveApprovalsPage';

export default async function DirectLeaveApprovalsPage({ searchParams }) {
  const { token = '' } = await (searchParams || {});

  return <LeaveApprovalsPage directMode directToken={token} />;
}
