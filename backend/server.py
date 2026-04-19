import os
from dataclasses import dataclass
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)

DEGRADED_STATUSES = {"error", "unauthorized", "forbidden"}


@dataclass(frozen=True)
class ProviderDefinition:
    key: str
    label: str
    description: str
    endpoint: str
    auth_header: str
    token_env: str
    requires_key: bool = True


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


PROVIDER_REGISTRY: dict[str, ProviderDefinition] = {
    "deepseek": ProviderDefinition(
        key="deepseek",
        label="DeepSeek",
        description="Check the account balance for DeepSeek.",
        endpoint="https://api.deepseek.com/user/balance",
        auth_header="Authorization",
        token_env="DEEPSEEK_API_KEY",
    ),
    "openrouter": ProviderDefinition(
        key="openrouter",
        label="OpenRouter",
        description="Check the remaining OpenRouter credits.",
        endpoint="https://openrouter.ai/api/v1/credits",
        auth_header="Authorization",
        token_env="OPENROUTER_API_KEY",
    ),
}


def _format_balance(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


def _provider_error(key: str, label: str, exc: Exception) -> ProviderResult:
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)

    if status_code == 401:
        return ProviderResult(key, label, None, "unauthorized", "Unauthorized. Check the API key.")
    if status_code == 403:
        return ProviderResult(key, label, None, "forbidden", "Forbidden. The key does not have access.")
    return ProviderResult(key, label, None, "error", str(exc))


def _get_provider_token(definition: ProviderDefinition, api_key: str | None = None) -> str | None:
    if api_key:
        return api_key
    return os.getenv(definition.token_env)


def _fetch_provider_balance(definition: ProviderDefinition, api_key: str | None = None) -> ProviderResult:
    token = _get_provider_token(definition, api_key)
    if not token:
        return ProviderResult(
            definition.key,
            definition.label,
            None,
            "missing_config",
            "API key not configured",
        )

    try:
        headers = {definition.auth_header: f"Bearer {token}"}
        if definition.key == "deepseek":
            headers["Accept"] = "application/json"

        res = requests.get(definition.endpoint, headers=headers, timeout=5)
        res.raise_for_status()
        data = res.json()

        if definition.key == "deepseek":
            balance_list = data.get("balance_infos", [])
            if not balance_list:
                return ProviderResult(definition.key, definition.label, 0.0, "ok")
            total_balance = float(balance_list[0].get("total_balance", 0) or 0)
            return ProviderResult(definition.key, definition.label, _format_balance(total_balance), "ok")

        if definition.key == "openrouter":
            total = float(data.get("data", {}).get("total_credits", 0) or 0)
            used = float(data.get("data", {}).get("total_usage", 0) or 0)
            return ProviderResult(
                definition.key,
                definition.label,
                _format_balance(total - used),
                "ok",
            )

        return ProviderResult(definition.key, definition.label, None, "error", "Unsupported provider parser")
    except Exception as exc:
        return _provider_error(definition.key, definition.label, exc)


def _backend_token_configured(definition: ProviderDefinition) -> bool:
    return bool(os.getenv(definition.token_env, "").strip())


def _provider_payload(definition: ProviderDefinition) -> dict:
    return {
        "key": definition.key,
        "label": definition.label,
        "description": definition.description,
        "requires_key": definition.requires_key,
        "backend_key_configured": _backend_token_configured(definition),
    }


@app.get("/api/providers")
def api_providers():
    return jsonify(
        {
            "ok": True,
            "providers": [_provider_payload(definition) for definition in PROVIDER_REGISTRY.values()],
        }
    )


@app.post("/api/balances/check")
def api_balance_check():
    payload = request.get_json(silent=True) or {}
    provider_key = payload.get("provider_key")
    api_key = payload.get("api_key")

    if not provider_key:
        return jsonify({"ok": False, "message": "provider_key is required"}), 400

    definition = PROVIDER_REGISTRY.get(provider_key)
    if not definition:
        return jsonify({"ok": False, "message": "Unknown provider"}), 404

    result = _fetch_provider_balance(definition, api_key=api_key)
    return jsonify(
        {
            "ok": True,
            "provider": result.as_dict(),
        }
    )


@app.get("/api/balances")
def api_balances():
    providers = [_fetch_provider_balance(definition).as_dict() for definition in PROVIDER_REGISTRY.values()]
    return jsonify(
        {
            "ok": True,
            "providers": providers,
            "summary": {
                "healthy": sum(1 for item in providers if item["status"] == "ok"),
                "degraded": sum(1 for item in providers if item["status"] in DEGRADED_STATUSES),
                "configured": sum(1 for item in providers if item["status"] != "missing_config"),
            },
        }
    )


@app.get("/balance")
def balance():
    data = jsonify(_fetch_provider_balance(PROVIDER_REGISTRY["deepseek"]).as_dict())
    return data


@app.get("/")
def home():
    return send_from_directory(FRONTEND_DIST, "index.html")


@app.get("/<path:path>")
def serve_static(path: str):
    target = FRONTEND_DIST / path
    if target.is_file():
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=8000, debug=debug)
