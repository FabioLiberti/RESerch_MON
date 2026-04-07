"""CrossRef API client — DOI metadata resolver."""

import logging

import httpx

logger = logging.getLogger(__name__)

CROSSREF_API = "https://api.crossref.org"


async def resolve_doi(doi: str) -> dict | None:
    """Resolve a DOI via CrossRef API. Returns metadata dict or None."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"{CROSSREF_API}/works/{doi}",
                headers={"User-Agent": "FL-Research-Monitor/1.0 (mailto:fabioliberti.fl@gmail.com)"},
            )

            if res.status_code != 200:
                return None

            data = res.json().get("message", {})

            # Title
            titles = data.get("title", [])
            title = titles[0] if titles else None
            if not title:
                return None

            # Authors
            authors = []
            for author in data.get("author", []):
                name_parts = []
                if author.get("given"):
                    name_parts.append(author["given"])
                if author.get("family"):
                    name_parts.append(author["family"])
                if name_parts:
                    authors.append(" ".join(name_parts))

            # Date
            date_parts = data.get("published-print", data.get("published-online", data.get("issued", {})))
            pub_date = None
            if date_parts and date_parts.get("date-parts"):
                parts = date_parts["date-parts"][0]
                if len(parts) >= 3:
                    pub_date = f"{parts[0]}-{parts[1]:02d}-{parts[2]:02d}"
                elif len(parts) >= 2:
                    pub_date = f"{parts[0]}-{parts[1]:02d}-01"
                elif len(parts) >= 1:
                    pub_date = f"{parts[0]}-01-01"

            # Journal
            containers = data.get("container-title", [])
            journal = containers[0] if containers else None

            # Type
            cr_type = data.get("type", "")
            paper_type = "journal_article"
            if "proceedings" in cr_type or "conference" in cr_type:
                paper_type = "conference"
            elif "book" in cr_type:
                paper_type = "journal_article"  # treat books as articles for simplicity

            # Abstract (sometimes available)
            abstract = data.get("abstract")
            if abstract:
                # CrossRef abstracts have JATS XML tags, strip them
                import re
                abstract = re.sub(r'<[^>]+>', '', abstract).strip()

            # Open access
            is_oa = False
            for link in data.get("link", []):
                if link.get("content-type") == "application/pdf":
                    is_oa = True
                    break

            # URL
            pdf_url = None
            for link in data.get("link", []):
                if link.get("content-type") == "application/pdf":
                    pdf_url = link.get("URL")
                    break

            logger.info(f"[crossref] Resolved DOI {doi}: {title[:50]}")

            return {
                "title": title,
                "authors": authors,
                "abstract": abstract,
                "journal": journal,
                "publication_date": pub_date,
                "paper_type": paper_type,
                "open_access": is_oa,
                "pdf_url": pdf_url,
                "citation_count": data.get("is-referenced-by-count", 0),
                "doi": doi,
            }

    except Exception as e:
        logger.warning(f"[crossref] Failed for DOI {doi}: {e}")
        return None
