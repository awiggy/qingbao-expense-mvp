# Qingbao · AI-assisted expense reimbursement MVP

[中文](README.md) · **English**

**From receipts to approvals: a working reimbursement flow with optional, user-configured AI.**

Qingbao is an independent portfolio MVP for AI product design and functional validation. It includes a React frontend, an Express backend, and a SQLite database. The core expense workflow runs without an LLM API key. Users can explore preset examples, edit prompts, and choose their own compatible model service when ready.

![Qingbao expense dashboard](docs/images/dashboard.png)

## Project status

This is a **local, runnable MVP**, with a Chinese-language interface. It is not a production enterprise system. Example responses are explicitly labeled as static examples. The real model integration code is implemented, but connectivity and output quality with an actual provider have not yet been verified.

The AI workspace is a configuration and testing interface. It does not include a general-purpose workflow canvas, an MCP client, or a Skill plugin execution engine.

## Product previews

Screenshots show the running application with fictional demo roles and TEST data. Dates, amounts, and version numbers may vary with the local database and capture date.

### Expense management

Search and filter expenses, inspect status and exceptions, and group expenses into reports.

![Expense management](docs/images/expenses.png)

### Prompt configuration and examples

Edit preset identity, business guidance, and receipt extraction prompts. Static examples are separate from real API tests.

![AI configuration and examples](docs/images/ai-configuration.png)

### Bring your own model API

Configure an endpoint, model identifier, and API key. Real tests are disabled until credentials and a model are configured; no successful model calls are fabricated.

![API configuration and testing](docs/images/api-testing.png)

There is currently no public hosted demo. These images are previews; follow the instructions below to run the application locally.

## Features

| Area | Implemented capabilities |
| --- | --- |
| Dashboard | Expense/report totals by status and next-action shortcuts |
| Receipts and expenses | Image/PDF uploads, original-file previews, local OCR, manual review and entry, search and category filtering |
| Expense reports | Grouping, submission, withdrawal, revision after rejection, resubmission, CSV export |
| Approval and settlement | Employee/reviewer/finance demo roles, approval or rejection, exception notes, simulated settlement, activity history |
| Validation | Over-limit, missing receipt, potential duplicate and future-date warnings; server-side monetary and workflow checks |
| AI configuration and testing | Preset prompts, optional model API, output constraints, static examples, live test interface, drafts, published versions, rollback and run history |

## Quick start

Requires **Node.js 24** and npm.

```sh
git clone https://github.com/awiggy/qingbao-expense-mvp.git
cd qingbao-expense-mvp
npm ci
npm run build
npm start
```

- Expense application demo URL: to be added after deployment
- AI configuration and testing demo URL: to be added after deployment

The first launch creates a local database with TEST demo data. No external database or model key is required. For development, use `npm run dev`.

### Optional local OCR on macOS

With Xcode Command Line Tools / the Swift toolchain installed:

```sh
npm run ocr:build
```

OCR uses Apple Vision and PDFKit and reads up to the first 10 pages of a PDF. On other platforms, use manual entry or implement another OCR provider. The current model endpoint receives text, not receipt images.

## Walkthrough

1. In the employee role, upload a clearly marked TEST transport, hotel, or meal receipt from the upload dialog.
2. Check the amount, merchant, date, category, and purpose before saving.
3. Group expenses into a report and submit it for approval.
4. Switch to the reviewer role. Approve with an explanation for flagged expenses, or reject so the employee can revise and resubmit.
5. Switch to the finance role to record a simulated settlement. Inspect the activity history or export CSV.
6. Open the AI workspace to browse examples, then optionally connect your own model and test your prompts.

## Optional AI integration

In **AI 配置与测试 → API 接入**, enter:

- **API base URL:** the provider's API prefix, without `/chat/completions`.
- **Model:** the provider's model name or endpoint identifier.
- **API key:** enter it locally; never commit it to this repository.
- **Output format:** JSON Object or a provider-supported strict JSON Schema.

Save the configuration draft, save the key, run a real API test, adjust the prompt, and publish when ready. Publishing requires a successful conversation test with the current configuration and credentials. A single successful test validates connectivity and output structure, not business quality.

The provider must support Chat Completions and JSON output; compatibility varies. Alternatively, copy `.env.example` to `.env` before first initialization. Saved workspace configuration takes precedence over later environment variable changes.

Without a model, the application uses local OCR where available, deterministic checks, and limited text parsing. Fixed examples do not respond to prompt edits, call models, create run records, or save expenses. Live tests send text to the chosen provider and may incur provider charges.

## Architecture

```text
src/                     React + TypeScript UI
server/                  Express APIs, workflow logic, SQLite, model integration
shared/ai-prompts.json   Preset prompts
scripts/ReceiptOCR.swift Apple Vision / PDFKit OCR
public/samples/          Synthetic TEST receipts in PNG and PDF
tests/                   Workflow and model integration tests
docs/images/             Screenshots of the running app
```

Built with React 19, TypeScript, Vite 6, Express 5, Node.js 24 `node:sqlite`, Zod, and Swift.

## Validation

```sh
npm test
npm run build
```

Six tests cover the reimbursement workflow, role/state restrictions, persistence, monetary precision, field validation, CSV formula handling, model request configuration, draft/published version isolation, and credential non-disclosure. Model integration tests use controlled response stubs; they are **not real LLM quality evaluations**.

## Limitations and data handling

- CNY only. No tax invoice authenticity verification, currency conversion, or bank payments.
- Role switching is a demo mechanism, not production authentication. The AI workspace shares the local session.
- The server only binds to `127.0.0.1`. Production use requires authentication, authorization isolation, secret management, backups, and deployment adaptation.
- API keys are stored in a local plaintext file with `0600` permissions, not a production secrets vault. Keys are excluded from configuration snapshots and run logs.
- Live model calls send conversation or OCR text to the selected provider. Run records are stored locally; automated retention is not implemented.
- `data/`, environment files except the template, OCR binaries, and dependencies are excluded from Git. The repository contains source, TEST fixtures, documentation, and screenshots.

## Design reference

The product flow draws inspiration from expense grouping, conversational entry, and reimbursement workflows in [Expensify App](https://github.com/Expensify/App). Qingbao is independently implemented, does not use Expensify's private backend, and is not affiliated with Expensify. All product screenshots show Qingbao itself.
