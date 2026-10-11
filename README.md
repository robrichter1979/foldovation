# FoldMyPhoto

A web app that transforms square images into photogami artwork using a library of fold mappings. Buyers purchase a single-use access token, upload up to 25 images, choose a mapping style, preview the results, and download a PDF.

Live at: **https://www.foldmyphoto.com**

---

## Project structure

```
foldovation/
├── foldo/                  # Python package
│   ├── core.py             # Image processing logic
│   ├── api.py              # FastAPI server
│   └── config.py           # Settings (env-configurable)
├── scripts/
│   ├── generate_token.py         # Create & email a token to a buyer
│   ├── generate_instructions_pdf.py  # Build the buyer instructions PDF
│   └── rebuild_samples.py        # Regenerate mapping preview thumbnails
├── web/                    # Next.js frontend
├── mappings/               # Fold mapping data (JSON)
├── image_data/             # Static assets & caches
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
└── requirements.txt
```

---

## Requirements

- Python 3.12+
- Node.js 18+
- A [pyenv](https://github.com/pyenv/pyenv) virtualenv (recommended) or any Python 3.12 environment

---

## Local setup

### 1. Python environment

```bash
pyenv virtualenv 3.12.1 foldo
pyenv activate foldo
pip install -r requirements.txt
```

### 2. Frontend dependencies

```bash
cd web && npm install
```

### 3. Environment variables

Create a `.env` file in the project root:

```env
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
INTERNAL_EMAIL=photogami.shop@gmail.com
APP_URL=https://www.foldmyphoto.com
CORS_ORIGIN=https://www.foldmyphoto.com
ADMIN_PASSWORD=changeme
```

#### Getting a Gmail App Password

1. Sign in as `photogami.shop@gmail.com`
2. Enable **2-Step Verification** at [myaccount.google.com/security](https://myaccount.google.com/security)
3. Create an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Paste the 16-character password (with or without spaces) into `.env`

### 4. Running locally

Open two terminals from the project root:

**Terminal 1 — API**
```bash
uvicorn foldo.api:app --reload --port 8000
```

**Terminal 2 — Frontend**
```bash
cd web && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts — when to run what

### `scripts/generate_token.py` — issue a token to a buyer

Run this **every time a new buyer pays** and needs access:

```bash
python scripts/generate_token.py buyer@example.com
```

This:
1. Generates a unique `FOLDO-XXXXXXXXXXXX` token and saves it to `tokens.db`
2. Emails the token to the buyer with the instructions PDF attached
3. Records whether the email was delivered

Requires `GMAIL_APP_PASSWORD` in `.env`. If not set, the token is still created but no email is sent.

---

### `scripts/rebuild_samples.py` — regenerate mapping thumbnails

Run this **when you change the template/sample image** or **after adding new mappings**:

```bash
# uses the default template (configured via SAMPLE_IMAGE_PATH)
python scripts/rebuild_samples.py

# or specify a different image
python scripts/rebuild_samples.py --image image_data/my_photo.jpg
```

After running, **restart the API server** so it picks up the new cache file.

> The cache lives at `image_data/mapping_samples_cache.json` and is volume-mounted in Docker so it persists across deploys.

---

### `scripts/generate_instructions_pdf.py` — preview the instructions PDF

Run this **to inspect the buyer-facing PDF locally** (e.g. after wording changes):

```bash
python scripts/generate_instructions_pdf.py
# writes foldmyphoto_instructions.pdf in the current directory

python scripts/generate_instructions_pdf.py --output /tmp/preview.pdf
```

This script is also called automatically by `generate_token.py` when sending the token email — you don't need to run it manually in production.

---

## Token management

### View the token database

Open `tokens.db` with any SQLite viewer:

- **VS Code** — install the *SQLite Viewer* extension, then click `tokens.db`
- **CLI** — `sqlite3 tokens.db` → `.headers on` → `.mode column` → `SELECT * FROM tokens;`
- **TablePlus** — [tableplus.com](https://tableplus.com) (free tier works)

### Token table columns

| Column | Description |
|---|---|
| `email` | Buyer's email address |
| `token` | The access token |
| `used` | `1` once the buyer has downloaded their PDF |
| `created_at` | When the token was created |
| `used_at` | When the PDF was downloaded |
| `token_email_sent` | `1` if the token email was delivered successfully |
| `token_email_sent_at` | Timestamp of the token email attempt |
| `pdf_sent` | `1` if a copy of the PDF was emailed to the internal address |
| `pdf_sent_at` | Timestamp of the PDF email attempt |

---

## Deployment (Hetzner + Docker)

The app runs as a Docker container on a Hetzner VPS. The Next.js frontend is built separately and served via a reverse proxy (or directly as a static export).

### First-time setup on the server

```bash
# 1. SSH into the server
ssh root@49.13.169.197

# 2. Install Docker (if not already installed)
curl -fsSL https://get.docker.com | sh

# 3. Clone the repo
git clone https://github.com/robrichter1979/foldovation.git /root/foldovation
cd /root/foldovation

# 4. Create the .env file
nano .env
# paste in GMAIL_APP_PASSWORD, INTERNAL_EMAIL, APP_URL, CORS_ORIGIN, ADMIN_PASSWORD

# 5. Build and start
docker compose up -d --build
```

### Deploying an update

```bash
ssh root@49.13.169.197
cd /root/foldovation

git pull
cd web && npm run build && cd ..
systemctl restart foldovation-web.service
docker compose up -d --build
```

### Checking logs

```bash
docker compose logs -f api
```

### Domain & HTTPS

The domain **foldmyphoto.com** points to `49.13.169.197`. For HTTPS, use Caddy as a reverse proxy (it auto-provisions Let's Encrypt certificates):

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy
```

`/etc/caddy/Caddyfile`:
```
www.foldmyphoto.com {
    reverse_proxy localhost:8000
}
```

Then: `systemctl reload caddy`

---

## Configuration reference

All settings live in `foldo/config.py` and can be overridden via `.env`.

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |
| `MAPPINGS_PATH` | `mappings/all_foldo_mappings_v2.json` | Fold mapping data file |
| `HIDDEN_IMAGE_PATH` | `image_data/hidden_v5.png` | Hidden layer image |
| `BACKGROUND_IMAGE_PATH` | `image_data/background_v5.png` | Background layer image |
| `DEFAULT_IMAGE_PATH` | `image_data/square_image.jpg` | Fallback image for API preview |
| `SAMPLE_IMAGE_PATH` | `image_data/template_tiger_family.png` | Template used for mapping thumbnails |
| `FOLD_INSTRUCTIONS_PATH` | `image_data/fold_instructions.png` | Fold instructions image appended to buyer PDF |
| `TOKEN_DB` | `tokens.db` | SQLite database path |
| `SAMPLES_CACHE_PATH` | `image_data/mapping_samples_cache.json` | Mapping thumbnail cache |
| `REQUIRED_IMAGES` | `25` | Number of images a buyer must upload |
| `GMAIL_APP_PASSWORD` | _(empty)_ | Gmail App Password for sending emails |
| `INTERNAL_EMAIL` | `photogami.shop@gmail.com` | Address used as sender and internal recipient |
| `APP_URL` | `http://localhost:3000` | Public URL shown in buyer emails |
| `ADMIN_PASSWORD` | _(empty)_ | Password for the `/admin` page |
