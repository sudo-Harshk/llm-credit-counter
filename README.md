# LLM-CREDIT-COUNTER

**Count Every LLM Credit Before They Disappear**

A dashboard for checking provider balances from a backend-defined provider registry.

## What it does

- Shows the providers supported by the backend
- Lets the user select one provider in the UI
- Accepts a user-provided API key in the browser
- Calls the backend to check that provider's live balance
- Persists the selected provider and last fetched result locally in the browser

## Architecture

- Frontend: React 19 + TypeScript + Vite + Tailwind CSS
- Backend: Python 3.12 + Flask
- Proxy flow: browser -> Flask backend -> provider balance endpoint

The backend is the source of truth for supported providers. The frontend asks the backend which providers are available and renders that list dynamically.

## Supported providers

The current backend registry includes:

- DeepSeek
- OpenRouter

Adding a new provider means adding it to the backend registry, and the frontend will pick it up from `/api/providers`.

## Backend

The backend exposes:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/providers` | Returns the list of supported providers |
| POST | `/api/balances/check` | Checks one selected provider using the user-provided key |
| GET | `/api/balances` | Checks all registered providers with backend-configured keys |
| GET | `/balance` | Legacy endpoint |
| GET | `/` | Serves the built frontend in production |

### Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```
### Run

```bash
python server.py
```

The API will be available at `http://localhost:8000`.

## Frontend

### Setup

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

Open `http://localhost:5173`.

The frontend loads provider metadata from `GET /api/providers`, then sends the selected provider and user key to `POST /api/balances/check`.

## Development workflow

Open two terminals:

**Terminal 1 - Backend**
```bash
cd backend
venv\Scripts\activate
python server.py
```

**Terminal 2 - Frontend**
```bash
cd frontend
npm run dev
```

Then open `http://localhost:5173`.
