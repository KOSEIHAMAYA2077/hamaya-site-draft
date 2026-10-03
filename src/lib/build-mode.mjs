/** Local authoring and design studies are never ordinary distribution routes. */
export function localBuildEnabled(env = {}, development = false) {
  return (
    development || env.LOCAL_STUDIO === '1' || env.LOCAL_COMPARISON === '1'
  );
}

export const privateRoutePrefixes = ['write', 'directions', 'compare'];
