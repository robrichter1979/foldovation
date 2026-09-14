import ast
import asyncio
import base64
import json
import os
import smtplib
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from email.message import EmailMessage
from io import BytesIO
from typing import List, Optional

import cv2
import numpy as np
from PIL import Image
from docx import Document
from docx.shared import Inches
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from foldo.config import settings
from foldo.core import combine_to_final_image_new, restore_tuples


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.token_db)
    conn.row_factory = sqlite3.Row
    return conn


def init_token_db():
    with get_db() as conn:
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


def validate_token(email: str, token: str) -> sqlite3.Row | None:
    with get_db() as conn:
        return conn.execute(
            "SELECT * FROM tokens WHERE email = ? AND token = ? AND used = 0",
            (email.lower().strip(), token.strip()),
        ).fetchone()


def mark_token_used(token: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE tokens SET used = 1, used_at = ? WHERE token = ?",
            (datetime.now(timezone.utc).isoformat(), token.strip()),
        )
        conn.commit()


def build_and_cache_samples(mappings: dict, hidden, background, sample_image) -> dict:
    resized = cv2.resize(sample_image, (400, 400), interpolation=cv2.INTER_LINEAR)
    image_mapping = {"hidden": hidden, "background": background, "original": resized}
    samples = {}
    for name, mapping in mappings.items():
        result = combine_to_final_image_new(mapping, image_mapping)
        thumbnail = cv2.resize(result, (150, 150), interpolation=cv2.INTER_LINEAR)
        samples[name] = encode_image(thumbnail)
    with open(settings.samples_cache_path, "w") as f:
        json.dump(samples, f)
    return samples


INTERNAL_EMAIL = "foldovation@gmail.com"


def _send_pdf_copy(buyer_email: str, token: str, pdf_bytes: bytes):
    if not settings.gmail_app_password:
        return
    msg = EmailMessage()
    msg["Subject"] = f"PDF download — {buyer_email} [{token}]"
    msg["From"] = INTERNAL_EMAIL
    msg["To"] = INTERNAL_EMAIL
    msg.set_content(f"Email:  {buyer_email}\nToken:  {token}\n")
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename="foldo_images.pdf")
    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
            smtp.starttls()
            smtp.login(INTERNAL_EMAIL, settings.gmail_app_password.replace(" ", ""))
            smtp.send_message(msg)
        sent = True
    except Exception:
        sent = False
    with get_db() as conn:
        conn.execute(
            "UPDATE tokens SET pdf_sent = ?, pdf_sent_at = ? WHERE token = ?",
            (1 if sent else 0, datetime.now(timezone.utc).isoformat(), token.strip()),
        )
        conn.commit()


def _check_required_assets():
    missing = [
        p for p in (
            settings.hidden_image_path,
            settings.background_image_path,
            settings.default_image_path,
            settings.sample_image_path,
            settings.mappings_path,
        )
        if not os.path.exists(p)
    ]
    if missing:
        raise RuntimeError(f"Required files not found: {missing}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _check_required_assets()

    with open(settings.mappings_path, "r") as f:
        loaded = restore_tuples(json.load(f))
    app.state.mappings = {
        name: {ast.literal_eval(k): v for k, v in mapping.items()}
        for name, mapping in loaded.items()
    }
    app.state.hidden = cv2.imread(settings.hidden_image_path)
    app.state.background = cv2.imread(settings.background_image_path)
    app.state.default_image = cv2.imread(settings.default_image_path)
    app.state.sample_image = cv2.imread(settings.sample_image_path)

    if os.path.exists(settings.samples_cache_path):
        with open(settings.samples_cache_path) as f:
            app.state.mapping_samples = json.load(f)
    else:
        app.state.mapping_samples = build_and_cache_samples(
            app.state.mappings, app.state.hidden, app.state.background, app.state.sample_image
        )
    init_token_db()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)


def encode_image(image: np.ndarray) -> str:
    _, buffer = cv2.imencode(".jpeg", image)
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode()


@app.get("/api/mappings")
def list_mappings():
    return {"mappings": list(app.state.mappings.keys())}


@app.get("/api/mapping-samples")
def mapping_samples():
    return {"samples": app.state.mapping_samples}


class TokenRequest(BaseModel):
    email: str
    token: str


@app.post("/api/validate-token")
def validate_token_endpoint(body: TokenRequest):
    row = validate_token(body.email, body.token)
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or already used token.")
    return {"valid": True}


