'use client';

import { useState } from 'react';
import { formatCalendarDate } from '@/lib/leaveDateUtils';

export default function AllLeavesTable({ leaves = [] }) {
  const [selectedRowKey, setSelectedRowKey] = useState(null);

  const selectRowOnKeyDown = (event, rowKey) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedRowKey(rowKey);
    }
  };

  return (
    <div className="allLeavesTableWrapper">
      <table className="allLeavesTable">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Emp ID</th>
            <th>Emp Name</th>
            <th>Dept</th>
            <th>Section</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>From Time</th>
            <th>To Time</th>
            <th>V/P status</th>
            <th>P status</th>
            <th>Leave Type</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {leaves.length === 0 ? (
            <tr>
              <td colSpan={13} className="allLeavesEmptyCell">
                No leave requests found.
              </td>
            </tr>
          ) : (
            leaves.map((leave, index) => {
              const rowKey = `${leave.ApplicantId}-${leave.StartDate}-${leave.EndDate}-${index}`;
              const isSelected = selectedRowKey === rowKey;

              return (
                <tr
                  key={rowKey}
                  className={isSelected ? 'allLeavesSelectedRow' : ''}
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => setSelectedRowKey(rowKey)}
                  onKeyDown={(event) => selectRowOnKeyDown(event, rowKey)}
                >
                  <td>{index + 1}</td>
                  <td>{leave.ApplicantId || '-'}</td>
                  <td>{leave.ApplicantName || '-'}</td>
                  <td>{leave.Department || '-'}</td>
                  <td>{leave.Section || '-'}</td>
                  <td>{formatCalendarDate(leave.StartDate)}</td>
                  <td>{formatCalendarDate(leave.EndDate)}</td>
                  <td>{leave.FromTime || '-'}</td>
                  <td>{leave.ToTime || '-'}</td>
                  <td>{leave.HodStatus || '-'}</td>
                  <td>{leave.CccStatus || '-'}</td>
                  <td>{leave.LeaveType || '-'}</td>
                  <td className="allLeavesReasonCell">
                    <span className="allLeavesReasonText">{leave.Reason || '-'}</span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
