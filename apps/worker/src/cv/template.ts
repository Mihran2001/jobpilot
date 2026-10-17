import type { TailoredCv } from './tailor.js';

/**
 * Every value from the profile or the listing goes through escapeHtml: CV
 * text is user input, and Chrome would otherwise run any <script> in it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return `${MONTHS[Number(month) - 1] ?? ''} ${year ?? ''}`.trim();
}

function period(start: string | undefined, end: string | null | undefined): string {
  if (!start) return end ? formatMonth(end) : '';
  return `${formatMonth(start)} – ${end ? formatMonth(end) : 'present'}`;
}

/** Only http(s) links become clickable; anything else is printed as text. */
function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : null;
}

export function renderCvHtml({ profile, skills, target }: TailoredCv): string {
  const e = escapeHtml;
  const contact = [profile.email, profile.phone, profile.location].filter(Boolean) as string[];
  const links = profile.links.map((l) => {
    const href = safeHref(l.url);
    return href ? `<a href="${href}">${e(l.label)}</a>` : e(l.label);
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(profile.fullName)}${target ? ` – ${e(target)}` : ''}</title>
<style>
  @page { size: A4; margin: 16mm 16mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1d2433; margin: 0; }
  h1 { font-size: 22pt; margin: 0; letter-spacing: -0.01em; }
  .headline { font-size: 12pt; color: #3d4a63; margin: 2px 0 6px; }
  .contact { color: #56627a; font-size: 9.5pt; }
  .contact span + span::before, .contact a + a::before { content: "·"; margin: 0 6px; color: #9aa3b5; }
  a { color: #1f5fbf; text-decoration: none; }
  h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.08em; color: #1f5fbf;
       border-bottom: 1px solid #d8deea; padding-bottom: 3px; margin: 18px 0 8px; }
  .summary { margin: 0; }
  .skills { display: flex; flex-wrap: wrap; gap: 5px; padding: 0; margin: 0; list-style: none; }
  .skills li { border: 1px solid #d8deea; border-radius: 3px; padding: 1px 7px; font-size: 9.5pt; }
  .skills li.match { border-color: #1f5fbf; color: #1f5fbf; font-weight: 600; }
  .job, .school { margin-bottom: 10px; break-inside: avoid; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .role { font-weight: 600; }
  .when { color: #56627a; font-size: 9.5pt; white-space: nowrap; }
  .where { color: #56627a; font-size: 9.5pt; }
  ul.highlights { margin: 4px 0 0; padding-left: 16px; }
  ul.highlights li { margin: 2px 0; }
</style>
</head>
<body>
  <header>
    <h1>${e(profile.fullName)}</h1>
    <div class="headline">${e(profile.headline)}</div>
    <div class="contact">${contact.map((c) => `<span>${e(c)}</span>`).join('')}</div>
    ${links.length ? `<div class="contact">${links.join('')}</div>` : ''}
  </header>

  <h2>Summary</h2>
  <p class="summary">${e(profile.summary)}</p>

  ${
    skills.length
      ? `<h2>Skills</h2>
  <ul class="skills">${skills.map((s) => `<li${s.matched ? ' class="match"' : ''}>${e(s.name)}</li>`).join('')}</ul>`
      : ''
  }

  ${
    profile.experience.length
      ? `<h2>Experience</h2>
  ${profile.experience
    .map(
      (job) => `<section class="job">
    <div class="row"><span class="role">${e(job.title)} · ${e(job.company)}</span><span class="when">${e(period(job.start, job.end))}</span></div>
    ${job.location ? `<div class="where">${e(job.location)}</div>` : ''}
    ${job.highlights.length ? `<ul class="highlights">${job.highlights.map((h) => `<li>${e(h)}</li>`).join('')}</ul>` : ''}
  </section>`,
    )
    .join('\n  ')}`
      : ''
  }

  ${
    profile.education.length
      ? `<h2>Education</h2>
  ${profile.education
    .map(
      (ed) => `<section class="school">
    <div class="row"><span class="role">${e(ed.degree)} · ${e(ed.school)}</span><span class="when">${e(period(ed.start, ed.end))}</span></div>
  </section>`,
    )
    .join('\n  ')}`
      : ''
  }
</body>
</html>
`;
}
