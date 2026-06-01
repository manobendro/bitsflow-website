# 3D models

Drop your exported board model here as **`bitsflow.glb`** (binary glTF 2.0).

Then open `src/pages/index.astro` and set:

```js
const MODEL_URL = '/models/bitsflow.glb';
```

The hero (`src/components/react/Hero3D.tsx`) will load it instead of the
procedural placeholder board. See `GltfBoard` there to tweak scale/orientation.

**Export tips**
- Prefer `.glb` (textures embedded, single file). `.gltf`+textures also works.
- Keep it under ~5–10 MB; bake/apply transforms; use roughly real-world scale.
- Name the LED matrix mesh clearly (e.g. `LED_Matrix`) so it can be animated.
