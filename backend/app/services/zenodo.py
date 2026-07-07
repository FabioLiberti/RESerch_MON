"""Zenodo deposition service.

Wraps the Zenodo REST API to deposit research artifacts (manuscript PDF plus
supporting documents: presentation, primer, companion, ...) as a single record
and obtain a citable DOI.

Flow (Zenodo "deposit" + "bucket" file API):
  1. POST /deposit/depositions           -> create empty draft, get id + bucket + reserved DOI
  2. PUT  {bucket}/{filename}             -> upload each file
  3. PUT  /deposit/depositions/{id}       -> set metadata
  4. POST /deposit/depositions/{id}/actions/publish  (optional) -> mint DOI

By default the draft is NOT published (safer): the reserved DOI and the edit URL
are returned so the author can review and publish manually on Zenodo.
"""

from __future__ import annotations

import httpx

from app.config import settings


class ZenodoError(RuntimeError):
    pass


def _base() -> str:
    return (settings.zenodo_api_base or "https://zenodo.org/api").rstrip("/")


def _token() -> str:
    tok = settings.zenodo_api_key
    if not tok:
        raise ZenodoError(
            "Zenodo token non configurato: imposta ZENODO_API_KEY nel file .env del backend."
        )
    return tok


async def deposit(
    *,
    files: list[tuple[str, bytes]],
    metadata: dict,
    publish: bool = False,
) -> dict:
    """Create a Zenodo deposition, upload files, set metadata, optionally publish.

    Args:
        files: list of (filename, content_bytes) to attach.
        metadata: Zenodo "metadata" dict (title, upload_type, description, creators, ...).
        publish: if True, publish immediately (irreversible, mints the DOI).

    Returns:
        {deposition_id, doi, doi_url, html_url, bucket, published, n_files}
    """
    token = _token()
    base = _base()
    params = {"access_token": token}

    if publish and not files:
        raise ZenodoError("Zenodo richiede almeno un file per pubblicare.")

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1. create draft
        r = await client.post(f"{base}/deposit/depositions", params=params, json={})
        if r.status_code not in (200, 201):
            raise ZenodoError(f"Creazione deposito fallita ({r.status_code}): {r.text[:300]}")
        dep = r.json()
        dep_id = dep["id"]
        bucket = dep["links"]["bucket"]
        reserved = (dep.get("metadata") or {}).get("prereserve_doi") or {}
        doi = reserved.get("doi")

        # 2. upload files to the bucket
        for fname, content in files:
            safe = fname.replace("/", "_")
            fr = await client.put(f"{bucket}/{safe}", params=params, content=content)
            if fr.status_code not in (200, 201):
                raise ZenodoError(f"Upload '{safe}' fallito ({fr.status_code}): {fr.text[:200]}")

        # 3. set metadata
        mr = await client.put(
            f"{base}/deposit/depositions/{dep_id}",
            params=params,
            json={"metadata": metadata},
        )
        if mr.status_code not in (200, 201):
            raise ZenodoError(f"Metadata fallito ({mr.status_code}): {mr.text[:300]}")
        dep = mr.json()
        doi = doi or (dep.get("metadata") or {}).get("prereserve_doi", {}).get("doi")

        published = False
        html_url = (dep.get("links") or {}).get("html") or (dep.get("links") or {}).get("latest_draft_html")

        # 4. optional publish
        if publish:
            pr = await client.post(
                f"{base}/deposit/depositions/{dep_id}/actions/publish", params=params
            )
            if pr.status_code not in (200, 202):
                raise ZenodoError(f"Publish fallito ({pr.status_code}): {pr.text[:300]}")
            pub = pr.json()
            published = True
            doi = pub.get("doi") or doi
            html_url = (pub.get("links") or {}).get("record_html") or html_url

    return {
        "deposition_id": dep_id,
        "doi": doi,
        "doi_url": f"https://doi.org/{doi}" if doi else None,
        "html_url": html_url,
        "bucket": bucket,
        "published": published,
        "n_files": len(files),
    }


def build_metadata(paper, keywords: list[str] | None = None) -> dict:
    """Build a Zenodo metadata dict from a Paper ORM object."""
    creators = [{"name": "Liberti, Fabio", "orcid": "0000-0003-3019-5411"}]
    md = {
        "title": paper.title,
        "upload_type": "publication",
        "publication_type": "preprint",
        "description": (paper.abstract or paper.title),
        "creators": creators,
        "access_right": "open",
        "license": "cc-by-4.0",
    }
    if keywords:
        md["keywords"] = keywords
    return md
