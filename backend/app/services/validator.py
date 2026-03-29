"""Paper existence validation via DOI resolution and source-specific checks."""

import logging

import httpx

logger = logging.getLogger(__name__)


class PaperValidator:
    """Validates paper existence via DOI resolution and source-specific APIs."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(15.0),
                follow_redirects=False,
                headers={"User-Agent": "FL-Research-Monitor/0.1.0"},
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def validate_doi(self, doi: str) -> bool:
        """Validate a DOI by checking if doi.org resolves it (302 redirect)."""
        if not doi:
            return False

        url = f"https://doi.org/{doi}"
        try:
            client = await self._get_client()
            response = await client.head(url)
            # doi.org returns 302 redirect to publisher for valid DOIs
            # Returns 404 or other errors for invalid DOIs
            if response.status_code in (301, 302, 303, 307, 308):
                logger.debug(f"DOI validated: {doi}")
                return True
            elif response.status_code == 200:
                # Some DOIs resolve directly
                return True
            else:
                logger.debug(f"DOI validation failed ({response.status_code}): {doi}")
                return False
        except Exception as e:
            logger.warning(f"DOI validation error for {doi}: {e}")
            return False

    async def validate_arxiv(self, arxiv_id: str) -> bool:
        """Validate an arXiv paper exists by checking the abs page."""
        if not arxiv_id:
            return False

        url = f"https://arxiv.org/abs/{arxiv_id}"
        try:
            client = await self._get_client()
            response = await client.head(url)
            valid = response.status_code == 200
            if valid:
                logger.debug(f"arXiv validated: {arxiv_id}")
            else:
                logger.debug(f"arXiv validation failed ({response.status_code}): {arxiv_id}")
            return valid
        except Exception as e:
            logger.warning(f"arXiv validation error for {arxiv_id}: {e}")
            return False

    async def validate_pmid(self, pmid: str) -> bool:
        """Validate a PubMed ID exists via NCBI efetch."""
        if not pmid:
            return False

        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        params = {"db": "pubmed", "id": pmid, "retmode": "json"}
        try:
            client = await self._get_client()
            response = await client.get(url, params=params)
            data = response.json()
            result = data.get("result", {})
            # Valid PMIDs have their ID in the result with a title
            paper_data = result.get(pmid, {})
            valid = "title" in paper_data and "error" not in paper_data
            if valid:
                logger.debug(f"PMID validated: {pmid}")
            return valid
        except Exception as e:
            logger.warning(f"PMID validation error for {pmid}: {e}")
            return False

    async def validate_paper(self, external_ids: dict) -> bool:
        """Validate a paper using any available identifier.

        Tries DOI first (most universal), then source-specific IDs.
        Returns True if at least one identifier validates successfully.
        """
        # Try DOI first
        doi = external_ids.get("doi") or external_ids.get("DOI")
        if doi:
            if await self.validate_doi(doi):
                return True

        # Try arXiv ID
        arxiv_id = external_ids.get("arxiv_id")
        if arxiv_id:
            if await self.validate_arxiv(arxiv_id):
                return True

        # Try PMID
        pmid = external_ids.get("pmid")
        if pmid:
            if await self.validate_pmid(pmid):
                return True

        return False
