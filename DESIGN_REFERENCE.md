# Video reference implementation

The storefront follows the supplied WhatsApp video: white navigation with a centred turtle/forest mark, a full-width two-model campaign, spaced uppercase headings, circular fabric links, a winter campaign, horizontal new-arrival browsing, a four-column catalogue, filters, and a quick-view dialog. Mobile layouts use two product columns and a menu drawer.

Product photography, prices, availability, and links use the existing Koorm catalogue. The promotional section links to registration rather than claiming a new discount or newsletter subscription. The header and mobile menu use the supplied original logo, saved at `client/public/images/brand/logo-koorm.jpeg`. The main hero matches the latest Winter Edit reference: sand-beige and White Grey Stripe Cotton Shirt photos on either side, centred white overlay text, and an Explore the edit button. The duplicate winter section below the fabric categories has been removed.

## Previous generated banner (no longer displayed)

- Tool: built-in image_gen (imagegen skill), no CLI fallback.
- Saved asset: `client/public/images/campaign/modern-man.png`.
- Reference: the first extracted frame of the user-supplied video.
- Final generation prompt:

> Use case: ads-marketing. Generate a photorealistic wide menswear campaign photograph, aspect ratio 2.4:1, for a website hero. The supplied image is a composition/style reference from a screen recording, NOT an edit target. Recreate only the fashion photography in the reference: two handsome adult male models with dark hair, one wearing a sand beige long sleeve linen button-up shirt, the other wearing an olive grey long sleeve linen button-up shirt, standing on the right 62 percent of the frame, cropped around upper thighs. Left 38 percent is completely empty pale cool grey studio wall with gentle diagonal window shadows for HTML text overlay. Quiet, premium catalogue lighting, natural realistic cloth weave and skin. Models' heads fully visible with air above. Similar positions and scale to reference photograph. NO text, NO logos, NO watermarks, NO buttons, NO browser chrome, NO website UI. Output a clean photographic banner only.

## Verification

- Frontend production build passed.
- 49 frontend tests and 70 backend tests passed.
- Chrome checks covered home, catalogue, product detail, quick view, photograph navigation, Escape dismissal, mobile navigation, empty filters, and sorting.
- Live API checks covered sale, size, colour, stock, fabric search, and combined filters.
- Live layout checks passed at 390, 768, 1024, and 1440 pixels without horizontal page overflow or JavaScript errors.
- All 25 catalogue products were set to 2 units each as requested. The admin catalogue shows up to 100 products per page and supports direct stock updates. Checkout was not exercised and no orders were placed.

Run the frontend with `npm run dev` in `client` and the API with `npm run dev` in `server`. Open `http://localhost:5173`.






