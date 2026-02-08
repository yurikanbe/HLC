"""
本番用: GCP Secret Manager のシークレット「bc2env」を読み込み、環境変数にセットしてから main.py を起動する。
使い方:
  python run_with_secrets.py
  nohup python run_with_secrets.py > output.log 2>&1 &
"""
import os
import subprocess
import sys


def load_bc2env_from_secret_manager():
    """Secret Manager の bc2env（.env 形式の複数行）を取得し、環境変数にセットする。"""
    project_id = os.getenv("GCP_PROJECT_ID", "halcoin1")
    secret_id = "bc2env"

    try:
        from google.cloud import secretmanager
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        payload = response.payload.data.decode("utf-8")
    except Exception as e:
        print(f"[run_with_secrets] Secret Manager 取得エラー: {e}", file=sys.stderr)
        return False

    # .env 形式: 1行ずつ KEY=VALUE をパース（空行・# はスキップ）
    for line in payload.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            # クォート除去（" や ' で囲まれていれば外す）
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"\'":
                value = value[1:-1]
            if key:
                os.environ[key] = value

    return True


if __name__ == "__main__":
    if not load_bc2env_from_secret_manager():
        print("[run_with_secrets] 環境変数は既存のまま main.py を起動します。", file=sys.stderr)
    subprocess.run([sys.executable, "main.py"], env=os.environ)
