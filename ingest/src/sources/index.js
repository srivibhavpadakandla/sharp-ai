/**
 * Source registry. One entry per documentation source; adding a source is a
 * new adapter module plus one line here — the parser, chunker, SQL writer and
 * embedder stay untouched.
 *
 * Planned, not yet ingested:
 *   rev        https://docs.revrobotics.com
 *   ctrlaltftc https://www.ctrlaltftc.com
 *   ftc-sdk    FIRST-Tech-Challenge/FtcRobotController javadocs
 *
 * Deliberately excluded:
 *   a team curriculum  Removed 2026-09-19 at the owner's request. It was the
 *               largest single source at 1,030 chunks. Do not re-add it, or
 *               anything from the same author, without being asked to.
 *   LearnRoadRunner — targets Road Runner 0.5 and produces wrong answers.
 *   Private/volunteer Q&A and unanswered submissions — never indexed. The
 *   public official manual and published Team Q&A use summarize-only mode.
 *   Their original wording never appears in excerpts or public answer pages.
 */
import * as gm0 from './gm0.js';
import * as ftcDocs from './ftc-docs.js';
import {
  ctrlaltftc, ftclib, roadrunner, rev, pedropathing, firstRules,
  chiefdelphi, ftcCommunity, frczero, communityHubs,
} from './link-sources.js';
import { samples as sdkSamples, api as sdkApi } from './ftc-sdk.js';
import * as firstManual from './first-manual.js';
import * as firstQa from './first-qa.js';
import { rrQuickstart } from './rr-quickstart.js';

export const SOURCES = {
  gm0,
  'ftc-docs': ftcDocs,
  'ftc-sdk-api': sdkApi,
  'ftc-sdk-samples': sdkSamples,
  ctrlaltftc, ftclib, roadrunner, rev, pedropathing,
  'first-rules': firstRules,
  'first-manual': firstManual,
  'first-qa': firstQa,
  'rr-quickstart': rrQuickstart,
  chiefdelphi,
  'ftc-community': ftcCommunity,
  frczero,
  'community-hubs': communityHubs,
};

export function getSource(id) {
  const s = SOURCES[id];
  if (!s) throw new Error(`Unknown source "${id}". Known: ${Object.keys(SOURCES).join(', ')}`);
  return s;
}
