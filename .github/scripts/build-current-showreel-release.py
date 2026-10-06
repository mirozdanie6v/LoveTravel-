import base64
import hashlib
import io
import json
import os
import pathlib
import subprocess
import tarfile

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


token = os.environ["CLOUDFLARE_API_TOKEN"]
assert token
print("::add-mask::" + token)

bridge = pathlib.Path("bridge")
editor = pathlib.Path("editor")
old_path = bridge / ".deploy-showreel" / "release-v2.enc.json"
old = json.loads(old_path.read_text())

sealed = base64.b64decode(old["sealed_private_key"])
seal_key = hashlib.sha256(b"showreel-deploy-v2:" + token.encode()).digest()
private_pem = AESGCM(seal_key).decrypt(sealed[:12], sealed[12:], b"showreel-deploy-v2")
private = serialization.load_pem_private_key(private_pem, password=None)
release_key = private.decrypt(
    base64.b64decode(old["wrapped_key"]),
    padding.OAEP(
        mgf=padding.MGF1(hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=b"showreel-release-v2",
    ),
)
cipher = base64.b64decode(old["ciphertext"])
raw = AESGCM(release_key).decrypt(cipher[:12], cipher[12:], b"showreel-release-v2")
assert hashlib.sha256(raw).hexdigest() == old["sha256"]
payload = json.loads(raw)

source_commit = subprocess.check_output(
    ["git", "-C", str(editor), "rev-parse", "HEAD"], text=True
).strip()
tracked = subprocess.check_output(
    [
        "git", "-C", str(editor), "ls-files", "-z", "--",
        ".dockerignore",
        "Dockerfile.showreel-cloudflare",
        "cloudflare/processor",
        "cloudflare/relay",
        "source",
    ]
).split(b"\0")
paths = [p.decode() for p in tracked if p]
if not paths:
    raise RuntimeError("No showreel source files selected")

archive_bytes = io.BytesIO()
with tarfile.open(fileobj=archive_bytes, mode="w:gz") as archive:
    for relative in paths:
        source = editor / relative
        if not source.is_file():
            continue
        info = archive.gettarinfo(str(source), arcname=relative)
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        with source.open("rb") as handle:
            archive.addfile(info, handle)

secrets = dict(payload.get("secrets") or {})
secrets.pop("CLOUDFLARE_AI_TOKEN", None)
secrets.pop("CLOUDFLARE_AI_URL", None)
payload["secrets"] = secrets
payload["source_commit"] = source_commit
payload["archive"] = base64.b64encode(archive_bytes.getvalue()).decode()
new_raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

nonce = os.urandom(12)
new_cipher = nonce + AESGCM(release_key).encrypt(
    nonce, new_raw, b"showreel-release-v2"
)
result = {
    "version": 2,
    "source_commit": source_commit,
    "sha256": hashlib.sha256(new_raw).hexdigest(),
    "sealed_private_key": old["sealed_private_key"],
    "wrapped_key": old["wrapped_key"],
    "ciphertext": base64.b64encode(new_cipher).decode(),
}
pathlib.Path("release-v2-current.enc.json").write_text(
    json.dumps(result, indent=2) + "\n"
)
json.dump(
    {
        "source_commit": source_commit,
        "tracked_files": len(paths),
        "archive_bytes": len(archive_bytes.getvalue()),
        "encrypted_bytes": pathlib.Path("release-v2-current.enc.json").stat().st_size,
    },
    open("release-v2-current-report.json", "w"),
    indent=2,
)
print("REFRESHED_RELEASE_SOURCE=" + source_commit)
