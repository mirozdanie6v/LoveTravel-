import base64
import hashlib
import io
import json
import os
import pathlib
import struct
import subprocess
import tarfile
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
config["vars"]["CLOUDFLARE_AI_URL"] = processor_url + "/infer"
config_path.write_text(json.dumps(config, indent=2) + "\n")

secret_path = root / "runtime-secrets.json"
secret_path.write_text(json.dumps(runtime))
secret_path.chmod(0o600)

subprocess.run(["npm", "ci", "--no-fund", "--no-audit"], cwd=directory, check=True)
subprocess.run(["node", "--check", "worker.mjs"], cwd=directory, check=True)
print("Deploying encrypted showreel source " + payload["source_commit"], flush=True)
subprocess.run(
    ["npx", "wrangler", "deploy", "--config", "wrangler.json"],
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
    processor_url + "/infer",
    data=json.dumps(probe).encode(),
    headers={
        "Authorization": "Bearer " + runtime["SHOWREEL_PROCESSOR_KEY"],
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; VIIVERSION-Showreel/1.0; +https://viiversion.com)",
    },
)
try:
    with urllib.request.urlopen(request, timeout=240) as response:
        result = json.load(response)
    if not isinstance(result, dict):
        raise RuntimeError("AI relay returned a non-object response")
    print("WORKERS_AI_BINDING=ok", flush=True)
except Exception as error:
    print(
        "WORKERS_AI_BINDING=failed:"
        + str(getattr(error, "code", type(error).__name__)),
        flush=True,
    )
    raise
finally:
    secret_path.unlink(missing_ok=True)

health_req = urllib.request.Request(processor_url + "/health")
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
