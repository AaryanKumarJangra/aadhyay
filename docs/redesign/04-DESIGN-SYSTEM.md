# Design system (web)

Light, calm, data-rich. Tokens live in `frontend/web/src/app/globals.css` (`@theme`); components in `src/components/ui`, charts in `src/components/charts`.

- **Colour:** off-white canvas `#f6f7fb`, white surfaces, hairline borders `#e6e8ef`; tenant brand arrives as `--brand` (fallback `#2563eb`) with `brand-soft` / `brand-line` derived via `color-mix`. Status: ok teal, warn amber, bad red, info blue — always paired with an icon or word.
- **Charts:** validated categorical order `--color-series-1…8` (blue, orange, aqua, yellow, magenta, green, violet, red). Colour follows the entity; one axis; ≥2 series get a legend; every chart card has a table view and CSV export.
- **Type & space:** Inter; 22–24px page titles, 15px section titles, 13–14px body; Tailwind 4px units used in 8px steps.
- **Glass:** only the header (`.glass`): translucent white + blur. Everything else is solid.
- **Components:** Button/IconButton/LinkButton (loading state), Input/Select/Textarea/Checkbox/Switch/Segmented (labels, hints, errors, required, aria), Card/GlassCard/PageHeader/Breadcrumb/DescriptionList, Badge/StatusBadge/RoleBadge/ScopeBadge/Avatar, StatCard (value + delta vs named period + sparkline/progress), DataTable (search, sort, pagination, column visibility, bulk actions, CSV, card layout on phones), Modal/ConfirmDialog (consequence + optional reason)/Drawer/Toast/LinkTabs, Skeleton/PageSkeleton/EmptyState/ErrorState/Alert/AccessDenied.
- **Rules:** server components by default; tables and forms are small client components; formatter functions can’t cross the server→client boundary (use `format="inr" | "pct" | "number"`); dates formatted with an explicit timezone.
