# Adding a season field image

The path planner draws a few seasons' tape from their official setup guides, but
a picture of the real field is easier to plan against. Any season can carry one,
and adding it needs no code change.

1. Put the image in `web/public/fields/` — `powerplay.png`, `skystone.jpg`, etc.
2. Add or fill in a line in `web/public/fields/manifest.json`:

   ```json
   { "id": "powerplay", "label": "PowerPlay 2022-23", "file": "powerplay.png" }
   ```

3. Commit. The season appears in the planner's field picker marked `· image`.

## What makes a good one

- **Square, top-down, cropped to the field itself** — the tiles, nothing outside
  the perimeter. The image is stretched to the 144in field, so anything outside
  the tiles shifts every line inward and the path will be planned against the
  wrong geometry.
- **Audience wall at the bottom.** That is where the planner puts y = 0, and it
  is how the setup guides are written.
- Around 1000px square is plenty; it sits behind the path at 55% opacity.

## How it behaves

- An image **replaces** that season's drawn tape rather than sitting under it —
  two versions of the same lines slightly out of register is worse than either.
- `id` matching a drawn season (`decode`, `centerstage`, `powerplay`, `freight`,
  `ultimate`) overrides the drawing. Any other `id` adds a season we have no
  drawing for at all — that is how Into the Deep, Skystone, Rover Ruckus and
  Relic Recovery can appear.
- Switching to a season without an image clears the previous one. An image you
  opened yourself with the **Field image** button is left alone.

## Before you commit one

These are published on the site, so it has to be an image the team is entitled
to publish — your own render, your own photo of your own field, or something
carrying a licence that allows it. FIRST's field renderings are theirs. That is
why the planner draws its own geometry from the written setup guides instead of
shipping their artwork, and it is the one thing to check before adding a file.
