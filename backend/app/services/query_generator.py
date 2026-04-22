"""Auto-generate source-specific search queries from keywords/title/author/DOI."""


def generate_queries(keywords: list[str], mode: str = "keywords") -> dict[str, str]:
    """Generate optimized search queries for each source.

    Args:
        keywords: List of search terms.
        mode: One of "keywords", "title", "author", "doi".

    Returns dict mapping source_name -> query string.
    """
    if not keywords:
        return {}

    if mode == "doi":
        return _generate_doi_queries(keywords)
    elif mode == "title":
        return _generate_title_queries(keywords)
    elif mode == "author":
        return _generate_author_queries(keywords)
    else:
        return _generate_keyword_queries(keywords)


def _generate_keyword_queries(keywords: list[str]) -> dict[str, str]:
    """Default: search keywords in title + abstract."""
    pubmed_parts = [f'"{kw}"[Title/Abstract]' for kw in keywords]
    arxiv_parts = [f'(ti:"{kw}" OR abs:"{kw}")' for kw in keywords]
    ieee_parts = [f'"{kw}"' for kw in keywords]
    # Scopus: TITLE-ABS-KEY combines title, abstract, and keywords
    elsevier_parts = [f'TITLE-ABS-KEY("{kw}")' for kw in keywords]

    return {
        "pubmed": " AND ".join(pubmed_parts),
        "arxiv": " AND ".join(arxiv_parts),
        "semantic_scholar": " ".join(keywords),
        "ieee": " AND ".join(ieee_parts),
        "biorxiv": " ".join(keywords),
        "elsevier": " AND ".join(elsevier_parts),
        # iris_who: plain keyword list (client does local tokenization + title/abstract/subject ranking)
        "iris_who": " ".join(keywords),
    }


def _generate_title_queries(keywords: list[str]) -> dict[str, str]:
    """Search in title only."""
    title_text = " ".join(keywords)

    return {
        "pubmed": f'"{title_text}"[Title]',
        "arxiv": f'ti:"{title_text}"',
        "semantic_scholar": title_text,
        "ieee": f'("Document Title":"{title_text}")',
        "biorxiv": title_text,
        "elsevier": f'TITLE("{title_text}")',
    }


def _generate_author_queries(keywords: list[str]) -> dict[str, str]:
    """Search by author name."""
    author_text = " ".join(keywords)

    return {
        "pubmed": f'"{author_text}"[Author]',
        "arxiv": f'au:"{author_text}"',
        "semantic_scholar": author_text,
        "ieee": f'("Authors":"{author_text}")',
        "biorxiv": author_text,
        "elsevier": f'AUTHOR-NAME("{author_text}")',
    }


def _generate_doi_queries(keywords: list[str]) -> dict[str, str]:
    """DOI lookup — use Semantic Scholar as primary resolver."""
    doi = keywords[0].strip()
    # Clean common prefixes
    for prefix in ["https://doi.org/", "http://doi.org/", "doi:", "DOI:"]:
        if doi.startswith(prefix):
            doi = doi[len(prefix):]

    return {
        "semantic_scholar": f"DOI:{doi}",
        "pubmed": f'"{doi}"[DOI]',
        "arxiv": "",  # arXiv doesn't search by DOI
        "ieee": "",   # Would need article number
        "biorxiv": "",  # bioRxiv doesn't search by DOI
        "elsevier": f'DOI("{doi}")',
    }
