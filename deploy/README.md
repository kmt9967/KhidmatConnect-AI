# deploy/

Server-side deployment assets for KhidmatConnect AI (no secrets live here):

- `nginx/khidmatconnect.conf` — reverse proxy :80/:443 → 127.0.0.1:3000
- `systemd/khidmatconnect.service` — production process (reboot-safe)

Full ordered runbook: [`../DEPLOYMENT_ALIBABA_ECS.md`](../DEPLOYMENT_ALIBABA_ECS.md)

Real environment files stay OUTSIDE the repo:
`/etc/khidmatconnect/khidmatconnect.env` (chmod 600, loaded by systemd).
