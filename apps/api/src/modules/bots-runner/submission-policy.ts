export interface SubmissionSource {
  githubRepo?: string | null;
  commitSha?: string | null;
  sourcePath?: string | null;
  isDemo?: boolean;
}

export function submissionMethod(bot: SubmissionSource): 'github' | 'direct' | 'demo' {
  if (bot.isDemo) return 'demo';
  return bot.githubRepo &&
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(bot.githubRepo) &&
    /^[a-f0-9]{40}$/.test(bot.commitSha ?? '') &&
    !!bot.sourcePath
    ? 'github'
    : 'direct';
}

/** Demo fixtures are allowed only in explicit demo mode; uploaded Python is practice-only. */
export function eligibleForCompetition(bot: SubmissionSource, demoMode = false): boolean {
  const method = submissionMethod(bot);
  return method === 'github' || (demoMode && method === 'demo');
}
