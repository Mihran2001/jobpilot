'use client';

import type { CvProfile } from '@jobpilot/shared';
import { useActionState, useState } from 'react';
import { buttonClass, Card, ErrorText, inputClass } from '@/components/ui';
import { saveCvProfile, type ProfileState } from './actions';

type Experience = CvProfile['experience'][number];
type Education = CvProfile['education'][number];

const emptyExperience: Experience = {
  company: '',
  title: '',
  start: '',
  end: null,
  highlights: [],
};
const emptyEducation: Education = { school: '', degree: '' };

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Optional text fields: empty input means "not set", not "". */
const optional = (value: string) => (value.trim() === '' ? undefined : value);

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export function CvProfileForm({ initial }: { initial: CvProfile | null }) {
  const [profile, setProfile] = useState<CvProfile>(
    initial ?? {
      fullName: '',
      headline: '',
      summary: '',
      links: [],
      skills: [],
      experience: [{ ...emptyExperience }],
      education: [],
    },
  );
  // Free-text editors for list fields, parsed when submitting.
  const [skillsText, setSkillsText] = useState(profile.skills.join('\n'));
  const [linksText, setLinksText] = useState(
    profile.links.map((l) => `${l.label} | ${l.url}`).join('\n'),
  );
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveCvProfile, {});
  const err = (path: string) => state.fieldErrors?.[path];

  const set = <K extends keyof CvProfile>(key: K, value: CvProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));
  const setJob = (i: number, patch: Partial<Experience>) =>
    set(
      'experience',
      profile.experience.map((job, j) => (j === i ? { ...job, ...patch } : job)),
    );
  const setSchool = (i: number, patch: Partial<Education>) =>
    set(
      'education',
      profile.education.map((ed, j) => (j === i ? { ...ed, ...patch } : ed)),
    );

  const payload: CvProfile = {
    ...profile,
    email: optional(profile.email ?? ''),
    phone: optional(profile.phone ?? ''),
    location: optional(profile.location ?? ''),
    skills: lines(skillsText),
    links: lines(linksText).map((line) => {
      const [label = '', url = ''] = line.split('|').map((part) => part.trim());
      return { label, url };
    }),
  };

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="profile" value={JSON.stringify(payload)} />

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={err('fullName')}>
          <input
            value={profile.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Headline" error={err('headline')}>
          <input
            value={profile.headline}
            onChange={(e) => set('headline', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email" error={err('email')}>
          <input
            type="email"
            value={profile.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone" error={err('phone')}>
          <input
            value={profile.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Location" error={err('location')}>
          <input
            value={profile.location ?? ''}
            onChange={(e) => set('location', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Links (one per line: Label | https://…)"
          error={Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith('links'))?.[1]}
        >
          <textarea
            rows={3}
            value={linksText}
            onChange={(e) => setLinksText(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Summary" error={err('summary')}>
            <textarea
              rows={4}
              value={profile.summary}
              onChange={(e) => set('summary', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Skills (one per line, most important first)" error={err('skills')}>
            <textarea
              rows={5}
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="font-semibold">Experience</h2>
        {profile.experience.map((job, i) => (
          <Card key={i} className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" error={err(`experience.${i}.title`)}>
              <input
                value={job.title}
                onChange={(e) => setJob(i, { title: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Company" error={err(`experience.${i}.company`)}>
              <input
                value={job.company}
                onChange={(e) => setJob(i, { company: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Start (YYYY-MM)" error={err(`experience.${i}.start`)}>
              <input
                value={job.start}
                placeholder="2022-01"
                onChange={(e) => setJob(i, { start: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="End (YYYY-MM, empty if current)" error={err(`experience.${i}.end`)}>
              <input
                value={job.end ?? ''}
                onChange={(e) =>
                  setJob(i, { end: e.target.value.trim() === '' ? null : e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Highlights (one per line)" error={err(`experience.${i}.highlights`)}>
                <textarea
                  rows={4}
                  defaultValue={job.highlights.join('\n')}
                  onChange={(e) => setJob(i, { highlights: lines(e.target.value) })}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() =>
                  set(
                    'experience',
                    profile.experience.filter((_, j) => j !== i),
                  )
                }
                className="text-xs text-red-700 hover:underline"
              >
                Remove this job
              </button>
            </div>
          </Card>
        ))}
        <button
          type="button"
          onClick={() => set('experience', [...profile.experience, { ...emptyExperience }])}
          className={buttonClass('secondary')}
        >
          Add a job
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Education</h2>
        {profile.education.map((ed, i) => (
          <Card key={i} className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Field label="Degree" error={err(`education.${i}.degree`)}>
                <input
                  value={ed.degree}
                  onChange={(e) => setSchool(i, { degree: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="School" error={err(`education.${i}.school`)}>
                <input
                  value={ed.school}
                  onChange={(e) => setSchool(i, { school: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Start (YYYY-MM)" error={err(`education.${i}.start`)}>
              <input
                value={ed.start ?? ''}
                onChange={(e) => setSchool(i, { start: optional(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="End (YYYY-MM)" error={err(`education.${i}.end`)}>
              <input
                value={ed.end ?? ''}
                onChange={(e) => setSchool(i, { end: optional(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <div className="flex items-end sm:col-span-2">
              <button
                type="button"
                onClick={() =>
                  set(
                    'education',
                    profile.education.filter((_, j) => j !== i),
                  )
                }
                className="text-xs text-red-700 hover:underline"
              >
                Remove
              </button>
            </div>
          </Card>
        ))}
        <button
          type="button"
          onClick={() => set('education', [...profile.education, { ...emptyEducation }])}
          className={buttonClass('secondary')}
        >
          Add education
        </button>
      </section>

      <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <button type="submit" disabled={pending} className={buttonClass()}>
          {pending ? 'Saving…' : 'Save CV profile'}
        </button>
        {state.saved && !pending && <span className="text-sm text-emerald-700">Saved</span>}
        <ErrorText>{state.error}</ErrorText>
      </div>
    </form>
  );
}
