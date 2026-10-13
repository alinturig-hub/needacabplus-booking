# Admin security

Open **Admin → Settings → Users & access** to add Admin or Dispatcher accounts with individual passwords. A Dispatcher account can use the Dispatch workspace and booking search, but cannot open Admin settings or manage users. The primary administrator account remains configured on the server.

Open **Admin → Settings → General & security** to enable two-factor sign-in. The configured authenticator or SMS method is currently shared by all staff accounts. Each user has a separate password and session, but the verification code comes from the primary administrator's configured method. Use this arrangement only with trusted staff until individual verification methods are added.

- **Authenticator app:** enter the displayed base32 secret into a TOTP app, then confirm a six-digit code. Codes use 30-second SHA-1 TOTP windows.
- **SMS:** configure and enable **Settings → SMS gateway** first. Send a setup code to the administrator mobile number and confirm it before SMS becomes a sign-in method. SMS sign-in codes expire after five minutes.
- Enabling or disabling a method requires the current administrator password. Disabling a method also requires a code from that method or, for SMS, an active authenticator.
- A password-only login cannot create a staff session once either method is enabled. Existing primary and staff sessions are invalidated when a method changes. Sessions are host-only and expire after 30 days. Disabling a user or changing their role or password revokes their sessions.

The TOTP secret is encrypted in PostgreSQL using `CREDENTIALS_ENCRYPTION_KEY` (falling back to `ADMIN_SESSION_SECRET`). Keep these keys stable across deployments. The database tables are installed by `db/init.sql` at application startup.
