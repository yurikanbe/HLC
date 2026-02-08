"""データベースを再作成するスクリプト"""
import os
from database import init_db, seed_initial_data, SessionLocal

# 既存のデータベースファイルを削除
db_file = "nft_marketplace_disabled.db"
if os.path.exists(db_file):
    os.remove(db_file)
    print(f"{db_file}を削除しました")

# データベースを初期化
print("データベースを初期化しています...")
init_db()
print("データベースの初期化が完了しました")

# 初期データを投入
print("初期データを投入しています...")
db = SessionLocal()
try:
    seed_initial_data(db)
    print("初期データの投入が完了しました")
finally:
    db.close()

print("データベースの再作成が完了しました！")