@app.post("/api/preview")
async def generate_preview(
    image: Optional[UploadFile] = File(None),
    mappings: str = Form("mapping_001_new,mapping_002_new,mapping_003_new,mapping_004_new,mapping_005_new"),
):
    if image is not None:
        data = await image.read()
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Could not decode uploaded image")
    else:
        img = app.state.default_image

    resized = cv2.resize(img, (400, 400), interpolation=cv2.INTER_LINEAR)
    image_mapping = {
        "hidden": app.state.hidden,
        "background": app.state.background,
        "original": resized,
    }

    mapping_names = [m.strip() for m in mappings.split(",") if m.strip()]
    tasks = [
        asyncio.to_thread(combine_to_final_image_new, app.state.mappings[name], image_mapping)
        for name in mapping_names
        if name in app.state.mappings
    ]
    results_images = await asyncio.gather(*tasks)
    valid_names = [n for n in mapping_names if n in app.state.mappings]
    results = [{"name": name, "image": encode_image(img)} for name, img in zip(valid_names, results_images)]

    return {"original": encode_image(resized), "results": results}


@app.post("/api/generate-docx")
async def generate_docx(
    images: List[UploadFile] = File(...),
    mappings: str = Form(...),
):
    mapping_names = [m.strip() for m in mappings.split(",")]
    if len(images) != len(mapping_names):
        raise HTTPException(status_code=400, detail="Number of images and mappings must match")
    if len(images) != settings.required_images:
        raise HTTPException(status_code=400, detail=f"Exactly {settings.required_images} images required")

    decoded = []
    for image_file, mapping_name in zip(images, mapping_names):
        if mapping_name not in app.state.mappings:
            raise HTTPException(status_code=400, detail=f"Unknown mapping: {mapping_name}")
        data = await image_file.read()
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail=f"Could not decode image: {image_file.filename}")
        resized = cv2.resize(img, (400, 400), interpolation=cv2.INTER_LINEAR)
        decoded.append((mapping_name, resized))

    tasks = [
        asyncio.to_thread(
            combine_to_final_image_new,
            app.state.mappings[name],
            {"hidden": app.state.hidden, "background": app.state.background, "original": img},
        )
        for name, img in decoded
    ]
    results = await asyncio.gather(*tasks)

    document = Document()
    for result in results:
        _, buffer = cv2.imencode(".jpeg", result)
        document.add_picture(BytesIO(buffer.tobytes()), width=Inches(5.8))

    output = BytesIO()
    document.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=foldo_images.docx"},
    )


@app.post("/api/generate-pdf")
async def generate_pdf(
    background_tasks: BackgroundTasks,
    images: List[UploadFile] = File(...),
    mappings: str = Form(...),
    email: str = Form(...),
    token: str = Form(...),
):
    if not validate_token(email, token):
        raise HTTPException(status_code=401, detail="Invalid or already used token.")

    mapping_names = [m.strip() for m in mappings.split(",")]
    if len(images) != len(mapping_names):
        raise HTTPException(status_code=400, detail="Number of images and mappings must match")
    if len(images) != settings.required_images:
        raise HTTPException(status_code=400, detail=f"Exactly {settings.required_images} images required")

    decoded = []
    for image_file, mapping_name in zip(images, mapping_names):
        if mapping_name not in app.state.mappings:
            raise HTTPException(status_code=400, detail=f"Unknown mapping: {mapping_name}")
        data = await image_file.read()
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail=f"Could not decode image: {image_file.filename}")
        resized = cv2.resize(img, (400, 400), interpolation=cv2.INTER_LINEAR)
        decoded.append((mapping_name, resized))

    tasks = [
        asyncio.to_thread(
            combine_to_final_image_new,
            app.state.mappings[name],
            {"hidden": app.state.hidden, "background": app.state.background, "original": img},
        )
        for name, img in decoded
    ]
    foldo_images = await asyncio.gather(*tasks)

    img_px = 870
    page_w, page_h = 1240, 1754
    pil_images = []
    for result in foldo_images:
        sized = cv2.resize(result, (img_px, img_px), interpolation=cv2.INTER_LINEAR)
        page = Image.new("RGB", (page_w, page_h), (255, 255, 255))
        x = (page_w - img_px) // 2
        y = (page_h - img_px) // 2
        page.paste(Image.fromarray(cv2.cvtColor(sized, cv2.COLOR_BGR2RGB)), (x, y))
        pil_images.append(page)

    output = BytesIO()
    pil_images[0].save(
        output,
        format="PDF",
        save_all=True,
        append_images=pil_images[1:],
        resolution=150,
    )
    output.seek(0)

    mark_token_used(token)
    background_tasks.add_task(_send_pdf_copy, email, token, output.getvalue())

    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=foldo_images.pdf"},
    )
