from pathlib import Path


def main() -> None:
    p = Path("/opt/digital-human-app/digital_human/runninghub_client_fixed.py")
    s = p.read_text(encoding="utf-8")

    s = s.replace(
        "MAX_RETRY = 3\n    RETRY_DELAY = 5\n    WAIT_TIMEOUT = 5400  # 90分钟，数字人任务可能运行较久\n",
        "MAX_RETRY = 3\n    RETRY_DELAY = 5\n    WAIT_TIMEOUT = 5400  # 90分钟，数字人任务可能运行较久\n    UPLOAD_MAX_RETRY = 1  # 上传失败快速返回，交由前端提示用户重试\n    UPLOAD_TIMEOUT = 60\n",
    )
    s = s.replace("for attempt in range(self.MAX_RETRY):", "for attempt in range(self.UPLOAD_MAX_RETRY):", 2)
    s = s.replace("timeout=120)", "timeout=self.UPLOAD_TIMEOUT)", 2)
    s = s.replace("if attempt < self.MAX_RETRY - 1:", "if attempt < self.UPLOAD_MAX_RETRY - 1:", 2)
    s = s.replace(
        "raise Exception(f\"v2上传失败: {result.get('message') or result.get('msg') or result}\")",
        "code = result.get('code')\n                msg = result.get('message') or result.get('msg') or result\n                raise Exception(f\"RH_UPLOAD_FAILED code={code} msg={msg}\")",
    )
    s = s.replace(
        "raise Exception(f\"旧上传失败: {result.get('msg', result)}\")",
        "raise Exception(f\"RH_UPLOAD_FAILED code={result.get('code')} msg={result.get('msg', result)}\")",
    )

    p.write_text(s, encoding="utf-8")
    print("patched runninghub_client_fixed.py")


if __name__ == "__main__":
    main()
