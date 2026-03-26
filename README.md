## Count Every LLM Credit - Before They Disappear!

A full-stack dashboard that tracks LLM provider API credits (DeepSeek, OpenRouter) in one polished, real-time interface.

## Backend

Built with **Python 3.12 + Flask**. Exposes a JSON API that fetches live balances from configured LLM providers.

### Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt
```

### Configure API keys

Create (or update) `backend/.env`:

```env
OPENROUTER_API_KEY=your_openrouter_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
```

### Run

```bash
python server.py
```

The API will be available at `http://localhost:8000`.

### API Endpoints

| Method | Path            | Description                              |
|--------|-----------------|------------------------------------------|
| GET    | `/api/balances` | Returns all provider balances and health |
| GET    | `/balance`      | Legacy endpoint (key → balance map)      |
| GET    | `/`             | Serves the built frontend (production)   |

---

## Frontend

Built with **React 19 + TypeScript + Vite + Tailwind CSS**.

### Setup

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:5173`. API calls to `/api/*` are automatically proxied to the Flask backend at `http://localhost:8000` (configured in `vite.config.ts`).

> **Note:** The Flask backend must also be running for data to load.

### Production Build

```bash
npm run build
```

Outputs to `frontend/dist/`. The Flask server will serve these static files when you run `python backend/server.py`.

---

## Running in Development (both servers)

Open two terminals:

**Terminal 1 — Backend**
```bash
cd backend
venv\Scripts\activate
python server.py
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
```

Then open `http://localhost:5173` in your browser.

---

## Running in Production (Flask serves everything)

```bash
cd frontend && npm run build
cd ../backend
venv\Scripts\activate
python server.py
```

Open `http://localhost:8000`.
