# Foldovation

A web app that transforms square images into Foldo-style artwork using a library of fold mappings. Buyers purchase a single-use access token, upload 10 images, choose a mapping, preview the results, and download a PDF.

---

## Project structure

```
foldovation/
├── foldo/                  # Python package
│   ├── core.py             # Image processing logic
│   ├── api.py              # FastAPI server
│   └── config.py           # Settings (env-configurable)
├── scripts/
│   ├── generate_token.py   # Create & email a token to a buyer
│   └── rebuild_samples.py  # Regenerate mapping preview thumbnails
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

## Setup

### 1. Python environment

```bash
# create and activate a virtualenv (example using pyenv)
pyenv virtualenv 3.12.1 foldo
pyenv activate foldo

# install dependencies
pip install -r requirements.txt
```

### 2. Frontend dependencies

```bash
cd web && npm install
```

### 3. Environment variables

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `GMAIL_APP_PASSWORD` | Yes (for email) | 16-character Gmail App Password for `foldovation@gmail.com` |
| `APP_URL` | No | Public URL shown in buyer token emails (default: `http://localhost:3000`) |
| `CORS_ORIGIN` | No | Allowed frontend origin (default: `http://localhost:3000`) |

#### Getting a Gmail App Password

1. Sign in as `foldovation@gmail.com`
2. Go to [myaccount.google.com/security](https://myaccount.google.com/security) and enable **2-Step Verification**
3. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Create a new App Password and paste it into `.env`

---

## Running locally

Open two terminals from the project root:

**Terminal 1 — API**
```bash
uvicorn foldo.api:app --reload --port 8000
```

**Terminal 2 — Web**
```bash
cd web && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running with Docker

```bash
docker-compose up --build
```

The API runs on port `8000`. Run the Next.js frontend separately (see above) or deploy it to Vercel.

> Note: if deploying both API and frontend via Docker, update the `destination` URL in `web/next.config.js` from `http://localhost:8000` to `http://api:8000` to use Docker's internal network.

---

## Token management

### Create a token for a buyer

```bash
python scripts/generate_token.py buyer@example.com
```

This:
- Generates a unique `FOLDO-XXXXXXXXXXXX` token
- Saves it to `tokens.db`
- Emails the token to the buyer (requires `GMAIL_APP_PASSWORD` in `.env`)

### View the token database

Open `tokens.db` with any SQLite viewer. Recommended options:

- **VS Code** — install the *SQLite Viewer* extension, then click `tokens.db`
- **CLI** — `sqlite3 tokens.db` then `.headers on` / `.mode column` / `SELECT * FROM tokens;`
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
| `pdf_sent` | `1` if a copy of the PDF was emailed to `foldovation@gmail.com` |
| `pdf_sent_at` | Timestamp of the PDF email attempt |

---

## Updating mapping preview thumbnails

When you change the template image, regenerate the sample thumbnails:

```bash
# use the configured default template (image_data/template_tiger_family.png)
python scripts/rebuild_samples.py

# or specify a different image
python scripts/rebuild_samples.py --image image_data/some_other_template.png
```

Restart the API server afterwards so it picks up the new cache.

To change the default template permanently, update `sample_image_path` in `foldo/config.py` (or set it via `.env`).

---

## Configuration reference

All settings live in `foldo/config.py` and can be overridden via environment variables or a `.env` file.

| Setting | Default | Description |
|---|---|---|
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |
| `MAPPINGS_PATH` | `mappings/all_foldo_mappings_v1.json` | Fold mapping data file |
| `HIDDEN_IMAGE_PATH` | `image_data/hidden_v3.png` | Hidden layer image |
| `BACKGROUND_IMAGE_PATH` | `image_data/background_v4.png` | Background layer image |
| `DEFAULT_IMAGE_PATH` | `image_data/square_image.jpg` | Fallback image for API preview |
| `SAMPLE_IMAGE_PATH` | `image_data/template_tiger_family.png` | Template used for mapping thumbnails |
| `TOKEN_DB` | `tokens.db` | SQLite database path |
| `SAMPLES_CACHE_PATH` | `image_data/mapping_samples_cache.json` | Mapping thumbnail cache |
| `REQUIRED_IMAGES` | `10` | Number of images a buyer must upload |
| `GMAIL_APP_PASSWORD` | _(empty)_ | Gmail App Password for sending emails |
| `APP_URL` | `http://localhost:3000` | Public URL shown in buyer emails |
