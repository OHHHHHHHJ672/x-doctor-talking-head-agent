from pathlib import Path


INSERT_BLOCK = """
import re

_RH_ERROR_MAP = {
    500: {"reason": "上游服务异常", "retryable": True, "action": "请重新提交"},
    808: {"reason": "文件上传失败", "retryable": True, "action": "请重新提交"},
    809: {"reason": "文件大小超出限制", "retryable": False, "action": "请压缩视频后重试"},
    1008: {"reason": "文件大小超出限制", "retryable": False, "action": "请压缩视频后重试"},
    1010: {"reason": "服务暂不可用", "retryable": True, "action": "请稍后重新提交"},
    1011: {"reason": "系统繁忙", "retryable": True, "action": "请稍后重新提交"},
    1012: {"reason": "服务响应异常", "retryable": True, "action": "请稍后重新提交"},
}


def _rh_upload_error_payload(exc: Exception):
    text = str(exc or "").strip()
    m = re.search(r"code\\s*=\\s*(\\d{3,4})", text)
    upstream_code = int(m.group(1)) if m else None
    mapped = _RH_ERROR_MAP.get(upstream_code or 0, {"reason": "上传失败", "retryable": True, "action": "请重新提交"})
    payload = {
        "code": 1,
        "msg": f"{mapped['reason']}，{mapped['action']}",
        "reason": mapped["reason"],
        "retryable": mapped["retryable"],
        "action": mapped["action"],
    }
    if upstream_code is not None:
        payload["upstream_code"] = upstream_code
    if text:
        payload["upstream_error"] = text[:500]
    return payload
"""


def main() -> None:
    p = Path("/opt/digital-human-app/core/bff_routes.py")
    s = p.read_text(encoding="utf-8")
    if "def _rh_upload_error_payload" not in s:
        s = s.replace("from functools import wraps\n", "from functools import wraps\n" + INSERT_BLOCK + "\n")
    s = s.replace(
        "    except Exception as e:\n        return jsonify({\"code\": 1, \"msg\": str(e)}), 500\n",
        "    except Exception as e:\n        return jsonify(_rh_upload_error_payload(e)), 500\n",
        1,
    )
    p.write_text(s, encoding="utf-8")
    print("patched bff_routes.py")


if __name__ == "__main__":
    main()
