"""
Generate a buyer instructions PDF.

Usage:
    python scripts/generate_instructions_pdf.py
    python scripts/generate_instructions_pdf.py --output my_instructions.pdf
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from foldo.config import settings

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

BRAND_DARK = colors.HexColor("#1e293b")
BRAND_BLUE = colors.HexColor("#2563eb")
BRAND_LIGHT = colors.HexColor("#f8fafc")
BRAND_MUTED = colors.HexColor("#64748b")
BRAND_BORDER = colors.HexColor("#e2e8f0")


def build_styles():
    base = getSampleStyleSheet()

    title = ParagraphStyle(
        "Title",
        parent=base["Normal"],
        fontSize=26,
        leading=32,
        textColor=BRAND_DARK,
        fontName="Helvetica-Bold",
        spaceAfter=4,
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        parent=base["Normal"],
        fontSize=13,
        leading=18,
        textColor=BRAND_MUTED,
        fontName="Helvetica",
        spaceAfter=6,
    )
    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=base["Normal"],
        fontSize=11,
        leading=16,
        textColor=BRAND_BLUE,
        fontName="Helvetica-Bold",
        spaceBefore=14,
        spaceAfter=4,
    )
    body = ParagraphStyle(
        "Body",
        parent=base["Normal"],
        fontSize=10,
        leading=15,
        textColor=BRAND_DARK,
        fontName="Helvetica",
        spaceAfter=4,
    )
    note = ParagraphStyle(
        "Note",
        parent=base["Normal"],
        fontSize=9,
        leading=13,
        textColor=BRAND_MUTED,
        fontName="Helvetica-Oblique",
        spaceAfter=4,
    )
    token_style = ParagraphStyle(
        "Token",
        parent=base["Normal"],
        fontSize=14,
        leading=20,
        textColor=BRAND_BLUE,
        fontName="Helvetica-Bold",
        alignment=1,  # centre
    )
    return title, subtitle, section_heading, body, note, token_style


def build_pdf_bytes(token: str = "FOLDO-XXXXXXXXXXXX") -> bytes:
    """Return the instructions PDF as bytes, with the real token filled in."""
    from io import BytesIO
    buf = BytesIO()
    _build(buf, token)
    return buf.getvalue()


def build_pdf(output_path: str, token: str = "FOLDO-XXXXXXXXXXXX"):
    _build(output_path, token)
    print(f"PDF written to {output_path}")


def _build(dest, token: str):
    doc = SimpleDocTemplate(
        dest,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title="Foldovation — Getting Started",
    )

    title_s, subtitle_s, heading_s, body_s, note_s, token_s = build_styles()
    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Foldovation", title_s))
    story.append(Paragraph("Your personalised Foldo artwork — step by step", subtitle_s))
    story.append(HRFlowable(width="100%", thickness=1, color=BRAND_BORDER, spaceAfter=12))

    # ── Token box ────────────────────────────────────────────────────────────
    story.append(Paragraph("Your Access Token", heading_s))
    story.append(Spacer(1, 2 * mm))

    token_table = Table(
        [[Paragraph(token, token_s)]],
        colWidths=[170 * mm],
    )
    token_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_LIGHT),
        ("BOX",        (0, 0), (-1, -1), 1, BRAND_BORDER),
        ("ROUNDEDCORNERS", [6]),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(token_table)
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Keep this token safe — it is single-use and expires once you download your PDF.",
        note_s,
    ))

    # ── Steps ────────────────────────────────────────────────────────────────
    story.append(Paragraph("How to use it", heading_s))

    steps = [
        ("1", "Open the app",
         f"Go to <b>{settings.app_url}</b> in your browser."),
        ("2", "Sign in",
         "Enter your <b>email address</b> and paste your <b>access token</b> into the form, then click <i>Continue</i>."),
        ("3", "Upload &amp; crop your 10 images",
         "Click the upload area (or drag and drop) to add exactly <b>10 images</b>. "
         "For each image you can optionally crop it directly in the browser — choose <i>1:1</i> for a square crop or <i>Free</i> for any ratio, "
         "adjust the zoom, then click <i>Apply crop</i>. Click <i>Skip</i> to keep the original. "
         "Images that are not square will show a warning badge in the preview."),
        ("4", "Choose a mapping style",
         "Pick one of the six preset styles: <b>Easy</b>, <b>Medium</b>, or <b>Hard</b> set the overall difficulty level; "
         "<b>Mix 1</b>, <b>Mix 2</b>, and <b>Mix 3</b> spread the difficulty across all images for extra variety. "
         "Choose <b>Custom</b> to go straight to the preview and set each image's mapping individually. "
         "Click <i>Preview 10 Foldo Images</i> to continue."),
        ("5", "Preview &amp; adjust",
         "A side-by-side preview of every original and transformed image is shown. "
         "Each image has a <i>[mapping] · change</i> button — click it to open the full mapping picker and swap that image's mapping without re-uploading. "
         "If two or more images share the same mapping, a warning will appear above the download button."),
        ("6", "Download your PDF",
         "Happy with the result? Click <i>Download PDF</i>. Your PDF will be generated and downloaded automatically. "
         "Your token is now used — if you need another session please contact us."),
    ]

    for number, step_title, description in steps:
        row = Table(
            [[
                Paragraph(number, ParagraphStyle(
                    "StepNum",
                    fontSize=13,
                    leading=16,
                    textColor=colors.white,
                    fontName="Helvetica-Bold",
                    alignment=1,
                )),
                Paragraph(f"<b>{step_title}</b><br/>{description}", body_s),
            ]],
            colWidths=[9 * mm, 161 * mm],
            rowHeights=None,
        )
        row.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (0, 0), BRAND_BLUE),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (0, 0), 6),
            ("BOTTOMPADDING", (0, 0), (0, 0), 6),
            ("LEFTPADDING",   (1, 0), (1, 0), 10),
            ("TOPPADDING",    (1, 0), (1, 0), 6),
            ("BOTTOMPADDING", (1, 0), (1, 0), 6),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.5, BRAND_BORDER),
        ]))
        story.append(row)

    # ── Tips ─────────────────────────────────────────────────────────────────
    story.append(Paragraph("Tips for best results", heading_s))
    tips = [
        "<b>Square images give the best result</b> — use the built-in crop tool to trim to 1:1 before proceeding.",
        "Higher resolution images produce sharper output.",
        "Portraits and group photos with a clear subject work particularly well.",
        "Use a different mapping for each image to ensure a unique challenge per image — the app will warn you if any two are the same.",
        "You can swap any image's mapping directly on the preview page without going back to re-upload.",
    ]
    for tip in tips:
        story.append(Paragraph(f"• {tip}", body_s))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=BRAND_BORDER, spaceAfter=6))
    story.append(Paragraph(
        f"Questions? Reply to this email or reach us at <b>foldovation@gmail.com</b>",
        note_s,
    ))

    doc.build(story)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate buyer instructions PDF.")
    parser.add_argument(
        "--output",
        default="foldovation_instructions.pdf",
        help="Output file path (default: foldovation_instructions.pdf)",
    )
    args = parser.parse_args()
    build_pdf(args.output)
