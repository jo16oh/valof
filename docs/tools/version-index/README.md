# The version index

`index.hbs` renders the page at the root of the published book, listing `latest/` and every tag
directory beside it. The `docs` job in `.github/workflows/release.yml` runs this against the
`gh-pages` checkout after copying the new version in:

```sh
node docs/tools/version-index/index.ts site
```

It reads the directory names, so the list follows what is actually published. A prerelease gets its
own tag directory but never becomes `latest/`, which is why the newest non-prerelease is the one
named beside the `latest` link.
