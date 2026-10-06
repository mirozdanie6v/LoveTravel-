import base64
import hashlib
import io
import json
import os
import pathlib
import struct
import subprocess
import tarfile
import time
import urllib.error
import urllib.request
import zlib

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


token = os.environ["CLOUDFLARE_API_TOKEN"]
account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
assert token and account
print("::add-mask::" + token, flush=True)
print("::add-mask::" + account, flush=True)

release_path = pathlib.Path("bridge/.deploy-showreel/release-v2.enc.json")
release = json.loads(release_path.read_text())

sealed = base64.b64decode(release["sealed_private_key"])
seal_key = hashlib.sha256(b"showreel-deploy-v2:" + token.encode()).digest()
private_pem = AESGCM(seal_key).decrypt(
    sealed[:12], sealed[12:], b"showreel-deploy-v2"
)
private = serialization.load_pem_private_key(private_pem, password=None)
release_key = private.decrypt(
    base64.b64decode(release["wrapped_key"]),
    padding.OAEP(
        mgf=padding.MGF1(hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=b"showreel-release-v2",
    ),
)
cipher = base64.b64decode(release["ciphertext"])
raw = AESGCM(release_key).decrypt(
    cipher[:12], cipher[12:], b"showreel-release-v2"
)
assert hashlib.sha256(raw).hexdigest() == release["sha256"]

payload = json.loads(raw)
assert payload["source_commit"] == release["source_commit"]
runtime = payload["secrets"]
# The processor talks only to the private AI relay. Old direct-provider
# credentials/routes from historical encrypted releases must not override it.
runtime.pop("CLOUDFLARE_AI_TOKEN", None)
runtime.pop("CLOUDFLARE_AI_URL", None)
runtime["CLOUDFLARE_ACCOUNT_ID"] = account
for value in runtime.values():
    if value:
        print("::add-mask::" + value, flush=True)

root = pathlib.Path(os.environ["RUNNER_TEMP"]) / "showreel-private-release-v2"
root.mkdir(mode=0o700)
with tarfile.open(
    fileobj=io.BytesIO(base64.b64decode(payload["archive"])), mode="r:gz"
) as archive:
    members = archive.getmembers()
    assert all(
        member.isfile()
        and not pathlib.PurePosixPath(member.name).is_absolute()
        and ".." not in pathlib.PurePosixPath(member.name).parts
        for member in members
    )
    archive.extractall(root, filter="data")

directory = root / "cloudflare" / "processor"
config_path = directory / "wrangler.json"
config = json.loads(config_path.read_text())
assert config["name"] == "viiversion-showreel-processor"
assert config["containers"][0]["max_instances"] == 1

subdomain_req = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/accounts/{account}/workers/subdomain",
    headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
)
with urllib.request.urlopen(subdomain_req, timeout=30) as response:
    subdomain_body = json.load(response)
subdomain = subdomain_body["result"]["subdomain"]
assert subdomain
processor_url = f"https://viiversion-showreel-processor.{subdomain}.workers.dev"
relay_url = f"https://viiversion-showreel-ai.{subdomain}.workers.dev"

relay_directory = root / "ai-relay"
relay_directory.mkdir()
relay_source = """export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/infer') return new Response(null, {status: 404});
    if (!env.SHOWREEL_PROCESSOR_KEY || request.headers.get('Authorization') !== 'Bearer ' + env.SHOWREEL_PROCESSOR_KEY) {
      return Response.json({error: 'Unauthorized'}, {status: 401});
    }
    if (request.method !== 'POST') return new Response(null, {status: 405});
    if (Number(request.headers.get('Content-Length') || 0) > 8 * 1024 * 1024) return new Response(null, {status: 413});
    const raw = await request.text();
    if (raw.length > 8 * 1024 * 1024) return new Response(null, {status: 413});
    try {
      const input = JSON.parse(raw);
      if (input.model !== env.CLOUDFLARE_VISION_MODEL || !Array.isArray(input.messages)) return new Response(null, {status: 400});
      const result = await env.AI.run(env.CLOUDFLARE_VISION_MODEL, {
        messages: input.messages,
        stream: false,
        temperature: Number.isFinite(input.temperature) ? input.temperature : 0.1,
        max_tokens: Math.min(Number(input.max_completion_tokens) || 2400, 2400),
        response_format: input.response_format || {type: 'json_object'},
        chat_template_kwargs: {enable_thinking: false},
      });
      return Response.json(result);
    } catch (error) {
      console.warn('showreel-ai-relay-failed', error?.name || 'Error');
      return Response.json({error: 'Vision temporarily unavailable'}, {status: 503});
    }
  }
};
"""
(relay_directory / "worker.mjs").write_text(relay_source)
relay_config = {
    "name": "viiversion-showreel-ai",
    "main": "worker.mjs",
    "compatibility_date": "2026-10-04",
    "ai": {"binding": "AI"},
    "vars": {"CLOUDFLARE_VISION_MODEL": config["vars"]["CLOUDFLARE_VISION_MODEL"]},
}
(relay_directory / "wrangler.json").write_text(json.dumps(relay_config, indent=2) + "\n")
relay_secret_path = root / "relay-secrets.json"
relay_secret_path.write_text(json.dumps({"SHOWREEL_PROCESSOR_KEY": runtime["SHOWREEL_PROCESSOR_KEY"]}))
relay_secret_path.chmod(0o600)

