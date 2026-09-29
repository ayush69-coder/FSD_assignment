# Letterpress Bulk Email Sender

Bulk email campaign workspace with a SvelteKit frontend and the existing Hono/Bun API. Backend routes, authentication behavior, and the SQLite schema are unchanged. The frontend is statically generated, then merged into `public/`, which Hono already serves.

## Requirements

- Bun 1.0 or later
- SMTP credentials, either per-user in the app or provided through environment variables

## Local setup

1. Install dependencies:

	```sh
	bun install
	```

2. Copy `.env.example` to `.env`. Set a long, random `SESSION_SECRET`. SMTP variables are optional if each user will add an account in the app.

3. Start the API and frontend together:

	```sh
	bun run dev
	```

4. Open [http://localhost:5173](http://localhost:5173). Vite proxies API calls and the HTTP-only session cookie to Hono on port `3000`.

Useful commands:

| Command | Purpose |
| --- | --- |
| `bun run dev` | Run the Hono API and SvelteKit dev server |
| `bun run dev:backend` | Run only the Hono API on port `3000` |
| `bun run dev:frontend` | Run only the SvelteKit dev server on port `5173` |
| `bun run check:frontend` | Check Svelte and frontend TypeScript |
| `bun run build:frontend` | Generate static frontend pages and merge assets into `public/` |
| `bun run build` | Build the static frontend and existing Bun backend bundle |
| `bun run start` | Start the Hono server |

For a standalone deployment, run `bun run build:frontend` before starting Hono. Hono serves the generated `/` and `/login` pages and the `/_app/` frontend assets. The sample contact spreadsheet is available at `/public/samples/sample-contacts.xlsx`.

## Application workflow

- Create an account or sign in. The existing backend issues and validates the session cookie.
- Add an SMTP mailbox, test its connection, and optionally set it as the default.
- Compose a campaign, upload an Excel/CSV contact list, choose all contacts or a range, and write HTML content or upload an HTML template.
- Send immediately, enable batch delivery, or schedule a future send. Active batch controls and scheduled jobs appear on the overview.
- Review delivery statistics and logs; export reports as CSV or JSON, or clear the log history.

## API reference

All routes below are served by the existing Hono backend. Protected routes require the `session_token` cookie.

| Area | Routes |
| --- | --- |
| Authentication | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| SMTP configuration | `GET/POST /config/smtp`, `PUT/DELETE /config/smtp/:configId`, `POST /config/smtp/:configId/default`, `POST /config/smtp/test` |
| Campaigns | `POST /send` (multipart form: `configId`, `subject`, `htmlContent`, `excelFile`; optional batch, schedule, range, and HTML-template fields), `POST /parse-excel`, `POST /provider-info` |
| Batch operations | `GET /batch-status`, `POST /batch-pause`, `POST /batch-resume`, `DELETE /batch-cancel` |
| Scheduling | `GET /scheduled-jobs`, `DELETE /scheduled-jobs/:id` |
| Dashboard | `GET /dashboard/poll-status`, `GET /dashboard/data` |
| Reports | `GET /report`, `GET /report/export/csv`, `GET /report/export/json`, `DELETE /report/clear` |

Email delivery requires valid SMTP credentials. For Gmail, use an app password and enable 2-step verification. Keep `.env` and SMTP credentials private.

## 📋 Project Overview

This is a **Bulk Email Sender** web application currently built with **Hono** (backend) and vanilla **HTML/CSS/JavaScript** (frontend). Your assignment is to **migrate the frontend to SvelteKit** while maintaining the existing Hono backend functionality.

### Current Tech Stack
- **Backend**: Hono (Bun runtime)
- **Frontend**: Vanilla HTML/CSS/JS with Bootstrap 5, Quill Editor
- **Database**: SQLite (via Bun:sqlite)
- **Authentication**: Argon2 password hashing with session tokens
- **Email**: Nodemailer with SMTP

### Target Tech Stack
- **Backend**: Hono (keep as-is, migrate to Node.js/Deno with npm/pnpm/yarn)
- **Frontend**: **SvelteKit** (modern, enhanced version)
- **Database**: SQLite (maintain existing schema)
- **State Management**: TanStack Query (optional)
- **Authentication**: Same logic, adapted for SvelteKit

---

## 🎯 Assignment Objectives


### 1. **Implement SvelteKit Frontend**
- ✅ Create a **modern, clean UI** using SvelteKit
- ✅ Implement all existing features with enhanced UX
- ✅ Add client-side validation and error handling
- ✅ Implement responsive design (mobile-friendly)

### 2. **Remove Old Frontend**
- ✅ Delete `public/` folder (HTML, CSS, JS files)
- ✅ Remove static file serving routes from backend (except API endpoints)
- ✅ Ensure no dependencies on old frontend code

### 3. **Update Documentation**
- ✅ Update `README.md` with new architecture
- ✅ Document setup instructions for both backend and frontend
- ✅ Add API documentation
- ✅ Include screenshots/demos of new UI

## 🎨 UI/UX Requirements

### Design Principles
- **Clean and modern** design (avoid cluttered UI)
- **Intuitive navigation** (clear tabs/sections)
- **Responsive layout** (mobile, tablet, desktop)
- **Accessible** (ARIA labels, keyboard navigation)
- **Fast and performant** (lazy loading, optimistic updates)


## 💡 Pro Tips

1. **Use TypeScript strictly** - Helps catch errors early
2. **Component first** - Build reusable components
3. **API client abstraction** - Centralize API calls
4. **Form validation** - Use Zod or similar library
5. **Loading states everywhere** - Better UX
6. **Error boundaries** - Graceful error handling
7. **Optimistic updates** - Instant feedback
8. **Debounce searches** - Reduce API calls
9. **Lazy load routes** - Faster initial load
10. **Test on mobile** - Responsive design matters


## 📞 Questions?

If you have questions during implementation:
1. Check existing backend code for API behavior
2. Review types.ts for data structures
3. Test API endpoints with Postman/Thunder Client
4. Read SvelteKit docs for routing/forms
5. Use browser DevTools for debugging

---

**Good luck! 🚀 Build something amazing!**
