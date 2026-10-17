import type { CvProfile } from '@jobpilot/shared';
import { containsTerm, normalize } from '../scoring/match.js';
import { htmlToText } from '../text.js';

export interface TargetListing {
  title: string;
  company: string;
  /** HTML as stored. */
  description: string;
}

export interface TailoredCv {
  profile: CvProfile;
  /** Skills the listing mentions, in your order, then the rest. */
  skills: { name: string; matched: boolean }[];
  /** "Senior Backend Engineer at Acme", or null for a general CV. */
  target: string | null;
}

/**
 * Re-orders, never invents: skills and experience highlights that the
 * listing asks for move to the front. Nothing is added or reworded.
 */
export function tailorCv(profile: CvProfile, listing: TargetListing | null): TailoredCv {
  if (!listing) {
    return {
      profile,
      skills: profile.skills.map((name) => ({ name, matched: false })),
      target: null,
    };
  }

  const listingText = normalize(`${listing.title} ${htmlToText(listing.description)}`);
  const inListing = (term: string) => containsTerm(listingText, normalize(term).trim());
  const wanted = profile.skills.filter(inListing);

  /** How many of the listing's wanted skills a highlight mentions. */
  const relevance = (highlight: string) => {
    const text = normalize(highlight);
    return wanted.filter((skill) => containsTerm(text, normalize(skill).trim())).length;
  };

  return {
    profile: {
      ...profile,
      experience: profile.experience.map((job) => ({
        ...job,
        // Array.prototype.sort is stable, so equally relevant highlights keep your order.
        highlights: [...job.highlights].sort((a, b) => relevance(b) - relevance(a)),
      })),
    },
    skills: [
      ...wanted.map((name) => ({ name, matched: true })),
      ...profile.skills.filter((s) => !inListing(s)).map((name) => ({ name, matched: false })),
    ],
    target: `${listing.title} at ${listing.company}`,
  };
}
