"""PDF download, validation, and storage manager."""

import logging
import re
from datetime import datetime
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# PDF magic bytes
PDF_MAGIC = b"%PDF"

# Organize PDFs: data/pdfs/{year}/{source}/{sanitized_title}.pdf
MAX_FILENAME_LEN = 120


def sanitize_filename(title: str) -> str:
    """Create a safe filename from a paper title."""
    # Remove special characters, keep alphanumeric, spaces, hyphens
    clean = re.sub(r"[^\w\s\-]", "", title)
    clean = re.sub(r"\s+", "_", clean.strip())
    clean = clean[:MAX_FILENAME_LEN]
    return clean


class PDFManager:
    """Manages PDF downloads, validation, and organized storage."""

    def __init__(self):
        self.base_dir = settings.pdf_dir
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(60.0),
                follow_redirects=True,
                headers={"User-Agent": "FL-Research-Monitor/0.1.0"},
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def get_storage_path(
        self, title: str, source: str, year: str | None = None
    ) -> Path:
        """Get the organized storage path for a paper PDF."""
        if not year:
            year = str(datetime.utcnow().year)
        filename = sanitize_filename(title)
        if not filename:
            filename = f"paper_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        path = self.base_dir / year / source / f"{filename}.pdf"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    async def download_pdf(
        self,
        url: str,
        title: str,
        source: str,
        year: str | None = None,
    ) -> Path | None:
        """Download a PDF from URL and store it organized.

        Returns the local file path if successful, None otherwise.
        """
        if not url:
            return None

        storage_path = self.get_storage_path(title, source, year)

        # Skip if already downloaded
        if storage_path.exists() and storage_path.stat().st_size > 1000:
            logger.debug(f"PDF already exists: {storage_path}")
            return storage_path

        try:
            client = await self._get_client()
            response = await client.get(url)
            response.raise_for_status()

            content = response.content

            # Validate it's actually a PDF
            if not self.validate_pdf_content(content):
                logger.warning(f"Downloaded content is not a valid PDF: {url}")
                return None

            # Write to disk
            storage_path.write_bytes(content)
            size_kb = len(content) / 1024
            logger.info(f"Downloaded PDF ({size_kb:.0f} KB): {storage_path.name}")
            return storage_path

        except httpx.HTTPStatusError as e:
            logger.warning(f"HTTP {e.response.status_code} downloading PDF: {url}")
            return None
        except (httpx.ConnectError, httpx.ReadTimeout) as e:
            logger.warning(f"Connection error downloading PDF: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error downloading PDF from {url}: {e}")
            return None

    @staticmethod
    def validate_pdf_content(content: bytes) -> bool:
        """Check if content is a valid PDF by verifying magic bytes."""
        if not content or len(content) < 100:
            return False
        return content[:4] == PDF_MAGIC

    @staticmethod
    def validate_pdf_file(path: Path) -> bool:
        """Check if a file on disk is a valid PDF."""
        if not path.exists():
            return False
        with open(path, "rb") as f:
            header = f.read(4)
        return header == PDF_MAGIC

    def get_all_pdfs(self) -> list[dict]:
        """List all downloaded PDFs with metadata."""
        pdfs = []
        for pdf_path in self.base_dir.rglob("*.pdf"):
            parts = pdf_path.relative_to(self.base_dir).parts
            year = parts[0] if len(parts) > 2 else "unknown"
            source = parts[1] if len(parts) > 2 else "unknown"
            pdfs.append({
                "path": str(pdf_path),
                "filename": pdf_path.name,
                "year": year,
                "source": source,
                "size_bytes": pdf_path.stat().st_size,
            })
        return pdfs

    def get_stats(self) -> dict:
        """Get PDF storage statistics."""
        pdfs = self.get_all_pdfs()
        total_size = sum(p["size_bytes"] for p in pdfs)
        by_source: dict[str, int] = {}
        by_year: dict[str, int] = {}
        for p in pdfs:
            by_source[p["source"]] = by_source.get(p["source"], 0) + 1
            by_year[p["year"]] = by_year.get(p["year"], 0) + 1
        return {
            "total_pdfs": len(pdfs),
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "by_source": by_source,
            "by_year": by_year,
        }
