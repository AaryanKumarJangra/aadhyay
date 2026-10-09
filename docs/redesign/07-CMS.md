# Website CMS

- **Drafts never touch the live site.** `site_pages.draft` holds the working copy; the public site reads only published columns.
- **Workflow:** author saves drafts and submits (`cms.page.edit`); publisher requests changes or publishes now/at a time (`cms.page.publish`). Template roles: Website Author, Website Publisher. Editing a published page directly (`PUT /cms/pages/:id`), rollback and creating a published page all require publish permission.
- **Versions:** publishing pushes the previous live version into history; “restore” copies any version into the draft.
- **Blocks:** registry in `backend/contracts/src/cms-blocks.ts` (31 types, fields, defaults, style options, SEO score). One renderer (`frontend/web/src/components/blocks`) for the public site and the builder; it uses container queries so device previews are exact. HTML is sanitised server-side (sanitize-html) and client-side in the editor (allow-list, depth-first).
- **Builder:** `/app/website/pages/:id` — palette (drag or click), canvas with selection toolbar and drop zones, layers, properties (content + style), page settings + SEO (Google & social preview), undo/redo, autosave (only when content changes), version drawer, publish/schedule/request changes.
- **Media:** `GET/PATCH/DELETE /cms/media` — alt text, caption, name, usage count across pages/drafts/posts/branding; deleting a used file returns 409.
- **Tests:** `backend/test/cms.e2e.ts`.
