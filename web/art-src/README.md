# Source art

The full-resolution originals for the category images, and the log of how they
were generated.

They live here rather than in `public/art/` because everything under `public/`
is copied verbatim into the build and uploaded on every deploy. Nothing ever
referenced these PNGs — the site serves the WebP versions beside them — so 17 MB
was being published on each deploy and fetched by nobody, and
`.imagegen.log` was readable at `/art/.imagegen.log`.

Keep the originals. Regenerate a WebP with:

    cwebp -q 82 art-src/cat-rules.png -o public/art/cat-rules.webp
