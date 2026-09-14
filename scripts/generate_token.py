"""
Usage: python scripts/generate_token.py <email>
"""
import secrets
import smtplib
import sqlite3
import sys
from datetime import datetime, timezone
from email.message import EmailMessage

sys.path.insert(0, __import__("os").path.join(__import__("os").path.dirname(__file__), ".."))
from foldo.config import settings

SENDER = "foldovation@gmail.com"


def init_db(conn: sqlite3.Connection):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tokens (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            email        TEXT NOT NULL,
            token        TEXT NOT NULL UNIQUE,
            used         INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL,
            used_at      TEXT,
            pdf_sent              INTEGER NOT NULL DEFAULT 0,
            pdf_sent_at           TEXT,
            token_email_sent      INTEGER NOT NULL DEFAULT 0,
            token_email_sent_at   TEXT
        )
    """)
    existing = {row[1] for row in conn.execute("PRAGMA table_info(tokens)")}
    for col, definition in [
        ("pdf_sent",            "INTEGER NOT NULL DEFAULT 0"),
        ("pdf_sent_at",         "TEXT"),
        ("token_email_sent",    "INTEGER NOT NULL DEFAULT 0"),
        ("token_email_sent_at", "TEXT"),
    ]:
        if col not in existing:
            conn.execute(f"ALTER TABLE tokens ADD COLUMN {col} {definition}")
    conn.commit()


def generate(email: str) -> str:
    token = "FOLDO-" + secrets.token_urlsafe(12).upper()[:12]
    with sqlite3.connect(settings.token_db) as conn:
        init_db(conn)
        conn.execute(
            "INSERT INTO tokens (email, token, created_at) VALUES (?, ?, ?)",
            (email.lower().strip(), token, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    return token


def send_token_email(recipient: str, token: str):
    if not settings.gmail_app_password:
        print("⚠  GMAIL_APP_PASSWORD not set in .env — skipping email.")
        return

    msg = EmailMessage()
    msg["Subject"] = "Your Foldovation Access Token"
    msg["From"] = SENDER
    msg["To"] = recipient
    msg.set_content(f"""\
Hi,

Here is your Foldovation access token:

  {token}

Visit {settings.app_url} and enter your email address along with this token to get started.

The token is single-use — once you download your PDF it will expire.

– The Foldovation Team
""")

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
            smtp.starttls()
            smtp.login(SENDER, settings.gmail_app_password.replace(" ", ""))
            smtp.send_message(msg)
        sent = True
    except Exception as e:
        print(f"⚠  Failed to send token email: {e}")
        sent = False

    with sqlite3.connect(settings.token_db) as conn:
        conn.execute(
            "UPDATE tokens SET token_email_sent = ?, token_email_sent_at = ? WHERE token = ?",
            (1 if sent else 0, datetime.now(timezone.utc).isoformat(), token.strip()),
        )
        conn.commit()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/generate_token.py <email>")
        sys.exit(1)
    email = sys.argv[1]
    token = generate(email)
    print(f"\nToken created for {email}:\n  {token}\n")
    send_token_email(email, token)
    print(f"Email sent to {email}." if settings.gmail_app_password else "Add GMAIL_APP_PASSWORD to .env to enable email sending.")
