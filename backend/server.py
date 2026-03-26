import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)

DEGRADED_STATUSES = {"error", "unauthorized", "forbidden"}


@dataclass(frozen=True)
class ProviderResult:
    key: str
    label: str
    balance: float | None
    status: str
    message: str | None = None

    def as_dict(self) -> dict:
        payload = {
            "key": self.key,
            "label": self.label,
            "status": self.status,
            "balance": self.balance,
        }

        if self.message:
            payload["message"] = self.message

        return payload


def _provider_error(key: str, label: str, exc: Exception) -> ProviderResult:
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)

    if status_code == 401:
        return ProviderResult(
            key,
            label,
            None,
            "unauthorized",
            "Unauthorized. Check the API key.",
        )

    if status_code == 403:
        return ProviderResult(
            key,
            label,
            None,
            "forbidden",
            "Forbidden. The key does not have access.",
        )

    return ProviderResult(key, label, None, "error", str(exc))


def _utc_now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def _format_balance(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


def fetch_openrouter_balance() -> ProviderResult:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return ProviderResult(
            "openrouter", "OpenRouter", None, "missing_config", "API key not configured"
        )

    try:
        res = requests.get(
            "https://openrouter.ai/api/v1/credits",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5,
        )
        res.raise_for_status()
        data = res.json()

        total = float(data.get("data", {}).get("total_credits", 0) or 0)
        used = float(data.get("data", {}).get("total_usage", 0) or 0)
        remaining = total - used

        return ProviderResult(
            "openrouter", "OpenRouter", _format_balance(remaining), "ok"
        )
    except Exception as exc:
        return _provider_error("openrouter", "OpenRouter", exc)


def fetch_deepseek_balance() -> ProviderResult:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return ProviderResult(
            "deepseek", "DeepSeek", None, "missing_config", "API key not configured"
        )

    try:
        res = requests.get(
            "https://api.deepseek.com/user/balance",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            timeout=5,
        )
        res.raise_for_status()
        data = res.json()

        balance_list = data.get("balance_infos", [])
        if not balance_list:
            return ProviderResult("deepseek", "DeepSeek", 0.0, "ok")

        total_balance = float(balance_list[0].get("total_balance", 0) or 0)
        return ProviderResult(
            "deepseek", "DeepSeek", _format_balance(total_balance), "ok"
        )
    except Exception as exc:
        return _provider_error("deepseek", "DeepSeek", exc)


PROVIDERS = [fetch_deepseek_balance, fetch_openrouter_balance]


def _build_balances_payload() -> dict:
    """Shared helper — builds the full balances payload without touching Flask."""
    providers = [provider().as_dict() for provider in PROVIDERS]

    return {
        "ok": True,
        "checked_at": _utc_now_iso(),
        "providers": providers,
        "summary": {
            "healthy": sum(1 for item in providers if item["status"] == "ok"),
            # Fix: count all degraded statuses, not just "error"
            "degraded": sum(
                1 for item in providers if item["status"] in DEGRADED_STATUSES
            ),
            "configured": sum(
                1 for item in providers if item["status"] != "missing_config"
            ),
        },
    }


@app.route("/api/balances")
def api_balances():
    return jsonify(_build_balances_payload())


@app.route("/balance")
def balance():
    # Fix: call the shared helper directly instead of invoking the view function
    data = _build_balances_payload()
    legacy = {
        item["key"]: item["balance"] if item["balance"] is not None else "error"
        for item in data["providers"]
    }
    legacy["time"] = datetime.now().strftime("%H:%M:%S")
    return jsonify(legacy)


@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIST, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    # Fix: fall back to index.html for any path that isn't a real file (SPA support)
    target = FRONTEND_DIST / path
    if target.is_file():
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


if __name__ == "__main__":
    # Fix: read debug flag from the environment — never hardcode True
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=8000, debug=debug)
