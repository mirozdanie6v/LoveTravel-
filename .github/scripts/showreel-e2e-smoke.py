import base64
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
import uuid

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


UA = "Mozilla/5.0 (compatible; VIIVERSION-Showreel/1.0; +https://viiversion.com)"
token = os.environ["CLOUDFLARE_API_TOKEN"]
account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
assert token and account
print("::add-mask::" + token)
print("::add-mask::" + account)

release = json.load(open("bridge/.deploy-showreel/release-v2.enc.json"))
sealed = base64.b64decode(release["sealed_private_key"])
seal_key = hashlib.sha256(b"showreel-deploy-v2:" + token.encode()).digest()
private_pem = AESGCM(seal_key).decrypt(sealed[:12], sealed[12:], b"showreel-deploy-v2")
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
raw = AESGCM(release_key).decrypt(cipher[:12], cipher[12:], b"showreel-release-v2")
assert hashlib.sha256(raw).hexdigest() == release["sha256"]
payload = json.loads(raw)
runtime = payload["secrets"]
runtime["CLOUDFLARE_ACCOUNT_ID"] = account
for value in runtime.values():
    if value:
        print("::add-mask::" + value)

root = pathlib.Path(os.environ["RUNNER_TEMP"]) / "showreel-e2e"
root.mkdir(mode=0o700)
source_root = root / "release"
source_root.mkdir()
with tarfile.open(fileobj=io.BytesIO(base64.b64decode(payload["archive"])), mode="r:gz") as archive:
    members = archive.getmembers()
    assert all(
        member.isfile()
        and not pathlib.PurePosixPath(member.name).is_absolute()
        and ".." not in pathlib.PurePosixPath(member.name).parts
        for member in members
    )
    archive.extractall(source_root, filter="data")

sys.path.insert(0, str(source_root / "source"))
from showreel.cloud_worker import CloudClient

site_url = runtime.get("SHOWREEL_SITE_URL", "https://viiversion-showreel.lorem-ipsum.chatgpt.site")
site_key = runtime["SHOWREEL_PROCESSOR_KEY"]
sites_token = runtime["SHOWREEL_SITES_TOKEN"]
admin_key = runtime["PROCESSOR_ADMIN_KEY"]
client = CloudClient(site_url, site_key, sites_token)

api_req = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/accounts/{account}/workers/subdomain",
    headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
)
with urllib.request.urlopen(api_req, timeout=30) as response:
    subdomain = json.load(response)["result"]["subdomain"]
processor_url = f"https://viiversion-showreel-processor.{subdomain}.workers.dev"


def processor_post(path):
    req = urllib.request.Request(
        processor_url + path,
        data=b"{}",
        headers={
            "Authorization": "Bearer " + admin_key,
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        raw = error.read().decode(errors="replace")
        try:
            body = json.loads(raw)
        except Exception:
            body = {"error": "non-json response"}
        safe = {
            key: value for key, value in body.items()
            if key in {"state", "error", "errorType", "category"}
        } if isinstance(body, dict) else {}
        raise RuntimeError(f"Processor {path} HTTP {error.code}: {safe}") from None


def processor_health():
    req = urllib.request.Request(
        processor_url + "/health",
        headers={"Authorization": "Bearer " + admin_key, "User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.status, json.load(response)


video = root / "smoke-source.mp4"
subprocess.run(
    [
        "ffmpeg", "-v", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24",
        "-f", "lavfi", "-i", "sine=frequency=523:sample_rate=44100",
        "-t", "4", "-c:v", "libx264", "-preset", "veryfast", "-threads", "1",
        "-c:a", "aac", "-shortest", str(video),
    ],
    check=True,
)
subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-f", "null", "-"], check=True)

prepare_code, prepare = processor_post("/prepare")
assert prepare_code == 200 and prepare.get("state") == "ready", prepare
health_code, health = processor_health()
assert health_code == 200 and health.get("alive") is True

brief = {
    "goal": "End-to-end production smoke test of automatic showreel editing",
    "specialization": "Видеомонтажёр",
    "target_seconds": 2,
    "max_clip_seconds": 2,
}
pid = client.json("projects", {"title": "E2E smoke · real Workers AI", "brief": brief})["id"]
spec = client.json(
    f"projects/{pid}/works",
    {
        "name": video.name,
        "size": video.stat().st_size,
        "contribution": "Монтаж и тестовый видеоматериал",
    },
)
with video.open("rb") as handle:
    part_number = 1
    while part := handle.read(spec["chunkSize"]):
        client.json(f"uploads/{spec['id']}/{part_number}", method="PUT", raw=part)
        part_number += 1
client.json(f"uploads/{spec['id']}/complete", method="POST")

project = client.json(f"projects/{pid}")
assert len(project["works"]) == 1 and project["works"][0]["state"] == "ready"

jid = str(uuid.uuid4())
client.json(f"projects/{pid}/jobs", {"id": jid, "brief": brief})
dispatch_code, dispatch = processor_post("/dispatch")
assert dispatch_code == 202 and dispatch.get("state") == "accepted", dispatch

progress_values = []
heartbeat_alive = False
final_job = None
deadline = time.time() + 720
while time.time() < deadline:
    try:
        code, current_health = processor_health()
        heartbeat_alive = heartbeat_alive or (code == 200 and current_health.get("alive") is True)
    except Exception:
        pass
    state = client.json(f"projects/{pid}")
    jobs = [j for j in state.get("jobs", []) if j.get("id") == jid]
    assert jobs, "Smoke job disappeared"
    final_job = jobs[0]
    detail = final_job.get("detail") or final_job.get("progressDetail") or final_job.get("progress")
    if detail and (not progress_values or progress_values[-1] != detail):
        progress_values.append(detail)
        print("PROGRESS=" + str(detail)[:300], flush=True)
    if final_job.get("state") in {"ready", "failed"}:
        break
    time.sleep(5)

assert final_job is not None
assert final_job.get("state") == "ready", final_job
result = final_job.get("result") or {}
assert result.get("videoKey"), result
assert result.get("duration", 0) > 0
assert result.get("candidates"), result
assert result.get("timeline"), result
assert heartbeat_alive

output = root / "smoke-result.mp4"
with client.request(f"projects/{pid}/artifact?job={jid}&name=video") as response:
    output.write_bytes(response.read())
assert output.stat().st_size > 0
subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-f", "null", "-"], check=True)

report = {
    "release_source_commit": release["source_commit"],
    "project": pid,
    "job": jid,
    "state": final_job["state"],
    "duration": result["duration"],
    "candidate_count": len(result["candidates"]),
    "timeline_count": len(result["timeline"]),
    "progress_updates_observed": len(progress_values),
    "heartbeat_alive": heartbeat_alive,
    "mp4_bytes": output.stat().st_size,
    "mp4_decode": "pass",
}
json.dump(report, open("showreel-e2e-smoke.json", "w"), indent=2)
print("SHOWREEL_E2E_SMOKE=" + json.dumps(report), flush=True)
