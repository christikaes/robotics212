# robotics212

A blank 3D workspace built with React, Vite, and react-three-fiber.

## Stack

- [Vite](https://vite.dev/) + React + TypeScript
- [three.js](https://threejs.org/)
- [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) — React renderer for three.js
- [@react-three/drei](https://drei.docs.pmnd.rs/) — helpers (OrbitControls, Grid, etc.)

## Scripts

```bash
npm install      # install deps
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview production build
```

## Workspace

The 3D scene lives in `src/App.tsx`. It currently renders:

- A dark background
- Ambient + directional lighting (with shadows enabled)
- An infinite grid floor
- Orbit controls (drag to rotate, scroll to zoom, right-drag to pan)

Add meshes, models, or controls inside the `<Canvas>`.
