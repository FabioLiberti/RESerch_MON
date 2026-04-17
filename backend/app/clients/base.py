"""Base API client with rate limiting, retry, and structured logging."""

import asyncio
import logging
import time
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)


@dataclass
class RawPaperResult:
    """Normalized paper result from any API source."""

    source: str
    source_id: str
    title: str
    abstract: str | None = None
    authors: list[dict] = field(default_factory=list)  # [{name, affiliation, orcid}]
    doi: str | None = None
    publication_date: str | None = None  # YYYY-MM-DD
    journal: str | None = None
    volume: str | None = None
    pages: str | None = None
    paper_type: str = "journal_article"
    open_access: bool = False
    pdf_url: str | None = None
    citation_count: int = 0
    keywords: list[str] = field(default_factory=list)  # All keywords (flat list)
    keyword_categories: dict = field(default_factory=dict)  # {"Author Keywords": [...], "MeSH Terms": [...]}
    external_ids: dict = field(default_factory=dict)
    raw_data: dict = field(default_factory=dict)


class RateLimiter:
    """Token-bucket rate limiter."""

    def __init__(self, requests_per_second: float):
        self.rate = requests_per_second
        self.min_interval = 1.0 / requests_per_second if requests_per_second > 0 else 0
        self._last_request = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_request
            if elapsed < self.min_interval:
                await asyncio.sleep(self.min_interval - elapsed)
            self._last_request = time.monotonic()


class BaseAPIClient:
    """Base class for all external API clients."""

    source_name: str = "unknown"
    base_url: str = ""
    requests_per_second: float = 1.0
    max_retries: int = 3
    backoff_factor: float = 1.5
    timeout: float = 30.0

    def __init__(self):
        self._rate_limiter = RateLimiter(self.requests_per_second)
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout),
                headers={"User-Agent": "FL-Research-Monitor/0.1.0"},
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _request(
        self,
        method: str,
        url: str,
        params: dict | None = None,
        headers: dict | None = None,
        **kwargs,
    ) -> httpx.Response:
        """Make an HTTP request with rate limiting and retry."""
        client = await self._get_client()

        for attempt in range(self.max_retries):
            await self._rate_limiter.acquire()

            try:
                response = await client.request(
                    method, url, params=params, headers=headers, **kwargs
                )

                if response.status_code == 429:
                    wait = self.backoff_factor * (2**attempt)
                    logger.warning(
                        f"[{self.source_name}] Rate limited (429), waiting {wait:.1f}s"
                    )
                    await asyncio.sleep(wait)
                    continue

                response.raise_for_status()
                return response

            except httpx.HTTPStatusError as e:
                if e.response.status_code >= 500 and attempt < self.max_retries - 1:
                    wait = self.backoff_factor * (2**attempt)
                    logger.warning(
                        f"[{self.source_name}] Server error {e.response.status_code}, "
                        f"retry {attempt + 1}/{self.max_retries} in {wait:.1f}s"
                    )
                    await asyncio.sleep(wait)
                    continue
                raise

            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                if attempt < self.max_retries - 1:
                    wait = self.backoff_factor * (2**attempt)
                    logger.warning(
                        f"[{self.source_name}] Connection error: {e}, "
                        f"retry {attempt + 1}/{self.max_retries} in {wait:.1f}s"
                    )
                    await asyncio.sleep(wait)
                    continue
                raise

        raise RuntimeError(f"[{self.source_name}] All {self.max_retries} retries exhausted")

    async def search(self, query: str, max_results: int = 50, **kwargs) -> list[RawPaperResult]:
        """Search for papers. Override in subclasses.

        Supported kwargs (applied per-source where API supports it):
            year_from (int): minimum publication year
            year_to (int): maximum publication year
            min_citations (int): minimum citation count
            open_access (bool): only open access papers
        """
        raise NotImplementedError

    async def fetch_metadata(self, identifier: str) -> RawPaperResult | None:
        """Fetch metadata for a specific paper. Override in subclasses."""
        raise NotImplementedError

    async def validate_exists(self, identifier: str) -> bool:
        """Check if a paper exists. Override in subclasses."""
        raise NotImplementedError
