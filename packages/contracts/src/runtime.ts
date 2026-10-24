/** Profile isolation applies to the new launch commands; legacy/test environments remain supported. */
export function assertRuntimeProfile(source: Record<string, string | undefined>): void {
  const profile = source.ARENA_PROFILE;
  if (!profile) return;
  if (profile !== 'demo' && profile !== 'official')
    throw new Error('ARENA_PROFILE phải là demo hoặc official.');
  if (source.DEMO_MODE !== (profile === 'demo' ? 'true' : 'false'))
    throw new Error('DEMO_MODE không khớp ARENA_PROFILE.');
  const database = new URL(source.DATABASE_URL ?? '');
  if (database.searchParams.get('schema') !== `arena_${profile}`)
    throw new Error(
      `Profile ${profile} yêu cầu DATABASE_URL có schema=arena_${profile}; không dùng schema public.`,
    );
  const redis = new URL(source.REDIS_URL ?? '');
  if (
    !['redis:', 'rediss:'].includes(redis.protocol) ||
    redis.pathname !== (profile === 'demo' ? '/0' : '/1')
  )
    throw new Error(`Profile ${profile} yêu cầu Redis database ${profile === 'demo' ? '0' : '1'}.`);
  if (source.QUEUE_PREFIX !== `arena-${profile}`) throw new Error(`QUEUE_PREFIX phải là arena-${profile}.`);
  if (source.SESSION_COOKIE_NAME && source.SESSION_COOKIE_NAME !== `arena_${profile}_session`)
    throw new Error('SESSION_COOKIE_NAME không khớp profile.');
  if (profile === 'official' && source.BOT_SANDBOX_MODE && source.BOT_SANDBOX_MODE !== 'docker')
    throw new Error('Bản chính thức yêu cầu sandbox Docker/Podman.');
}
