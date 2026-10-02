# Run the backend free on Oracle Cloud

One Always Free ARM VM (4 CPU, 24 GB) runs all 18 services, the gateway, Postgres, NATS, Valkey and Caddy (automatic HTTPS). CD deploys to it on every push to `main`. The website stays on Vercel and talks to it.

## One-time setup (about 20 minutes)

1. **Account.** Sign up at cloud.oracle.com (a card is needed to verify you; Always Free resources are not charged). Pick a home region and keep it.
2. **Create the VM.** Compute → Instances → Create instance:
   - Image: **Ubuntu 24.04** (aarch64). Shape: **Ampere → VM.Standard.A1.Flex**, 4 OCPU, 24 GB.
   - Networking: a public IPv4 address.
   - SSH keys: **Generate a key pair** and download the private key.
   - Advanced options → Management → paste the contents of `infra/vm/cloud-init.yaml`.
   - If it says "Out of capacity", try another availability domain or retry later.
3. **Open the ports.** The instance's subnet → Security list → add ingress rules for TCP 80 and 443 from `0.0.0.0/0`.
4. **Add three GitHub secrets** (repository → Settings → Secrets and variables → Actions):
   - `VM_HOST`: the VM's public IP address.
   - `VM_SSH_KEY`: the full text of the private key you downloaded.
   - `VM_HOST_KEY`: output of `ssh-keyscan -t ed25519 <ip>` (pins the server's identity).
5. Push to `main` (or run the CD workflow). It builds the images for amd64 and arm64, deploys them, smoke-tests `https://<ip-with-dashes>.sslip.io`, then rebuilds the website against it.

## Afterwards

- The backend address is `https://<ip with dashes>.sslip.io` (for 1.2.3.4: `1-2-3-4.sslip.io`).
- The admin login is `admin@logicpath.dev`; its password is in `/opt/logicpath/.env` on the server (`ADMIN_PASSWORD`). Change `WEB_ORIGIN` there if the website address changes, then `docker compose up -d`.
- Mails (parent consent, password reset) are only logged until you set `SMTP_URL` in that file (any SMTP relay, e.g. Brevo's free plan).
- Deploys go back to the previous version by themselves if the new one is not healthy within 4 minutes.
- Back up `pgdata`: `docker compose exec postgres pg_dumpall -U postgres | gzip > backup.sql.gz`.
