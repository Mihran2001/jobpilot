import { safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it.each(['/applications', '/listings?minScore=80', '/applications/123'])(
    'keeps the same-site path %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '',
    null,
  ])('falls back for %j', (value) => {
    expect(safeNextPath(value)).toBe('/listings');
  });
});
