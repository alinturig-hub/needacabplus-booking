# TaxiPlus workspaces

The same application serves three user-facing hosts:

| Host | Entry point | Purpose |
| --- | --- | --- |
| `admin.needacabplus.app` | `/admin` | Administration, integrations and configuration |
| `dispatch.needacabplus.app` | `/dispatch` | Dispatcher, booking search, analysis and live map |
| `webapp.needacabplus.app` | `/` | Customer booking app |

## Deploying the Dispatch host

1. Point `dispatch.needacabplus.app` to the same ingress as `admin.needacabplus.app` (a CNAME to the Admin host is suitable if the DNS provider permits it).
2. Add `dispatch.needacabplus.app` to the existing TaxiPlus application in Coolify and provision HTTPS for it. Do not create a separate application or database.
3. Set `DISPATCH_DOMAIN_ENABLED=true` on that application and redeploy. Until then, `/dispatch` stays available on the Admin host so the existing dispatcher is not interrupted.
4. Check that `/` redirects to `/dispatch`, `/dispatch/login` loads, and an unauthenticated request to `/dispatch` redirects to the Dispatch login.
5. Check that visiting `/admin/configuration` on the Dispatch host redirects to the Admin host, and an Admin link to `/dispatch` reaches the Dispatch host.

The first release uses the existing administrator credentials to sign in independently on each host. Cookies are host-only, so signing in to Admin does not sign in to Dispatch. Dispatcher accounts and permissions require a later authentication change; the domains alone are not a role-based access boundary.
