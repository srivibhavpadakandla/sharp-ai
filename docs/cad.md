# CAD viewer

`/cad` shows the team's own exported geometry in the browser, using three.js.

## Why not an embedded Onshape

Onshape is proprietary SaaS, and its integration model runs the other way: it
supports serving *your* app inside an Onshape document tab (an iframe given
`documentId`/`workspaceId`/`elementId`), not serving Onshape inside another
site. A view-only public embed has been asked for on their forum for years and
is still not a feature. Rebranding it is not permitted either.

What *is* ours is the geometry. Exporting a model and showing it under our own
branding needs nobody's permission, and it works for anyone with a browser —
including people with no Onshape account, which an embed would not have solved.

## Getting a model in

Three ways, in increasing order of commitment:

1. **Drag a file onto the view.** Read in the browser via an object URL and
   never uploaded, so an unreleased design stays on the machine. This is why
   `connect-src` in `web/public/_headers` allows `blob:` — without it the
   loader's fetch of the object URL is blocked and the file silently fails.
2. **Commit it.** Put a `.glb`/`.stl` in `web/public/cad/` and add an entry to
   `manifest.json`. It then appears as a button for everyone.
3. **Pull it from the API.** `scripts/onshape-export.mjs` hits Onshape's
   synchronous glTF endpoint with developer keys from dev-portal.onshape.com.
   Not run in CI, and no key is stored in the repo.

## Notes

- glTF is metres; FTC is inches. The viewer converts for the size readout, and
  the floor grid is a 12ft field at one square per tile, so scale is legible.
- Nothing is stored server-side. There is no upload endpoint, no bucket and no
  cost, which is what keeps this inside the free-tier rule.
- FTC teams get Onshape Education free, so no one needs a paid seat to export.

## What this does not do

It is a viewer, not a simulator. Onshape has no robot-dynamics simulation, and
its FEA is a paid Professional/Enterprise feature — embedding it would not have
provided "actual testing" either. Physical testing remains physical testing.
