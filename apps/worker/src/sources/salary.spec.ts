import { parseUsdYearlyRange } from './salary.js';

describe('parseUsdYearlyRange', () => {
  it.each([
    ['$170k - $200k', { min: 170_000, max: 200_000 }],
    ['$35,3k- $52k', { min: 35_300, max: 52_000 }],
    ['OTE $25k - $35k', { min: 25_000, max: 35_000 }],
    ['$120,000 - $150,000', { min: 120_000, max: 150_000 }],
    ['$95k', { min: 95_000, max: 95_000 }],
  ])('reads %j as USD per year', (text, expected) => {
    expect(parseUsdYearlyRange(text)).toEqual(expected);
  });

  it.each([
    ['', 'empty'],
    ['$50-$75 /hour', 'hourly'],
    ['€60k - €80k', 'not USD'],
    ['CAD $90k', 'Canadian dollars'],
    ['$5k - $8k / month', 'monthly'],
    ['Competitive', 'no number'],
    ['$1 - $2 - $3', 'more than two amounts'],
    ['$500', 'implausibly low for a year'],
  ])('returns null for %j (%s)', (text) => {
    expect(parseUsdYearlyRange(text)).toBeNull();
  });
});
