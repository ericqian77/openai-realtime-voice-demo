# Security Policy

## API Keys

Do not commit OpenAI API keys or other secrets to this repository.

The demo supports two credential modes:

- Public demo mode: visitors enter their own key in the app.
- Local development mode: developers can use `.env.local`.

`.env.local` is ignored by git. Use `.env.example` for documentation only.

## Public Deployments

For public deployments, do not configure your own production `OPENAI_API_KEY` unless you intend to pay for visitor usage.

When a visitor enters a key, the browser sends it to this app's server only to create a short-lived Realtime client secret. Avoid enabling request-body logging on hosting platforms, reverse proxies, or observability tools for the session API routes.

## Reporting Issues

If you find a security issue, do not open a public issue with sensitive details. Contact the repository owner privately and include enough information to reproduce the problem.
