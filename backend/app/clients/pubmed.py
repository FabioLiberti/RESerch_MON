"""PubMed/NCBI E-utilities API client."""

import logging
import xml.etree.ElementTree as ET

from app.clients.base import BaseAPIClient, RawPaperResult
from app.config import settings

logger = logging.getLogger(__name__)


class PubMedClient(BaseAPIClient):
    source_name = "pubmed"
    base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    requests_per_second = 10.0 if settings.ncbi_api_key else 3.0

    def _base_params(self) -> dict:
        params = {"retmode": "xml"}
        if settings.ncbi_api_key:
            params["api_key"] = settings.ncbi_api_key
        return params

    async def search(self, query: str, max_results: int = 50) -> list[RawPaperResult]:
        """Search PubMed and return paper results."""
        # Step 1: esearch to get PMIDs
        params = {
            **self._base_params(),
            "db": "pubmed",
            "term": query,
            "retmax": str(max_results),
            "sort": "date",
            "usehistory": "y",
        }
        response = await self._request("GET", "/esearch.fcgi", params=params)
        root = ET.fromstring(response.text)

        id_list = root.findall(".//IdList/Id")
        if not id_list:
            logger.info(f"[pubmed] No results for query: {query[:80]}")
            return []

        pmids = [id_el.text for id_el in id_list if id_el.text]
        logger.info(f"[pubmed] Found {len(pmids)} PMIDs for query: {query[:80]}")

        # Step 2: efetch to get full metadata
        return await self._fetch_details(pmids)

    async def _fetch_details(self, pmids: list[str]) -> list[RawPaperResult]:
        """Fetch detailed metadata for a list of PMIDs."""
        if not pmids:
            return []

        # Fetch in batches of 50
        results = []
        for i in range(0, len(pmids), 50):
            batch = pmids[i : i + 50]
            params = {
                **self._base_params(),
                "db": "pubmed",
                "id": ",".join(batch),
                "rettype": "xml",
            }
            response = await self._request("GET", "/efetch.fcgi", params=params)
            results.extend(self._parse_efetch_xml(response.text))

        return results

    def _parse_efetch_xml(self, xml_text: str) -> list[RawPaperResult]:
        """Parse PubMed efetch XML response."""
        results = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.error(f"[pubmed] XML parse error: {e}")
            return []

        for article in root.findall(".//PubmedArticle"):
            try:
                results.append(self._parse_article(article))
            except Exception as e:
                logger.warning(f"[pubmed] Error parsing article: {e}")
                continue

        return results

    def _parse_article(self, article_el: ET.Element) -> RawPaperResult:
        """Parse a single PubmedArticle XML element."""
        medline = article_el.find(".//MedlineCitation")
        article = medline.find(".//Article") if medline else None

        # PMID
        pmid_el = medline.find(".//PMID") if medline else None
        pmid = pmid_el.text if pmid_el is not None else ""

        # Title
        title_el = article.find(".//ArticleTitle") if article else None
        title = self._get_text(title_el) if title_el is not None else "Untitled"

        # Abstract
        abstract_parts = []
        if article:
            for abs_text in article.findall(".//Abstract/AbstractText"):
                label = abs_text.get("Label", "")
                text = self._get_text(abs_text)
                if label:
                    abstract_parts.append(f"{label}: {text}")
                else:
                    abstract_parts.append(text)
        abstract = "\n".join(abstract_parts) if abstract_parts else None

        # Authors
        authors = []
        if article:
            for author_el in article.findall(".//AuthorList/Author"):
                last = author_el.findtext("LastName", "")
                first = author_el.findtext("ForeName", "")
                name = f"{first} {last}".strip()
                if not name:
                    name = author_el.findtext("CollectiveName", "Unknown")

                affil_el = author_el.find(".//AffiliationInfo/Affiliation")
                affiliation = affil_el.text if affil_el is not None else None

                orcid = None
                for ident in author_el.findall(".//Identifier"):
                    if ident.get("Source") == "ORCID":
                        orcid = ident.text

                authors.append({"name": name, "affiliation": affiliation, "orcid": orcid})

        # Publication date
        pub_date = ""
        date_el = article.find(".//Journal/JournalIssue/PubDate") if article else None
        if date_el is not None:
            year = date_el.findtext("Year", "")
            month = date_el.findtext("Month", "01")
            day = date_el.findtext("Day", "01")
            # Convert month names to numbers
            month_map = {
                "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
                "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
                "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
            }
            month = month_map.get(month, month.zfill(2) if month.isdigit() else "01")
            day = day.zfill(2) if day.isdigit() else "01"
            if year:
                pub_date = f"{year}-{month}-{day}"

        # Journal
        journal_el = article.find(".//Journal/Title") if article else None
        journal = journal_el.text if journal_el is not None else None

        # DOI
        doi = None
        for id_el in article_el.findall(".//PubmedData/ArticleIdList/ArticleId"):
            if id_el.get("IdType") == "doi":
                doi = id_el.text
                break

        # PMC ID
        pmc_id = None
        for id_el in article_el.findall(".//PubmedData/ArticleIdList/ArticleId"):
            if id_el.get("IdType") == "pmc":
                pmc_id = id_el.text
                break

        # Volume, pages
        volume_el = article.find(".//Journal/JournalIssue/Volume") if article else None
        pages_el = article.find(".//Pagination/MedlinePgn") if article else None

        # Keywords: MeSH Terms + Author Keywords (separated)
        mesh_terms = []
        author_keywords = []
        if medline:
            for mesh in medline.findall(".//MeshHeadingList/MeshHeading/DescriptorName"):
                if mesh.text:
                    mesh_terms.append(mesh.text)
        if medline:
            for kw_list in medline.findall(".//KeywordList/Keyword"):
                if kw_list.text:
                    author_keywords.append(kw_list.text)
        keywords = author_keywords + mesh_terms  # Author keywords first
        keyword_categories = {}
        if author_keywords:
            keyword_categories["Author Keywords"] = author_keywords
        if mesh_terms:
            keyword_categories["MeSH Terms"] = mesh_terms

        # PDF URL from PMC
        pdf_url = None
        if pmc_id:
            pdf_url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmc_id}/pdf/"

        return RawPaperResult(
            source="pubmed",
            source_id=pmid,
            title=title,
            abstract=abstract,
            authors=authors,
            doi=doi,
            publication_date=pub_date,
            journal=journal,
            volume=volume_el.text if volume_el is not None else None,
            pages=pages_el.text if pages_el is not None else None,
            paper_type="journal_article",
            open_access=pmc_id is not None,
            pdf_url=pdf_url,
            keywords=keywords,
            keyword_categories=keyword_categories,
            external_ids={"pmid": pmid, "pmcid": pmc_id},
            raw_data={"pmid": pmid},
        )

    @staticmethod
    def _get_text(element: ET.Element) -> str:
        """Extract all text from an element including mixed content."""
        return "".join(element.itertext()).strip()

    async def fetch_metadata(self, pmid: str) -> RawPaperResult | None:
        """Fetch metadata for a specific PMID."""
        results = await self._fetch_details([pmid])
        return results[0] if results else None

    async def validate_exists(self, pmid: str) -> bool:
        """Check if a PMID exists in PubMed."""
        result = await self.fetch_metadata(pmid)
        return result is not None
