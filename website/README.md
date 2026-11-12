# Landing page

Static site for https://lanshare-ftp.byteworkstation.online

Download links start out pointing at v1.1.0. In the browser, `main.js` swaps them for the latest GitHub release, so new releases don't need a redeploy.

## Deploy
On the server, the site lives in `/root/lanshare-ftp-landing`: nginx behind Traefik, with HTTPS from Let's Encrypt.
```bash
tar -C website/deploy -cf - docker-compose.yml nginx.conf | ssh root@SERVER 'tar -C /root/lanshare-ftp-landing -xf -'
tar -C website --exclude=deploy --exclude=README.md -cf - . | ssh root@SERVER 'tar -C /root/lanshare-ftp-landing/site -xf -'
ssh root@SERVER 'cd /root/lanshare-ftp-landing && docker compose up -d'
```
