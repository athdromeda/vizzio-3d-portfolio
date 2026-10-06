Flyer models go here as `.glb` files.

To use one, set `model: 'avatars/<file>.glb'` on the matching entry in `src/data/avatars.ts`.
Model rules: front faces +Z, up is +Y. The loader fits it to a 2-unit box, and falls back to the
built-in placeholder if the file fails to load. Only add models you have the rights to publish.
