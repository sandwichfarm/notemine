# Deployment Checklist

Use this checklist when setting up notemine.io deployment for the first time.

## Prerequisites

- [ ] Ubuntu 24.04 VPS provisioned
- [ ] Domain (notemine.io) registered
- [ ] GitHub repository access
- [ ] SSH access to VPS

## VPS Setup

- [ ] VPS updated (`apt update && apt upgrade`)
- [ ] Deploy user created with sudo access
- [ ] Python3 installed on VPS
- [ ] Firewall configured (ports 22, 80, 443)
- [ ] SSH key-based authentication configured

## DNS Configuration

- [ ] A record pointing notemine.io to VPS IP
- [ ] DNS propagation verified (`dig notemine.io`)

## GitHub Configuration

- [ ] SSH key pair generated for deployment
- [ ] Public key added to VPS `~/.ssh/authorized_keys`
- [ ] Private key tested locally
- [ ] GitHub secrets configured:
  - [ ] `VPS_HOST`
  - [ ] `VPS_USER`
  - [ ] `VPS_SSH_KEY`
  - [ ] `VPS_SSH_PORT` (if not 22)

## Initial Deployment

- [ ] GUI workflow tested (manual dispatch or push)
- [ ] Relay workflow tested (manual dispatch or push)
- [ ] Both workflows completed successfully
- [ ] No errors in GitHub Actions logs

## Verification

- [ ] GUI accessible at https://notemine.io
- [ ] HTTPS certificate issued (automatic via Caddy)
- [ ] Relay NIP-11 accessible (`curl -H "Accept: application/nostr+json" https://notemine.io`)
- [ ] WebSocket connection works (`wscat -c wss://notemine.io`)

## Service Health (on VPS)

- [ ] Caddy running (`systemctl status caddy`)
- [ ] Relay running (`systemctl status notemine-relay`)
- [ ] No errors in Caddy logs (`journalctl -u caddy`)
- [ ] No errors in relay logs (`journalctl -u notemine-relay`)

## Files Deployed

- [ ] GUI files in `/var/www/notemine/`
- [ ] Relay binary in `/opt/notemine/relay/`
- [ ] Relay data directory created `/var/lib/notemine/data/`
- [ ] Caddyfile in `/etc/caddy/Caddyfile`
- [ ] Systemd service in `/etc/systemd/system/notemine-relay.service`

## .well-known Setup

- [ ] NIP-05 nostr.json configured (if needed)
- [ ] Lightning address configured (if needed)
- [ ] .well-known files accessible via HTTPS

## Optional

- [ ] Monitoring/alerting set up
- [ ] Backup strategy implemented
- [ ] Log rotation configured
- [ ] Custom relay settings configured

## Troubleshooting

If anything fails, see:
- `ansible/SETUP.md` - Setup guide with troubleshooting
- `ansible/README.md` - Detailed documentation
- GitHub Actions logs - Workflow execution details
- VPS logs - Service-specific issues

## Post-Deployment

- [ ] Test creating notes with PoW
- [ ] Verify relay accepts valid PoW notes
- [ ] Verify relay rejects insufficient PoW
- [ ] Test GUI functionality
- [ ] Monitor resource usage on VPS

## Ongoing

- [ ] Monitor GitHub Actions for deployment status
- [ ] Review logs periodically
- [ ] Update DNS if VPS IP changes
- [ ] Renew domain registration
- [ ] Keep VPS updated (`apt update && apt upgrade`)

---

**Last Verified**: [Date]
**Verified By**: [Name]
**VPS**: [IP/Hostname]
**Notes**: [Any special configuration]
