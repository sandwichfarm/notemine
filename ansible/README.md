# Notemine Deployment Infrastructure

This directory contains Ansible playbooks and GitHub Actions workflows for deploying the notemine.io infrastructure.

## Architecture

### Components

1. **SolidJS SPA (GUI)**: Static files served from `/var/www/notemine/`
2. **Go Relay**: Nostr relay running as systemd service on port 3334
3. **Caddy**: Reverse proxy and web server handling routing

### Routing Logic

Caddy routes requests to notemine.io based on:

- **`Accept: application/nostr+json`**: Returns relay's NIP-11 JSON document
- **WebSocket upgrade**: Routes to relay (port 3334)
- **`.well-known/*`**: Serves static files from SPA directory
- **Everything else**: Serves SPA with client-side routing

## GitHub Workflows

### Triggers

Both workflows trigger on:
- Push to `master` branch (with path filters)
- Tags matching `v*.*.*`
- Manual dispatch via GitHub UI

### deploy-gui.yml

Deploys the SolidJS SPA when `packages/gui/**` changes:
1. Builds the SPA with pnpm
2. Deploys to VPS via Ansible
3. Updates Caddy configuration
4. Reloads Caddy

### deploy-relay.yml

Deploys the Go relay when `relay/**` changes:
1. Compiles the Go binary
2. Deploys to VPS via Ansible
3. Installs/updates systemd service
4. Restarts the relay service

## Required GitHub Secrets

Configure these in your repository settings:

```
VPS_HOST          # Server IP or hostname
VPS_USER          # SSH user with sudo privileges
VPS_SSH_KEY       # Private SSH key for authentication
VPS_SSH_PORT      # (Optional) SSH port, defaults to 22
```

## Ansible Playbooks

### playbook-gui.yml

Handles GUI deployment:
- Installs Caddy (if not present)
- Creates deployment directory (`/var/www/notemine/`)
- Syncs built SPA files
- Deploys Caddyfile from template
- Reloads Caddy

### playbook-relay.yml

Handles relay deployment:
- Creates system user for relay
- Creates deployment directory (`/opt/notemine/relay/`)
- Creates data directory (`/var/lib/notemine/data/`)
- Deploys binary
- Installs systemd service
- Enables and starts service

## Manual Deployment

### Prerequisites

1. Ubuntu 24.04 VPS
2. SSH access with sudo privileges
3. Ansible installed locally

### Deploy GUI

```bash
# Build the GUI
cd /path/to/notemine
pnpm install
pnpm --filter @notemine/gui build

# Run Ansible
cd ansible
ansible-playbook -i inventory.yml playbook-gui.yml \
  --extra-vars "gui_dist_path=../packages/gui/dist" \
  --extra-vars "ansible_user=YOUR_USER" \
  --extra-vars "ansible_host=YOUR_HOST"
```

### Deploy Relay

```bash
# Build the relay
cd /path/to/notemine/relay
go build -o notemine-relay ./cmd/relay

# Run Ansible
cd ../ansible
ansible-playbook -i inventory.yml playbook-relay.yml \
  --extra-vars "relay_binary_path=../relay/notemine-relay" \
  --extra-vars "ansible_user=YOUR_USER" \
  --extra-vars "ansible_host=YOUR_HOST"
```

## VPS Setup

### Initial Server Configuration

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages (Ansible will handle the rest)
sudo apt install -y python3
```

### Firewall Configuration

```bash
# Allow HTTP, HTTPS, and SSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### DNS Configuration

Point your domain to the VPS:

```
A     notemine.io     YOUR_VPS_IP
AAAA  notemine.io     YOUR_VPS_IPv6  (if available)
```

## Service Management

### Relay Service

```bash
# Check status
sudo systemctl status notemine-relay

# View logs
sudo journalctl -u notemine-relay -f

# Restart
sudo systemctl restart notemine-relay

# Stop
sudo systemctl stop notemine-relay
```

### Caddy

