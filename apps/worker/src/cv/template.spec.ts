import type { CvProfile } from '@jobpilot/shared';
import { escapeHtml, renderCvHtml } from './template.js';

const profile: CvProfile = {
  fullName: 'Ada <script>alert(1)</script> Lovelace',
  headline: 'Engineer & "builder"',
  links: [
    { label: 'GitHub', url: 'https://github.com/ada' },
    { label: 'Sneaky', url: 'javascript:alert(1)' },
  ],
  summary: 'Builds things.',
  skills: [],
  experience: [
    {
      company: 'Acme',
      title: 'Engineer',
      start: '2021-03',
      end: null,
      highlights: ['Shipped <b>it</b>'],
    },
  ],
  education: [],
};

describe('renderCvHtml', () => {
  const html = renderCvHtml({ profile, skills: [], target: null });

  it('escapes every user-supplied value', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Ada &lt;script&gt;alert(1)&lt;/script&gt; Lovelace');
    expect(html).toContain('Engineer &amp; &quot;builder&quot;');
    expect(html).toContain('Shipped &lt;b&gt;it&lt;/b&gt;');
  });

  it('links only http(s) URLs', () => {
    expect(html).toContain('<a href="https://github.com/ada">GitHub</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Sneaky');
  });

  it('formats periods, with "present" for the current job', () => {
    expect(html).toContain('Mar 2021 – present');
  });

  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});
