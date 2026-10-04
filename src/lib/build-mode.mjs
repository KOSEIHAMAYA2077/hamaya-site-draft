/** Local authoring and design studies are never ordinary distribution routes. */
export const workroomEnabled = (value) => value === '1';

/** An explicit integrated preview includes the existing, isolated tools. */
export function localFeatures(env = {}) {
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
