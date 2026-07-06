from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

_TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES)),
    autoescape=select_autoescape(["html"]),
)


def render_invoice_pdf(invoice, settings) -> bytes:
    template = _env.get_template("invoice.html")
    html = template.render(inv=invoice, settings=settings)
    return HTML(string=html).write_pdf()
