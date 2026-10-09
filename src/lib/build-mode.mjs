/** Local authoring and design studies are never ordinary distribution routes. */
export const workroomEnabled = (value) => value === '1';

/** The separately approved public selection never includes local features. */
export const publicPreviewEnabled = (value) => value === '1';

export function assertPublicPreviewMode(env = {}) {
  if (
    publicPreviewEnabled(env.PUBLIC_PREVIEW) &&
    Object.entries(env).some(
      ([flag, value]) => flag.startsWith('LOCAL_') && value === '1',
    )
  )
    throw new Error('PUBLIC_PREVIEW と LOCAL_* は同時に指定できません。');
}

/** An explicit integrated preview includes the existing, isolated tools. */
export function localFeatures(env = {}) {
  assertPublicPreviewMode(env);
  const workroom = workroomEnabled(env.LOCAL_WORKROOM);
  return {
    workroom,
    comparison: workroom || env.LOCAL_COMPARISON === '1',
    experiments: workroom || env.LOCAL_EXPERIMENTS === '1',
    candidates: workroom || env.LOCAL_CANDIDATES === '1',
    timeline: workroom || env.LOCAL_TIMELINE === '1',
  };
}

export function localBuildEnabled(env = {}, development = false) {
  assertPublicPreviewMode(env);
  if (publicPreviewEnabled(env.PUBLIC_PREVIEW)) return false;
  return (
    development ||
    workroomEnabled(env.LOCAL_WORKROOM) ||
    env.LOCAL_STUDIO === '1' ||
    env.LOCAL_COMPARISON === '1' ||
    env.LOCAL_EXPERIMENTS === '1' ||
    env.LOCAL_CANDIDATES === '1' ||
    env.LOCAL_TIMELINE === '1'
  );
}

export const privateRoutePrefixes = ['write', 'directions', 'compare', 'room'];