```bash
# Check status
sudo systemctl status caddy

# View logs
sudo journalctl -u caddy -f

# Reload config (without downtime)
sudo systemctl reload caddy

# Restart
sudo systemctl restart caddy

# Validate Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
```

## Directory Structure

```
/var/www/notemine/              # GUI static files
├── index.html
├── assets/
└── .well-known/
    └── nostr.json

/opt/notemine/relay/            # Relay binary
└── notemine-relay

/var/lib/notemine/data/         # Relay data (LMDB)
└── relay.lmdb/

/etc/caddy/
└── Caddyfile                   # Caddy configuration

/etc/systemd/system/
└── notemine-relay.service      # Systemd service
```

## Troubleshooting

### GUI not loading

```bash
# Check Caddy status
sudo systemctl status caddy

# Check Caddy logs
sudo journalctl -u caddy -n 50

# Verify files exist
ls -la /var/www/notemine/

# Test Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile
```

### Relay not connecting

```bash
# Check relay status
sudo systemctl status notemine-relay

# Check relay logs
sudo journalctl -u notemine-relay -n 50

# Test relay locally
wscat -c ws://localhost:3334

# Check if relay is listening
sudo netstat -tlnp | grep 3334
```

### SSL/TLS issues

```bash
# Check Caddy logs for ACME errors
sudo journalctl -u caddy -n 100 | grep -i acme

# Ensure ports 80 and 443 are open
sudo ufw status

# Verify DNS is pointing to VPS
dig notemine.io
```

### Deployment failures

```bash
# Check Ansible logs in GitHub Actions
# Verify SSH connectivity
ssh -i ~/.ssh/your_key user@your_vps

# Test Ansible connectivity
ansible -i inventory.yml notemine_vps -m ping
```

## Security Considerations

### Systemd Hardening

The relay service includes security hardening:
- No new privileges
- Private tmp directory
- Protected system directories
- Limited capabilities
- Syscall filtering
- Read-write access only to data directory

### Caddy Security

- Automatic HTTPS with Let's Encrypt
- Security headers (HSTS, CSP, X-Frame-Options)
- TLS 1.2+ only
- Gzip/Zstd compression

### Firewall

Only expose necessary ports:
- 22 (SSH)
- 80 (HTTP - redirects to HTTPS)
- 443 (HTTPS)

Port 3334 (relay) should NOT be exposed directly - only accessible via Caddy reverse proxy.

## .well-known Files

Place .well-known files in `packages/gui/public/.well-known/`:

```
packages/gui/public/.well-known/
├── nostr.json              # NIP-05 identifiers
├── lnurlp/                 # Lightning addresses
└── other files...
```

These will be automatically deployed with the GUI and served by Caddy.

## Monitoring

### Log Locations

- **Relay**: `journalctl -u notemine-relay`
- **Caddy**: `journalctl -u caddy` and `/var/log/caddy/notemine.log`
- **System**: `journalctl -xe`

### Health Checks

```bash
# Check relay NIP-11
curl -H "Accept: application/nostr+json" https://notemine.io

# Check GUI
curl https://notemine.io

# Check WebSocket (requires wscat: npm install -g wscat)
wscat -c wss://notemine.io
```

## Backup

### Relay Data

```bash
# Backup LMDB database
sudo systemctl stop notemine-relay
sudo tar -czf relay-backup-$(date +%Y%m%d).tar.gz /var/lib/notemine/data/
sudo systemctl start notemine-relay
```

### GUI Files

```bash
# Backup GUI (usually not necessary as it's in git)
sudo tar -czf gui-backup-$(date +%Y%m%d).tar.gz /var/www/notemine/
```

## Updates

### Automatic via GitHub Actions

Push to master or create a tag - workflows will automatically deploy.

### Manual Update

Re-run the respective Ansible playbook with updated files.

## Support

For issues or questions:
- GitHub Issues: https://github.com/sandwichfarm/notemine/issues
- Check logs first (see Troubleshooting section)
