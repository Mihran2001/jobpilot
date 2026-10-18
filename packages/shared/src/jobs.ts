// The contract between producers (API, worker) and consumers (worker) of
// background jobs. Plain names and payload types only, no BullMQ import, so
// this file stays safe to import anywhere.

export const QUEUE = {
  fetchSource: 'fetch-source',
  scoreListing: 'score-listing',
  generateCv: 'generate-cv',
  rescoreUser: 'rescore-user',
} as const;

export interface FetchSourceData {
  sourceId: string;
}

export interface ScoreListingData {
  userId: string;
  jobListingId: string;
}

/** Everything else (user, application, listing) is read from the cv_versions row. */
export interface GenerateCvData {
  cvVersionId: string;
}

/** After a skill profile changes: score every listing again for that user. */
export interface RescoreUserData {
  userId: string;
}