config["vars"]["CLOUDFLARE_AI_URL"] = relay_url + "/infer"
config_path.write_text(json.dumps(config, indent=2) + "\n")

secret_path = root / "runtime-secrets.json"
secret_path.write_text(json.dumps(runtime))
secret_path.chmod(0o600)

subprocess.run(["npm", "ci", "--no-fund", "--no-audit"], cwd=directory, check=True)
subprocess.run(["node", "--check", "worker.mjs"], cwd=directory, check=True)
wrangler = str(directory / "node_modules" / ".bin" / "wrangler")

print("Deploying dedicated showreel AI relay", flush=True)
subprocess.run([wrangler, "deploy", "--config", "wrangler.json"], cwd=relay_directory, check=True)
subprocess.run(
    [wrangler, "secret", "bulk", str(relay_secret_path), "--config", "wrangler.json"],
    cwd=relay_directory,
    check=True,
)
relay_secret_path.unlink(missing_ok=True)

print("Deploying encrypted showreel source " + payload["source_commit"], flush=True)
subprocess.run(
    [wrangler, "deploy", "--config", "wrangler.json"],
    cwd=directory,
    check=True,
)
subprocess.run(
    ["npx", "wrangler", "secret", "bulk", str(secret_path), "--config", "wrangler.json"],
    cwd=directory,
    check=True,
)


def chunk(name, data):
    return (
        struct.pack(">I", len(data))
        + name
        + data
        + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)
    )


png = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 32, 8, 2, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress((b"\0" + b"\xff\0\0" * 32) * 32))
    + chunk(b"IEND", b"")
)
probe = {
    "model": config["vars"]["CLOUDFLARE_VISION_MODEL"],
    "max_completion_tokens": 120,
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Identify the dominant image color in English. Return JSON with one field: color.",
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/png;base64,"
                        + base64.b64encode(png).decode()
                    },
                },
            ],
        }
    ],
}
request = urllib.request.Request(
    relay_url + "/infer",
    data=json.dumps(probe).encode(),
    headers={
        "Authorization": "Bearer " + runtime["SHOWREEL_PROCESSOR_KEY"],
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; VIIVERSION-Showreel/1.0; +https://viiversion.com)",
    },
)
try:
    result = None
    last_error = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                result = json.load(response)
            break
        except urllib.error.HTTPError as error:
            last_error = error
            # Worker secret updates create a new version and can take a few seconds
            # to reach workers.dev. Retry only the expected propagation response.
            if error.code != 401 or attempt == 5:
                raise
            time.sleep(3)
    if result is None:
        raise last_error or RuntimeError("AI relay returned no response")
    if not isinstance(result, dict):
        raise RuntimeError("AI relay returned a non-object response")
    print("WORKERS_AI_RELAY=ok", flush=True)
except Exception as error:
    print(
        "WORKERS_AI_RELAY=failed:"
        + str(getattr(error, "code", type(error).__name__)),
        flush=True,
    )
    raise
finally:
    secret_path.unlink(missing_ok=True)

health_req = urllib.request.Request(
    processor_url + "/health",
    headers={
        "Authorization": "Bearer " + runtime["PROCESSOR_ADMIN_KEY"],
        "User-Agent": "Mozilla/5.0 (compatible; VIIVERSION-Showreel/1.0; +https://viiversion.com)",
    },
)
try:
    with urllib.request.urlopen(health_req, timeout=120) as response:
        health = json.load(response)
    print(
        "PROCESSOR_HEALTH="
        + json.dumps(
            {
                "http": 200,
                "alive": bool(health.get("alive")),
                "busy": bool(health.get("busy")),
            }
        ),
        flush=True,
    )
except urllib.error.HTTPError as error:
    print("PROCESSOR_HEALTH_HTTP=" + str(error.code), flush=True)
    raise

print("SHOWREEL_PROCESSOR_DEPLOYMENT=success", flush=True)
print("PROCESSOR_URL=" + processor_url, flush=True)
