import os
import tempfile

import requests

from core.settings import settings


def main() -> None:
    base = (settings.runninghub_base_url or "").rstrip("/")
    key = settings.rh_api_key or ""
    print("base_url=", base)
    print("api_key_len=", len(key))
    print("api_key_prefix=", key[:6] if key else "")
    print("api_key_suffix=", key[-6:] if key else "")

    print("\n== create probe ==")
    create_payload = {
        "apiKey": key,
        "workflowId": "2046420487177244674",
        "instanceType": "plus",
        "nodeInfoList": [
            {"nodeId": "1", "fieldName": "file", "fieldValue": "openapi/non-exists-video.mp4"},
            {"nodeId": "7", "fieldName": "audio", "fieldValue": "openapi/non-exists-audio.mp3"},
            {"nodeId": "24", "fieldName": "text", "fieldValue": "connectivity-test"},
        ],
    }
    try:
        r = requests.post(f"{base}/task/openapi/create", json=create_payload, timeout=30)
        print("create_http_status=", r.status_code)
        print("create_body=", r.text[:800])
    except Exception as e:
        print("create_error=", repr(e))

    print("\n== upload probe ==")
    fd, p = tempfile.mkstemp(suffix=".txt")
    os.close(fd)
    with open(p, "wb") as f:
        f.write(b"hello-runninghub-upload-test")
    try:
        with open(p, "rb") as f:
            files = {"file": ("probe.txt", f)}
            headers = {"Authorization": f"Bearer {key}"}
            r = requests.post(f"{base}/openapi/v2/media/upload/binary", headers=headers, files=files, timeout=60)
        print("upload_http_status=", r.status_code)
        print("upload_body=", r.text[:800])
    except Exception as e:
        print("upload_error=", repr(e))
    finally:
        try:
            os.remove(p)
        except OSError:
            pass


if __name__ == "__main__":
    main()
