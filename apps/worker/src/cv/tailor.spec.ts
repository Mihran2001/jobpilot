import type { CvProfile } from '@jobpilot/shared';
import { tailorCv } from './tailor.js';

const profile: CvProfile = {
  fullName: 'Ada Lovelace',
  headline: 'Full-stack engineer',
  links: [],
  summary: 'Builds web products.',
  skills: ['React', 'Python', 'Node.js', 'PostgreSQL'],
  experience: [
    {
      company: 'Acme',
      title: 'Engineer',
      start: '2021-03',
      end: null,
      highlights: [
        'Led a Python data pipeline',
        'Built the React dashboard',
        'Tuned PostgreSQL queries',
      ],
    },
  ],
  education: [],
};

const listing = {
  title: 'Backend Engineer',
  company: 'Northwind',
  description: '<p>We use Node.js and <strong>PostgreSQL</strong>.</p>',
};

describe('tailorCv', () => {
  it('puts the skills the listing asks for first, keeping your order otherwise', () => {
    const { skills } = tailorCv(profile, listing);
    expect(skills).toEqual([
      { name: 'Node.js', matched: true },
      { name: 'PostgreSQL', matched: true },
      { name: 'React', matched: false },
      { name: 'Python', matched: false },
    ]);
  });

  it('moves relevant highlights up without adding or rewording anything', () => {
    const { profile: tailored } = tailorCv(profile, listing);
    const highlights = tailored.experience[0]?.highlights;
    expect(highlights).toEqual([
      'Tuned PostgreSQL queries',
      'Led a Python data pipeline',
      'Built the React dashboard',
    ]);
    expect([...(highlights ?? [])].sort()).toEqual(
      [...(profile.experience[0]?.highlights ?? [])].sort(),
    );
  });

  it('names the target, or leaves the CV general without a listing', () => {
    expect(tailorCv(profile, listing).target).toBe('Backend Engineer at Northwind');
    const general = tailorCv(profile, null);
    expect(general.target).toBeNull();
    expect(general.skills.every((s) => !s.matched)).toBe(true);
  });
});
