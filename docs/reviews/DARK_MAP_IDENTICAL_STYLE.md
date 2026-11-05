# Identical light/dark map configuration

Read-only live verification on 2026-11-05 found /api/map/config selecting MapTiler /maps/streets-v4/style.json for BOTH lightStyleUrl and darkStyleUrl. Query strings and credentials are intentionally omitted.

The passenger map previously trusted the configured dark URL, so the bright day style replaced its initial dark fallback. Both map consumers now use one selector: identical day/night URLs select the existing dark raster fallback in dark mode. Distinct dark style URLs remain supported. Light mode is unchanged.

Validation: seven GPS/style unit tests; isolated actual login/booking browser test for guest GPS and dark initial map; targeted ESLint passed. Full TypeScript checking was attempted but blocked by the missing generated Prisma client in this isolated worktree and resulting unrelated type errors. No physical-device verification. No production configuration or deployment changes. No APK rebuild is needed for this web code correction because the testing APK loads the remote webapp; it requires publication of the web correction before devices receive it.

The current guard addresses identical URLs. A distinct URL which itself describes a light style still requires correct provider configuration.
