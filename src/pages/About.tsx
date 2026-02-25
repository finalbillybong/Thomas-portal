import { Link } from 'react-router-dom';

export function About() {
  return (
    <div className="about-page">
      <h2>About Homework Hub</h2>

      <section>
        <h3>How checking works</h3>
        <ol>
          <li>Tap a portal card on the dashboard.</li>
          <li>The portal opens in this tab &mdash; log in using your password manager (e.g. Proton Pass).</li>
          <li>Check your homework / assignments on the portal.</li>
          <li>Come back to Homework Hub (use the browser back button or re-open the app).</li>
          <li>If you were away for at least 10 seconds, the portal is automatically marked as checked.</li>
        </ol>
      </section>

      <section>
        <h3>Using Proton Pass autofill</h3>
        <ol>
          <li>Install the Proton Pass app on your device.</li>
          <li>Enable autofill in your device settings.</li>
          <li>When a portal login page appears, tap the username field and select the saved credentials from Proton Pass.</li>
        </ol>
      </section>

      <section>
        <h3>Daily reset</h3>
        <p>
          At midnight (Europe/Amsterdam timezone), all portals reset to unchecked
          for the new day.
        </p>
      </section>

      <Link to="/" className="btn btn-secondary">
        Back to Dashboard
      </Link>
    </div>
  );
}
