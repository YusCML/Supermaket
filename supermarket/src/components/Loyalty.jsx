import React from 'react';

export default function Loyalty({ customers = [], logs = [], onRefresh }) {
  return (
    <div className="tab-content">
      <h2>Loyalty & Rewards Center</h2>

      <h3>Registered Members</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Member Name</th>
            <th>Phone Number</th>
            <th>Loyalty ID</th>
            <th>Active Points</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone}</td>
              <td>{c.loyalty_id}</td>
              <td><strong>{c.points_balance} pts</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: '2rem' }}>Audit Log</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date/Time</th>
            <th>Customer ID</th>
            <th>Order ID</th>
            <th>Action</th>
            <th>Points Delta</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan="5">No transactions recorded yet.</td></tr>
          ) : (
            logs.map(log => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString()}</td>
                <td>Customer #{log.customer_id}</td>
                <td>Order #{log.order_id}</td>
                <td>
                  <span className={`badge ${log.type === 'EARNED' ? 'badge-ok' : 'badge-warn'}`}>
                    {log.type}
                  </span>
                </td>
                <td>{log.points_changed > 0 ? `+${log.points_changed}` : log.points_changed}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}