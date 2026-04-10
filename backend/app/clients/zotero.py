"""Zotero Web API v3 client for syncing papers to collections."""

import logging

from app.clients.base import BaseAPIClient
from app.config import settings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "FL-Research-Monitor"


class ZoteroClient(BaseAPIClient):
    source_name = "zotero"
    base_url = "https://api.zotero.org"
    requests_per_second = 5.0

    def _headers(self) -> dict:
        return {
            "Zotero-API-Version": "3",
            "Authorization": f"Bearer {settings.zotero_api_key}",
            "Content-Type": "application/json",
        }

    @property
    def user_prefix(self) -> str:
        return f"/users/{settings.zotero_user_id}"

    def is_configured(self) -> bool:
        return bool(settings.zotero_api_key and settings.zotero_user_id)

    async def get_or_create_collection(self, name: str = COLLECTION_NAME, parent_key: str | None = None) -> str | None:
        """Get or create a collection. Returns collection key."""
        if not self.is_configured():
            logger.warning("[zotero] Not configured (missing API key or user ID)")
            return None

        try:
            # List collections
            response = await self._request(
                "GET",
                f"{self.user_prefix}/collections",
                headers=self._headers(),
            )
            collections = response.json()

            for col in collections:
                data = col.get("data", {})
                if data.get("name") == name:
                    # Check parent matches
                    col_parent = data.get("parentCollection", False)
                    if parent_key is None and not col_parent:
                        return col["key"]
                    if parent_key and col_parent == parent_key:
                        return col["key"]

            # Create collection
            col_data = {"name": name}
            if parent_key:
                col_data["parentCollection"] = parent_key

            response = await self._request(
                "POST",
                f"{self.user_prefix}/collections",
                headers=self._headers(),
                json=[col_data],
            )
            result = response.json()
            if result.get("successful", {}).get("0"):
                key = result["successful"]["0"]["key"]
                logger.info(f"[zotero] Created collection '{name}': {key}")
                return key

        except Exception as e:
            logger.error(f"[zotero] Error getting/creating collection: {e}")

        return None

    async def add_paper(
        self,
        collection_keys: list[str],
        title: str,
        authors: list[dict],
        doi: str | None = None,
        abstract: str | None = None,
        journal: str | None = None,
        date: str | None = None,
        url: str | None = None,
        paper_type: str = "journalArticle",
        tags: list[str] | None = None,
        extra: str | None = None,
    ) -> str | None:
        """Add a paper to one or more Zotero collections. Returns item key or None."""
        if not self.is_configured():
            return None

        # Map paper_type
        zotero_type = {
            "journal_article": "journalArticle",
            "preprint": "preprint",
            "conference": "conferencePaper",
            "review": "journalArticle",
        }.get(paper_type, "journalArticle")

        # Build creators
        creators = []
        for author in authors[:20]:
            name = author.get("name", "")
            parts = name.rsplit(" ", 1)
            creators.append({
                "creatorType": "author",
                "firstName": parts[0] if len(parts) > 1 else "",
                "lastName": parts[-1],
            })

        item_data: dict = {
            "itemType": zotero_type,
            "title": title,
            "creators": creators,
            "abstractNote": abstract or "",
            "date": date or "",
            "DOI": doi or "",
            "url": url or (f"https://doi.org/{doi}" if doi else ""),
            "collections": collection_keys,
        }
        # Tags
        if tags:
            item_data["tags"] = [{"tag": t} for t in tags]

        # Extra field (for rating, custom metadata)
        if extra:
            item_data["extra"] = extra

        # Journal field name depends on item type
        if zotero_type == "conferencePaper":
            item_data["proceedingsTitle"] = journal or ""
        else:
            item_data["publicationTitle"] = journal or ""

        try:
            response = await self._request(
                "POST",
                f"{self.user_prefix}/items",
                headers=self._headers(),
                json=[item_data],
            )
            result = response.json()
            if result.get("successful", {}).get("0"):
                key = result["successful"]["0"]["key"]
                logger.info(f"[zotero] Added paper: {title[:50]}... ({key})")
                return key
            else:
                failed = result.get("failed", {})
                if failed:
                    logger.warning(f"[zotero] Failed to add paper: {failed}")

        except Exception as e:
            logger.error(f"[zotero] Error adding paper: {e}")

        return None

    async def add_note(self, parent_item_key: str, note_html: str) -> str | None:
        """Add a note to a Zotero item. Returns note key or None."""
        if not self.is_configured():
            return None
        try:
            note_data = {
                "itemType": "note",
                "parentItem": parent_item_key,
                "note": note_html,
            }
            response = await self._request(
                "POST", f"{self.user_prefix}/items",
                headers=self._headers(), json=[note_data],
            )
            result = response.json()
            if result.get("successful", {}).get("0"):
                key = result["successful"]["0"]["key"]
                logger.info(f"[zotero] Added note to {parent_item_key}: {key}")
                return key
        except Exception as e:
            logger.error(f"[zotero] Error adding note: {e}")
        return None

    async def update_extra(self, item_key: str, extra: str) -> bool:
        """Update the 'extra' field on an existing Zotero item."""
        if not self.is_configured():
            return False
        try:
            response = await self._request(
                "GET", f"{self.user_prefix}/items/{item_key}",
                headers=self._headers(),
            )
            item = response.json()
            version = item.get("version", 0)
            await self._request(
                "PATCH", f"{self.user_prefix}/items/{item_key}",
                headers={**self._headers(), "If-Unmodified-Since-Version": str(version)},
                json={"extra": extra},
            )
            logger.info(f"[zotero] Updated extra on {item_key}")
            return True
        except Exception as e:
            logger.error(f"[zotero] Error updating extra: {e}")
            return False

    async def update_tags(self, item_key: str, tags: list[str]) -> bool:
        """Update tags on an existing Zotero item."""
        if not self.is_configured():
            return False
        try:
            # Get current item version
            response = await self._request(
                "GET", f"{self.user_prefix}/items/{item_key}",
                headers=self._headers(),
            )
            item = response.json()
            version = item.get("version", 0)

            # Update with new tags
            await self._request(
                "PATCH", f"{self.user_prefix}/items/{item_key}",
                headers={**self._headers(), "If-Unmodified-Since-Version": str(version)},
                json={"tags": [{"tag": t} for t in tags]},
            )
            logger.info(f"[zotero] Updated tags on {item_key}: {len(tags)} tags")
            return True
        except Exception as e:
            logger.error(f"[zotero] Error updating tags: {e}")
            return False

    async def delete_child_notes(self, parent_item_key: str) -> int:
        """Delete all note children of a Zotero item."""
        if not self.is_configured():
            return 0
        try:
            response = await self._request(
                "GET", f"{self.user_prefix}/items/{parent_item_key}/children",
                headers=self._headers(),
            )
            deleted = 0
            for child in response.json():
                data = child.get("data", {})
                if data.get("itemType") == "note":
                    version = child.get("version", 0)
                    await self._request(
                        "DELETE", f"{self.user_prefix}/items/{data['key']}",
                        headers={**self._headers(), "If-Unmodified-Since-Version": str(version)},
                    )
                    deleted += 1
            return deleted
        except Exception as e:
            logger.warning(f"[zotero] Error deleting notes: {e}")
            return 0

    async def delete_item(self, item_key: str) -> bool:
        """Delete a Zotero item (paper + all its children)."""
        if not self.is_configured():
            return False
        try:
            # Get item version first
            response = await self._request(
                "GET", f"{self.user_prefix}/items/{item_key}", headers=self._headers()
            )
            version = response.json().get("version", 0)
            await self._request(
                "DELETE",
                f"{self.user_prefix}/items/{item_key}",
                headers={**self._headers(), "If-Unmodified-Since-Version": str(version)},
            )
            logger.info(f"[zotero] Deleted item: {item_key}")
            return True
        except Exception as e:
            logger.error(f"[zotero] Error deleting item {item_key}: {e}")
            return False

    async def delete_child_attachments(self, parent_item_key: str, filename_prefix: str) -> int:
        """Delete child attachment items matching a filename prefix."""
        if not self.is_configured():
            return 0
        try:
            response = await self._request(
                "GET",
                f"{self.user_prefix}/items/{parent_item_key}/children",
                headers=self._headers(),
            )
            children = response.json()
            deleted = 0
            for child in children:
                data = child.get("data", {})
                if data.get("itemType") == "attachment" and data.get("filename", "").lower().startswith(filename_prefix.lower()):
                    version = child.get("version", 0)
                    await self._request(
                        "DELETE",
                        f"{self.user_prefix}/items/{data['key']}",
                        headers={**self._headers(), "If-Unmodified-Since-Version": str(version)},
                    )
                    logger.info(f"[zotero] Deleted old attachment: {data.get('filename')} ({data['key']})")
                    deleted += 1
            return deleted
        except Exception as e:
            logger.warning(f"[zotero] Error deleting attachments: {e}")
            return 0

    async def upload_attachment(
        self,
        parent_item_key: str,
        file_path: str,
        filename: str,
        content_type: str = "application/pdf",
    ) -> str | None:
        """Upload a file as attachment to a Zotero item. Returns attachment key or None.

        Zotero file upload flow:
        1. Create attachment item linked to parent
        2. Get upload authorization
        3. Upload file content
        """
        if not self.is_configured():
            return None

        from pathlib import Path
        import hashlib

        path = Path(file_path)
        if not path.exists():
            logger.error(f"[zotero] File not found: {file_path}")
            return None

        file_content = path.read_bytes()
        file_size = len(file_content)
        md5 = hashlib.md5(file_content).hexdigest()

        try:
            # Step 1: Create linked attachment item
            attachment_data = {
                "itemType": "attachment",
                "parentItem": parent_item_key,
                "linkMode": "imported_file",
                "title": filename,
                "contentType": content_type,
                "filename": filename,
            }

            response = await self._request(
                "POST",
                f"{self.user_prefix}/items",
                headers=self._headers(),
                json=[attachment_data],
            )
            result = response.json()

            if not result.get("successful", {}).get("0"):
                failed = result.get("failed", {})
                logger.error(f"[zotero] Failed to create attachment item: {failed}")
                return None

            attachment_key = result["successful"]["0"]["key"]

            # Step 2: Get upload authorization
            # Try If-None-Match first (new file), fallback to If-Match (re-upload)
            import time as _time
            mtime = int(_time.time() * 1000)
            auth_body = f"md5={md5}&filename={filename}&filesize={file_size}&mtime={mtime}"
            auth_result = None

            for if_header in [("If-None-Match", "*"), ("If-Match", md5)]:
                auth_headers = {
                    **self._headers(),
                    "Content-Type": "application/x-www-form-urlencoded",
                    if_header[0]: if_header[1],
                }
                try:
                    response = await self._request(
                        "POST",
                        f"{self.user_prefix}/items/{attachment_key}/file",
                        headers=auth_headers,
                        content=auth_body.encode(),
                    )
                    auth_result = response.json()
                    break
                except Exception as auth_err:
                    logger.debug(f"[zotero] Auth with {if_header[0]} failed: {auth_err}")
                    continue

            if auth_result is None:
                logger.error(f"[zotero] Upload auth failed for {filename}")
                return None

            if "exists" in auth_result:
                # File content is in Zotero storage but not linked to this new item.
                # Append a unique PDF comment to change md5 and force real upload.
                import time as _t2
                logger.info(f"[zotero] File exists in storage, forcing re-upload: {filename}")
                file_content = file_content + f"\n% Generated: {_t2.time()}".encode()
                file_size = len(file_content)
                md5 = hashlib.md5(file_content).hexdigest()
                mtime = int(_t2.time() * 1000)
                auth_body = f"md5={md5}&filename={filename}&filesize={file_size}&mtime={mtime}"
                try:
                    response = await self._request(
                        "POST",
                        f"{self.user_prefix}/items/{attachment_key}/file",
                        headers={
                            **self._headers(),
                            "Content-Type": "application/x-www-form-urlencoded",
                            "If-None-Match": "*",
                        },
                        content=auth_body.encode(),
                    )
                    auth_result = response.json()
                except Exception as e:
                    logger.warning(f"[zotero] Force re-upload auth failed: {e}")
                    return attachment_key

            upload_url = auth_result.get("url")
            upload_key = auth_result.get("uploadKey")
            prefix = auth_result.get("prefix", b"")
            suffix = auth_result.get("suffix", b"")

            if not upload_url:
                logger.error(f"[zotero] No upload URL received: {auth_result}")
                return None

            # Step 3: Upload file
            if isinstance(prefix, str):
                prefix = prefix.encode()
            if isinstance(suffix, str):
                suffix = suffix.encode()

            upload_body = prefix + file_content + suffix
            content_type_header = auth_result.get("contentType", "application/x-www-form-urlencoded")

            import httpx
            async with httpx.AsyncClient(timeout=60.0) as upload_client:
                upload_response = await upload_client.post(
                    upload_url,
                    content=upload_body,
                    headers={"Content-Type": content_type_header},
                )

            if upload_response.status_code not in (200, 201, 204):
                logger.error(f"[zotero] File upload failed: {upload_response.status_code}")
                return None

            # Step 4: Register upload with uploadKey
            register_body = f"upload={upload_key}".encode()
            registered = False
            for if_header in [("If-None-Match", "*"), ("If-Match", md5)]:
                try:
                    await self._request(
                        "POST",
                        f"{self.user_prefix}/items/{attachment_key}/file",
                        headers={
                            **self._headers(),
                            "Content-Type": "application/x-www-form-urlencoded",
                            if_header[0]: if_header[1],
                        },
                        content=register_body,
                    )
                    registered = True
                    break
                except Exception:
                    continue

            if not registered:
                logger.error(f"[zotero] Failed to register upload for {filename}")
                return None

            logger.info(f"[zotero] Uploaded attachment: {filename} → {attachment_key}")
            return attachment_key

        except Exception as e:
            logger.error(f"[zotero] Attachment upload error: {e}")
            return None

    async def add_paper_to_collection(self, item_key: str, collection_key: str) -> bool:
        """Add an existing Zotero item to an additional collection."""
        if not self.is_configured():
            return False

        try:
            # Get current item data
            response = await self._request(
                "GET",
                f"{self.user_prefix}/items/{item_key}",
                headers=self._headers(),
            )
            item = response.json()
            current_collections = item.get("data", {}).get("collections", [])

            if collection_key in current_collections:
                return True  # Already in collection

            current_collections.append(collection_key)
            version = item.get("version", 0)

            # Update item
            await self._request(
                "PATCH",
                f"{self.user_prefix}/items/{item_key}",
                headers={**self._headers(), "If-Unmodified-Since-Version": str(version)},
                json={"collections": current_collections},
            )
            return True

        except Exception as e:
            logger.error(f"[zotero] Error adding item to collection: {e}")
            return False
