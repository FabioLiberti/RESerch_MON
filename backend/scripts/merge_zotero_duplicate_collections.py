#!/usr/bin/env python3
"""Merge duplicate top-level Zotero collections named 'FL-Research-Monitor'.

Usage:
    python scripts/merge_zotero_duplicate_collections.py            # dry-run (default)
    python scripts/merge_zotero_duplicate_collections.py --apply    # actually do it

Algorithm:
    1. Find all top-level collections matching the target name.
    2. If 0 or 1 → nothing to do.
    3. Otherwise pick the one with most items as the canonical target.
    4. For every other duplicate parent:
        - For each sub-collection of the duplicate:
            * If canonical has a sub-collection with the same name:
                merge by moving every item from dup-sub → canonical-sub,
                then delete dup-sub.
            * Else: reparent (PATCH parentCollection) dup-sub under canonical.
        - For loose items directly under the duplicate (not in any sub-col):
            move them to canonical.
        - Finally delete the (now empty) duplicate parent.
"""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.clients.zotero import ZoteroClient, COLLECTION_NAME

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("merge_zotero")


class ZoteroMerger:
    def __init__(self, client: ZoteroClient, apply: bool):
        self.c = client
        self.apply = apply

    # ---------- low-level helpers ----------

    async def _paginated_get(self, endpoint: str, params: dict | None = None) -> list[dict]:
        all_rows: list[dict] = []
        start = 0
        limit = 100
        while True:
            p = {"limit": limit, "start": start}
            if params:
                p.update(params)
            r = await self.c._request("GET", endpoint, params=p, headers=self.c._headers())
            batch = r.json()
            if not batch:
                break
            all_rows.extend(batch)
            if len(batch) < limit:
                break
            start += limit
        return all_rows

    async def list_top_collections(self) -> list[dict]:
        return await self._paginated_get(f"{self.c.user_prefix}/collections/top")

    async def list_subcollections(self, parent_key: str) -> list[dict]:
        return await self._paginated_get(f"{self.c.user_prefix}/collections/{parent_key}/collections")

    async def list_collection_items_top(self, collection_key: str) -> list[dict]:
        """Top-level items in a collection (excludes child attachments/notes)."""
        return await self._paginated_get(f"{self.c.user_prefix}/collections/{collection_key}/items/top")

    async def patch_item_collections(self, item_key: str, new_collections: list[str]) -> bool:
        try:
            r = await self.c._request("GET", f"{self.c.user_prefix}/items/{item_key}", headers=self.c._headers())
            item = r.json()
            version = item.get("version", 0)
            if not self.apply:
                logger.info(f"  [DRY] would set item {item_key} collections → {new_collections}")
                return True
            await self.c._request(
                "PATCH",
                f"{self.c.user_prefix}/items/{item_key}",
                headers={**self.c._headers(), "If-Unmodified-Since-Version": str(version)},
                json={"collections": new_collections},
            )
            return True
        except Exception as e:
            logger.error(f"  Failed to patch item {item_key}: {e}")
            return False

    async def patch_collection_parent(self, col_key: str, new_parent_key: str) -> bool:
        try:
            r = await self.c._request("GET", f"{self.c.user_prefix}/collections/{col_key}", headers=self.c._headers())
            col = r.json()
            version = col.get("version", 0)
            if not self.apply:
                logger.info(f"  [DRY] would reparent collection {col_key} → parent {new_parent_key}")
                return True
            await self.c._request(
                "PATCH",
                f"{self.c.user_prefix}/collections/{col_key}",
                headers={**self.c._headers(), "If-Unmodified-Since-Version": str(version)},
                json={"parentCollection": new_parent_key},
            )
            return True
        except Exception as e:
            logger.error(f"  Failed to reparent collection {col_key}: {e}")
            return False

    async def delete_collection(self, col_key: str) -> bool:
        try:
            r = await self.c._request("GET", f"{self.c.user_prefix}/collections/{col_key}", headers=self.c._headers())
            version = r.json().get("version", 0)
            if not self.apply:
                logger.info(f"  [DRY] would DELETE collection {col_key}")
                return True
            await self.c._request(
                "DELETE",
                f"{self.c.user_prefix}/collections/{col_key}",
                headers={**self.c._headers(), "If-Unmodified-Since-Version": str(version)},
            )
            return True
        except Exception as e:
            logger.error(f"  Failed to delete collection {col_key}: {e}")
            return False

    # ---------- merge logic ----------

    async def move_items_to_collection(
        self,
        from_collection: str,
        to_collection: str,
    ) -> int:
        """Move every top-level item from from_collection into to_collection.

        Adds to_collection to the item's collections list and removes from_collection.
        Returns the number of items moved.
        """
        items = await self.list_collection_items_top(from_collection)
        moved = 0
        for it in items:
            data = it.get("data", {})
            key = it.get("key") or data.get("key")
            cols = list(data.get("collections", []))
            changed = False
            if from_collection in cols:
                cols.remove(from_collection)
                changed = True
            if to_collection not in cols:
                cols.append(to_collection)
                changed = True
            if changed:
                logger.info(f"  Move item {key} ({(data.get('title') or '')[:60]!r})")
                ok = await self.patch_item_collections(key, cols)
                if ok:
                    moved += 1
        return moved

    async def merge_subcollection(
        self,
        dup_sub: dict,
        canonical_sub_key: str,
    ) -> None:
        """Merge a duplicate sub-collection into a same-named canonical sub-collection."""
        dup_key = dup_sub["key"]
        name = dup_sub["data"]["name"]
        logger.info(f"  Merge sub-collection '{name}': {dup_key} → {canonical_sub_key}")
        moved = await self.move_items_to_collection(dup_key, canonical_sub_key)
        logger.info(f"    moved {moved} items")
        # After move, the dup sub-collection should be empty → delete it
        await self.delete_collection(dup_key)

    async def merge_parent(self, dup_parent: dict, canonical_parent_key: str) -> None:
        dup_key = dup_parent["key"]
        logger.info(f"\n=== Merging duplicate parent {dup_key} → {canonical_parent_key} ===")

        # Build canonical sub-collection name → key map
        canonical_subs = await self.list_subcollections(canonical_parent_key)
        canonical_sub_by_name: dict[str, str] = {
            s["data"]["name"]: s["key"] for s in canonical_subs
        }

        # Process duplicate's sub-collections
        dup_subs = await self.list_subcollections(dup_key)
        logger.info(f"  Duplicate has {len(dup_subs)} sub-collections")
        for sub in dup_subs:
            sub_name = sub["data"]["name"]
            if sub_name in canonical_sub_by_name:
                await self.merge_subcollection(sub, canonical_sub_by_name[sub_name])
            else:
                logger.info(f"  Reparent sub-collection '{sub_name}' ({sub['key']})")
                await self.patch_collection_parent(sub["key"], canonical_parent_key)
                # add to map so further duplicates merge correctly
                canonical_sub_by_name[sub_name] = sub["key"]

        # Move items still directly under the duplicate parent (loose, not in sub-collections)
        loose_moved = await self.move_items_to_collection(dup_key, canonical_parent_key)
        logger.info(f"  Moved {loose_moved} loose items from duplicate parent")

        # Finally delete the empty duplicate parent
        await self.delete_collection(dup_key)
        logger.info(f"=== Done with duplicate {dup_key} ===\n")

    async def run(self) -> None:
        if not self.c.is_configured():
            logger.error("Zotero not configured (.env)")
            return

        logger.info(f"Mode: {'APPLY' if self.apply else 'DRY-RUN'}")
        logger.info(f"Searching for top-level collections named '{COLLECTION_NAME}'...")

        tops = await self.list_top_collections()
        logger.info(f"Found {len(tops)} top-level collections in total")

        matches = [c for c in tops if c.get("data", {}).get("name") == COLLECTION_NAME]
        logger.info(f"Found {len(matches)} top-level collections named '{COLLECTION_NAME}'")

        if len(matches) <= 1:
            logger.info("No duplicates to merge.")
            return

        # Print all matches with item counts
        for m in matches:
            data = m.get("data", {})
            num = m.get("meta", {}).get("numItems", 0)
            logger.info(f"  - {m['key']}  numItems={num}  name={data.get('name')!r}")

        # Pick canonical = highest numItems (tie-break: lowest key)
        matches.sort(
            key=lambda c: (-(c.get("meta", {}).get("numItems", 0)), c["key"])
        )
        canonical = matches[0]
        duplicates = matches[1:]
        logger.info(f"\nCanonical → {canonical['key']} ({canonical.get('meta', {}).get('numItems', 0)} items)")
        logger.info(f"Duplicates → {[d['key'] for d in duplicates]}")

        for dup in duplicates:
            await self.merge_parent(dup, canonical["key"])

        logger.info("\nAll duplicates processed.")
        if not self.apply:
            logger.info("This was a DRY-RUN. Re-run with --apply to actually perform changes.")


async def main():
    apply = "--apply" in sys.argv
    client = ZoteroClient()
    try:
        merger = ZoteroMerger(client, apply=apply)
        await merger.run()
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
