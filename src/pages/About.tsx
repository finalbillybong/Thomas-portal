import { Link } from 'react-router-dom';

export function About() {
  return (
    <div className="about-page">
      <h2>About Homework Hub</h2>

      <section>
        <h3>How checking works</h3>
        <ol>
          <li>Tap a portal card on the dashboard.</li>
          <li>The portal opens in a new tab &mdash; log in and check your homework.</li>
          <li>The portal is automatically marked as checked.</li>
        </ol>
      </section>

      <section>
        <h3>Daily reset</h3>
        <p>
          At midnight (Europe/London timezone), all portals reset to unchecked
          for the new day.
        </p>
      </section>

      <Link to="/" className="btn btn-secondary">
        Back to Dashboard
      </Link>
    </div>
  );
}
