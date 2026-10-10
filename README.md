# droidtop.github.io

The web side of droidtop's plugin catalog, published at <https://droidtop.github.io/>.

- **`/`** is the official catalog, browsable: every plugin with its description, versions and
  channels, permissions in plain language, signature facts and source repository, and an
  "Install in droidtop" button.
- **`/add-catalog?address=<https address>`** and **`/install-plugin?catalog=<https address>&id=<plugin id>`**
  are the https form of droidtop's two links (`droidtop://add-catalog`, `droidtop://install-plugin`;
  Droidtop/droidtop `docs/SPEC.md` 12a). The page checks the address (an `https:` URL with a host and no
  credentials; a plugin id of letters, digits, `.`, `_`, `-`), shows it in full next to an "Open in
  droidtop" button and a "Copy address" fallback, and nothing more. The review and its Accept are in the
  app; a link can neither add a catalog nor install a plugin by itself.

## How it is made

`generator/build_site.py` (python standard library) builds a catalog's page from its `index.json`:

- everything shown comes from the index and from the newest stable bundle of each plugin. The generator
  downloads that bundle, refuses it unless its SHA-256 and its manifest's SHA-256 equal the index's, and
  reads `manifest.json` in memory (nothing is unpacked);
- permission wording comes from droidtop's own `PluginPermissions.kt` on `main`, read at build time, so
  the page uses the labels the app's grant screen uses and cannot drift from them;
- what cannot be read is said on the page, never guessed;
- everything from an index is HTML-escaped; links are built only from validated parts.

The `Pages` workflow tests the generator, builds the site and deploys it with GitHub Pages every three
hours, on a push to `main` and on demand.

The unofficial **gamegrab-sources** catalog has its own page, published by that organisation from
its own catalog repository (`tools/site/`, a copy of this generator), never from here. Its buttons use
the link pages above because those are the addresses the app is built to open.

```
python3 generator/test_build_site.py
node --test generator/test_link.js
python3 generator/build_site.py --index <index.json> --address <catalog address> \
    --registry <PluginPermissions.kt> --forward-pages --out _site
```

## Licence

GPL-3.0 (`LICENSE`).
