# FL-RESEARCH-MONITOR

Automated scientific paper discovery system for Federated Learning research.

Queries PubMed, Semantic Scholar, arXiv, bioRxiv/medRxiv, and IEEE Xplore to discover, catalog, and analyze papers on:
- **Federated Learning** (general)
- **FL in Healthcare** (clinical studies, medical imaging, EHR)
- **European Health Data Space** (EHDS)

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # Edit with your API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev  # http://localhost:3000
```

### Fetch Papers

```bash
cd backend
python scripts/fetch_papers.py --topic "Federated Learning" --source pubmed
python scripts/fetch_papers.py  # All topics, all sources
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for full details.

## API Keys (Optional)

| Service | Variable | Purpose |
|---------|----------|---------|
| NCBI | `NCBI_API_KEY` | Higher PubMed rate limits |
| Semantic Scholar | `SEMANTIC_SCHOLAR_API_KEY` | Higher S2 rate limits |
| IEEE Xplore | `IEEE_API_KEY` | Required for IEEE search |
| Zotero | `ZOTERO_API_KEY` + `ZOTERO_USER_ID` | Collection sync |
