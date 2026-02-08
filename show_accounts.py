import blockchain
import requests
import json

try:
    blockchain_instance = blockchain.Blockchain()
    response = requests.get("http://127.0.0.1:8000/chain")
    if response.status_code == 200:
        blockchain_instance.chain = response.json()
        blockchain_instance.set_all_block_transaction()
        print(blockchain_instance.account_calc(blockchain_instance.all_block_transaction))
    else:
        print(f"APIサーバーからのレスポンスエラー: {response.status_code}")
except requests.exceptions.ConnectionError:
    print("APIサーバーに接続できません。main.pyを実行してサーバーを起動してください。")
except Exception as e:
    print(f"エラーが発生しました: {e}")