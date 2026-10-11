/**
 * FramingOverlay — tells the user how to stand, before and during a session.
 * Pass lost={true} during a session when tracking is lost.
 */
export default function FramingOverlay({ status, lost = false }) {
  if (!status) return null;

  if (status.ready && !lost) {
    return <div className="framing-overlay framing-ok">✓ Good position. You can start.</div>;
  }

  return (
    <div className={`framing-overlay ${lost ? 'framing-lost' : 'framing-warn'}`} role="status" aria-live="polite">
      <strong>{lost ? 'Tracking lost. Counting is paused.' : 'Adjust your position'}</strong>
      <ul>
        {status.messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
