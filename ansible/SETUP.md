# Quick Setup Guide

This guide will help you set up automated deployments for notemine.io.

## Step 1: Prepare Your VPS

### Get a VPS
- Provider: DigitalOcean, Hetzner, Linode, Vultr, etc.
- OS: Ubuntu 24.04 LTS
- Minimum: 1 CPU, 1GB RAM, 10GB disk

### Initial VPS Setup

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Update system
apt update && apt upgrade -y

# Create deployment user
adduser deploy
usermod -aG sudo deploy

# Set up SSH key for deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Install Python (required by Ansible)
apt install -y python3 python3-pip

# Configure firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Step 2: Configure DNS

Point your domain to your VPS IP:

```
Type: A
Name: notemine.io (or @)
Value: YOUR_VPS_IP
TTL: 3600
```

Wait for DNS propagation (can take up to 48 hours, usually < 1 hour).

Verify: `dig notemine.io` or `nslookup notemine.io`

## Step 3: Generate SSH Key for GitHub Actions

On your local machine:

```bash
# Generate a new SSH key pair
ssh-keygen -t ed25519 -C "github-actions-notemine" -f ~/.ssh/notemine-deploy

# Copy the public key to your VPS
ssh-copy-id -i ~/.ssh/notemine-deploy.pub deploy@YOUR_VPS_IP

# Test the connection
ssh -i ~/.ssh/notemine-deploy deploy@YOUR_VPS_IP

# Display the private key (you'll need this for GitHub)
cat ~/.ssh/notemine-deploy
```

## Step 4: Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add these secrets:

| Name | Value | Example |
|------|-------|---------|
| `VPS_HOST` | Your VPS IP or domain | `1.2.3.4` or `server.example.com` |
| `VPS_USER` | SSH user with sudo access | `deploy` |
| `VPS_SSH_KEY` | Private SSH key | Contents of `~/.ssh/notemine-deploy` |
| `VPS_SSH_PORT` | SSH port (optional) | `22` (default) |

### Adding VPS_SSH_KEY

The private key should look like this:

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
...
(many lines)
...
AAAAC2dpdGh1Yi1hY3Rpb25zLW5vdGVtaW5lAQIDBA==
-----END OPENSSH PRIVATE KEY-----
```

Copy the **entire** key including the header and footer lines.

## Step 5: Test the Deployment

### Option A: Push to Master

```bash
# Make a small change to trigger deployment
cd /path/to/notemine
echo "# Deployment test" >> README.md
git add README.md
git commit -m "test: trigger deployment"
git push origin master
```

### Option B: Manual Dispatch

1. Go to GitHub → Actions
2. Select "Deploy GUI" or "Deploy Relay"
3. Click "Run workflow"
4. Select branch and click "Run workflow"

### Option C: Tag Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Step 6: Verify Deployment

### Check GitHub Actions

1. Go to your repository on GitHub
2. Click "Actions" tab
3. You should see workflow runs
4. Click on a run to see details and logs

### Check Your Site

```bash
# Check GUI
curl https://notemine.io

# Check relay NIP-11
curl -H "Accept: application/nostr+json" https://notemine.io

# Check WebSocket (install wscat: npm install -g wscat)
wscat -c wss://notemine.io
```

### Check Services on VPS

```bash
# SSH into VPS
ssh deploy@YOUR_VPS_IP

# Check relay service
sudo systemctl status notemine-relay
sudo journalctl -u notemine-relay -n 20

# Check Caddy
sudo systemctl status caddy
sudo journalctl -u caddy -n 20

# Verify files
ls -la /var/www/notemine/
ls -la /opt/notemine/relay/
ls -la /var/lib/notemine/data/
```

## Step 7: Configure .well-known Files

### NIP-05 (Nostr Verification)

Edit `packages/gui/public/.well-known/nostr.json`:

```json
{
  "names": {
    "yourname": "your-pubkey-hex"
  },
  "relays": {
    "your-pubkey-hex": ["wss://notemine.io"]
  }
}
```

### Lightning Address

Create `packages/gui/public/.well-known/lnurlp/yourname`:

```json
{
  "callback": "https://your-lightning-backend.com/lnurl/callback",
  "maxSendable": 100000000,
  "minSendable": 1000,
  "metadata": "[[\"text/plain\",\"Pay to yourname@notemine.io\"]]",
  "tag": "payRequest"
}
```

Then commit and push to deploy:

```bash
git add packages/gui/public/.well-known/
git commit -m "feat: add .well-known files"
git push origin master
```

## Common Issues

### DNS not resolving

```bash
# Check DNS propagation
dig notemine.io

# If not propagating, wait or check your DNS provider settings
```

### SSH connection fails

```bash
# Test SSH manually
ssh -i ~/.ssh/notemine-deploy deploy@YOUR_VPS_IP

# Check SSH key permissions
chmod 600 ~/.ssh/notemine-deploy
chmod 644 ~/.ssh/notemine-deploy.pub

# Verify public key is on VPS
ssh deploy@YOUR_VPS_IP 'cat ~/.ssh/authorized_keys'
```

### Workflow fails on build

```bash
# Check if local build works
pnpm install
pnpm --filter @notemine/gui build

# Or for relay
cd relay
go build ./cmd/relay
```

### Ansible playbook fails

```bash
# Test Ansible locally
cd ansible
ansible -i inventory.yml notemine_vps -m ping \
  --extra-vars "ansible_user=deploy" \
  --extra-vars "ansible_host=YOUR_VPS_IP"
```

### HTTPS not working

```bash
# SSH into VPS
ssh deploy@YOUR_VPS_IP

# Check Caddy logs
sudo journalctl -u caddy -n 50 | grep -i acme

# Verify DNS points to VPS
dig notemine.io

# Check firewall
sudo ufw status

# Manually reload Caddy
sudo systemctl reload caddy
```

### Relay not starting

```bash
# Check service status
sudo systemctl status notemine-relay

# Check logs
sudo journalctl -u notemine-relay -n 50

# Check binary permissions
ls -la /opt/notemine/relay/notemine-relay

# Check data directory permissions
ls -la /var/lib/notemine/data/

# Try running manually for debugging
sudo -u notemine /opt/notemine/relay/notemine-relay
```

## Next Steps

1. Monitor your deployments in GitHub Actions
2. Set up monitoring/alerting (optional)
3. Configure backups (see ansible/README.md)
4. Customize relay settings in `relay/cmd/relay/main.go`
5. Add your .well-known files for NIP-05 and Lightning

## Rollback

If a deployment breaks something:

```bash
# SSH into VPS
ssh deploy@YOUR_VPS_IP

# For GUI - restore previous version
# (Keep a backup or redeploy from a working commit)

# For relay - restore from previous binary
sudo systemctl stop notemine-relay
sudo cp /opt/notemine/relay/notemine-relay.backup /opt/notemine/relay/notemine-relay
sudo systemctl start notemine-relay

# Or redeploy from a working git commit
# Just re-run the workflow from that commit
```

## Security Checklist

- [ ] VPS firewall configured (only ports 22, 80, 443 open)
- [ ] SSH key authentication (password auth disabled)
- [ ] Deploy user with sudo (not using root)
- [ ] GitHub secrets configured (never commit them!)
- [ ] DNS configured with your domain
- [ ] Let's Encrypt HTTPS enabled (automatic via Caddy)
- [ ] Relay running as unprivileged user
- [ ] Systemd security hardening enabled

## Support

- Check the main README: `ansible/README.md`
- GitHub Issues: https://github.com/sandwichfarm/notemine/issues
- Review GitHub Actions logs for deployment errors
