# Deploying College ERP (single server)

One Docker image runs the whole application (Next.js + the internal face-recognition
service). `deploy/deploy.sh` turns a fresh Linux server into a running, HTTPS-enabled
installation and is also how you ship updates.

```
              Internet
                 │ 80/443
        ┌────────▼────────┐   one server (EC2 / Lightsail / any Ubuntu VM)
        │ Caddy           │   automatic HTTPS (Let's Encrypt), HTTP→HTTPS
        └────────┬────────┘
        ┌────────▼────────────────────────────┐
        │ app  (the single image)             │   Next.js :3000
        │   └ face service 127.0.0.1:8001     │   never reachable from outside
        └────────┬──────────────────┬─────────┘
        ┌────────▼────────┐  ┌──────▼──────────────┐
        │ Postgres 17     │  │ S3 / R2 bucket      │  photos (deleted after use),
        │ + pgvector      │  │ (private)           │  nightly DB backups
        └─────────────────┘  └─────────────────────┘
```

## 1. One-time AWS setup (~15 minutes)

1. **Server** — EC2 `t3.medium` (2 vCPU, 4 GB) or Lightsail 4 GB, **Ubuntu 24.04**, 30 GB disk.
   Smaller instances work for small colleges; the deploy adds swap automatically when memory
   is under ~3.5 GB because building the image needs it.
2. **Elastic IP** — allocate and attach one, so the address survives restarts.
3. **Security group** — inbound **22** (your IP only, ideally), **80** and **443** (anywhere).
   Nothing else: the database and face service are never exposed.
4. **DNS** — create an `A` record, e.g. `erp.college.edu → <Elastic IP>`. HTTPS certificates
   are issued automatically once this resolves.
5. **S3 bucket** — create a bucket (e.g. `college-erp-private`) in the same region, with
   **Block all public access** on. Then an IAM user (or instance role) with only this policy:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::college-erp-private/*"
       }
     ]
   }
   ```

   Create an access key for that user. (Cloudflare R2 works the same way — use its endpoint
   and `S3_REGION=auto`.) Optional: a lifecycle rule expiring `backups/` after e.g. 90 days.

## 2. Configure (on your laptop)

```bash
cp deploy/env.deploy.example deploy/.env.deploy   # git-ignored
```

Fill in `DOMAIN`, `ACME_EMAIL`, the `S3_*` values and the first administrator
(`ADMIN_LOGIN_ID`, `ADMIN_EMAIL`, `ADMIN_NAME`). The database password and session secret are
generated on the server on the first deploy and kept in `/opt/college-erp/secrets.env`.

## 3. Deploy

```bash
deploy/deploy.sh --host ubuntu@<elastic-ip> --key ~/.ssh/college-erp.pem
```

The first run installs Docker, uploads the code, builds the image on the server (~5–8 minutes),
applies migrations, creates the first administrator and starts everything. **It prints the
administrator's temporary password once** — sign in at `https://<DOMAIN>` and change it.

Requirements on your laptop: `bash`, `ssh`, `rsync`, `git`. The SSH user needs passwordless
`sudo` (the default `ubuntu` user on EC2/Lightsail has it).

## 4. Updates

Pull/merge the new code, then run the same command again. Each release:

- builds a new image tagged `<git-sha>-<timestamp>` (the three newest are kept),
- applies new migrations, then swaps the app container,
- waits for `/api/health`; if the new version isn't healthy it **rolls back** to the previous
  image automatically and the command fails.

Your data, secrets and settings are never touched by a redeploy. Expect a few seconds of
downtime while the app container restarts.

## 5. Operations

All commands run on the server in `/opt/college-erp`:

```bash
cd /opt/college-erp
alias dc='sudo docker compose --env-file stack.env -f compose.yml'

dc ps                                  # status (app shows "healthy")
dc logs -f app                         # application + face service logs
curl -s https://<DOMAIN>/api/health    # {"ok":true,"database":true,"faceService":true}

sudo ./backup.sh                       # backup now (also runs nightly at 02:30)
ls backups/                            # local dumps, kept BACKUP_RETENTION_DAYS days

# Manual rollback to an earlier image:
sudo docker images college-erp         # pick a tag
sudo sed -i "s|^APP_IMAGE=.*|APP_IMAGE=college-erp:<tag>|" stack.env && dc up -d app
```

**Restore a backup** (overwrites the current data):

```bash
dc stop app
gunzip -c backups/college_erp-<timestamp>.sql.gz | dc exec -T db psql -U erp -d college_erp -v ON_ERROR_STOP=1
dc start app
```

Restore into a fresh database (`dc down` keeps volumes; `dc down -v` deletes them) if the
existing one is damaged. Test a restore at least once.

Backups are also copied to `s3://<bucket>/backups/` when `BACKUP_UPLOAD=true`. Uploaded
photos are not part of the database dump; they're short-lived by design (enrollment photos
are deleted after processing, classroom photos when attendance is confirmed).

## 6. Troubleshooting

| Symptom                                         | Check                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS not working                               | DNS `A` record points at the server; ports 80/443 open in the security group; `dc logs caddy`                                             |
| `faceService: false` in health                  | `dc logs app` — the face service runs inside the app container; the app keeps working with manual attendance                              |
| Build killed / out of memory                    | Use a 4 GB instance, or confirm swap is on (`swapon --show`)                                                                              |
| Students blocked as "too many sign-in attempts" | Caddy must be the only thing in front of the app (it sets the client IP); behind another load balancer, make it forward `X-Forwarded-For` |
| Can't sign in after changing `DOMAIN`           | Redeploy so `AUTH_URL` is regenerated                                                                                                     |

## Trying it locally

`deploy/deploy.sh --local` runs the server half on your own machine (needs Docker), using a
`deploy/.env.deploy` with `DOMAIN=localhost`, `HTTP_PORT=8080`, `HTTPS_PORT=8443` and an S3
endpoint reachable from containers (e.g. the dev MinIO at `http://host.docker.internal:9000`).
Caddy then serves `https://localhost:8443` with its own local certificate authority (your
browser will warn). Remove it with
`cd .deploy-local && docker compose --env-file stack.env -f compose.yml down -v`.

## The image on its own

```bash
docker build -t college-erp .
docker run --env-file app.env college-erp migrate     # apply migrations
docker run --env-file app.env -e ADMIN_LOGIN_ID=… -e ADMIN_EMAIL=… -e ADMIN_NAME=… college-erp bootstrap
docker run --env-file app.env -p 3000:3000 college-erp  # serve (default)
```

It needs `DATABASE_URL` (Postgres with pgvector), `AUTH_SECRET`, `AUTH_URL` and the `S3_*`
variables; the face service token is generated inside the container. It runs as a non-root
user, has a built-in health check, and exits if either internal process dies so the
orchestrator restarts it — usable as-is on ECS, App Runner, Kubernetes or Fly.io.
