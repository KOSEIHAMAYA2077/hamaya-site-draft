# Site draft boundaries

- This checkout is the independent source draft. The owner has already requested making `hamaya-site-draft` public; do not change its visibility. Keep secrets, private records and credentials out of the source repository.
- The owner explicitly authorized replacing the existing `KOSEIHAMAYA2077.github.io` Pages site at `https://koseihamaya2077.github.io/` on 2026-10-09. That permission supersedes the earlier public-site prohibition for this reviewed static output only. Deployment is handled by the parent task; this checkout prepares and verifies `dist` without pushing or changing Pages settings.
- Do not add another hosting service, authentication, or diary link.
- Keep private email, financial information, nonpublic work materials, internal notes, and credentials out of the content and repository.
- Profile claims, selected works, AtCoder links, portraits, and migrated articles require owner-confirmed content. Do not invent details.
- All new content starts with `draft: true`. Only entries explicitly set to `draft: false` appear in ordinary distribution pages.
- The explicitly requested `LOCAL_WORKROOM=1` preview may render the allowlisted original record under `/room/notes/`, while keeping its `draft: true` source unchanged. Never expand the allowlist automatically or include that route, body, or preview settings in ordinary builds.
- The separately authorized `PUBLIC_PREVIEW=1` selects only the six verified public repository summaries and the current public article replica under `src/public-preview/notes/`. Preserve all original draft flags and source files. Public preview must exclude every local feature, authoring route, history module, vendor asset and documentation file; never combine it with a `LOCAL_*` flag.
- Verify `npm run lint`, an ordinary `npm run build` plus `npm test`, and `PUBLIC_PREVIEW=1` root/project-base builds plus `npm run test:public-preview` when changing public preview behavior. The ordinary distribution tests deliberately retain their draft exclusion contract.
- Use Japanese navigation and concise natural copy. Honor reduced motion, keyboard access, and mobile layout.
