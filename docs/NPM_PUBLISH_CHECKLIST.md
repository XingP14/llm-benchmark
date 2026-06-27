# npm Publish Checklist

The source currently declares `@xingp14/llm-benchmark`, but the public npm registry review found no published package. Use this checklist before the maintainer runs `npm publish`.

## Preflight

1. Confirm the working tree is clean: `git status --short`.
2. Install exactly from lockfile: `npm ci`.
3. Run the release gate: `npm run build && npm run lint && npm test && npm pack --dry-run`.
4. Confirm package metadata: `npm pkg get name version publishConfig.access bin files`.
5. Confirm no runtime secret defaults are used in production: set `NODE_ENV=production` and provide non-default `ADMIN_PASSWORD` and `JWT_SECRET`.
6. Confirm `CHANGELOG.md`, README badges, and Git tag target the same version.

## Publish

1. Maintainer logs in with an npm account that owns the scope.
2. Run `npm publish --access public`.
3. Create or update the matching GitHub release with npm package evidence.
4. Verify installation from the public registry in a temporary directory: `npm view @xingp14/llm-benchmark version` and `npx @xingp14/llm-benchmark --version`.

## Do Not Publish When

- CI is red or local release preflight fails.
- The working tree is dirty.
- `package.json`, tag, changelog, and README disagree on the version.
- Production auth relies on `admin123` or generated fallback secrets.
