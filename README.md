# OpenAI Realtime Voice Lab

Mobile-first web demo for OpenAI realtime voice models. It lets you try three live workflows from one responsive interface:

- `gpt-realtime-2` for speech-to-speech assistant behavior and tool calls.
- `gpt-realtime-translate` for live speech translation.
- `gpt-realtime-whisper` for streaming transcription deltas.

The app does not simulate model responses. It creates short-lived Realtime client secrets from server API routes and connects from the browser with WebRTC.

## Security Model

This project is designed for bring-your-own-key demos:

- Visitors can enter their own OpenAI API key in `Session settings`.
- The browser stores that key only in the current tab with `sessionStorage`.
- The key is sent to this app's server only when creating a short-lived Realtime client secret.
- The browser uses only the short-lived client secret for the WebRTC session.
- For local development, `.env.local` is still supported as an optional fallback.

Do not deploy a public demo with your own production `OPENAI_API_KEY` unless you intend to pay for all visitor usage.

## Local Setup

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

You can either paste an OpenAI API key into the page or create `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key
```

## Deployment

Vercel is the simplest deployment target for this demo because it supports Next.js app routes without extra adapter work.

For a public BYOK deployment:

- Do not set `OPENAI_API_KEY` in production.
- Let each visitor enter their own key in the app.
- Make sure your deployment provider does not log request bodies containing user-provided keys.

This app is not suitable for GitHub Pages because it needs server API routes under `/api/session/*`.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```

## Notes

- Assistant tool results use local demo data and are intentionally marked as `local-demo-tool`.
- Microphone permissions and audio autoplay behavior should be tested in a real browser.
- Realtime API availability and model names may change; check OpenAI documentation before production use.
