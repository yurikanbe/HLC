from ecdsa import BadSignatureError, VerifyingKey, SECP256k1
import binascii
import json
import pandas as pd
import os
import hashlib
from datetime import datetime, timezone
import node_list
import requests 
from concurrent.futures import ThreadPoolExecutor

POW_DIFFICULTY_ORIGIN = 1  # 低難易度に設定（デモ用）
POW_CHANGE_BLOCK_NUM = 10
POW_TARGET_SEC = 10
REWARD_AMOUNT_ORIGIN = 25  # 報酬を25HLCに設定
REWARD_CHANGE_BLOCK_NUM = 10
TRANSACTION_FILE = "./transaction_data.pkl"
BLOCKCHAIN_FILE = "./chain_data.pkl"

class BlockChain(object):
    def __init__(self):
        self.transaction_pool = {"transactions": []}
        self.chain = {"blocks": []}
        self.first_block = {
            "time": "0000-00-00T00:00:00.000000+00:00",
            "transactions": [],
            "hash": "SimplestBlockChain",
            "nonce": 0
        }
        self.chain["blocks"].append(self.first_block)
        self.all_block_transactions = []
        self.my_address = ""
        self.current_pow_difficulty = POW_DIFFICULTY_ORIGIN

    def save_transaction_pool(self):
        pd.to_pickle(self.transaction_pool, TRANSACTION_FILE)

    def load_transaction_pool(self):
        if os.path.exists(TRANSACTION_FILE):
            transaction_data = pd.read_pickle(TRANSACTION_FILE)
            return transaction_data
        else:
            return {"transactions": []}

    def add_transaction_pool(self, transaction):
        if (transaction not in self.all_block_transactions) and (transaction not in self.transaction_pool["transactions"]):
            self.transaction_pool["transactions"].append(transaction)
            return True
        else:
            return False

    def verify_transaction(self, transaction):
        if transaction["amount"] < 0:
            return False
        if transaction["amount"] !=0 and (transaction["nft_data"] != "" or transaction["nft_origin"] != ""):
            return False
        if transaction["amount"] == 0 and((transaction["nft_data"] == "") ==(transaction["nft_origin"] == "")) or 10000 < len(transaction["nft_data"]):
            return False
        public_key = VerifyingKey.from_string(binascii.unhexlify(transaction["sender"]), curve=SECP256k1)
        signature = binascii.unhexlify(transaction["signature"])
        unsigned_transaction = {
            "time": transaction["time"],
            "sender": transaction["sender"],
            "receiver": transaction["receiver"],
            "amount": transaction["amount"],
            "nft_data": transaction["nft_data"],
            "nft_origin": transaction["nft_origin"]
        }
        try:
            flg = public_key.verify(signature, json.dumps(unsigned_transaction).encode('utf-8'))
            return flg
        except BadSignatureError:
            return False

    def hash(self, block):
        hash = hashlib.sha256(json.dumps(block).encode('utf-8')).hexdigest()
        return hash

    def set_all_block_transactions(self):
        self.all_block_transactions = []
        if not hasattr(self, 'chain') or self.chain is None:
            raise ValueError("ブロックチェーンが初期化されていません")
        if "blocks" not in self.chain:
            raise ValueError("ブロックチェーンに'blocks'キーがありません")
        for i in range(len(self.chain["blocks"])):
            block = self.chain["blocks"][i]
            if "transactions" not in block:
                # トランザクションがないブロックはスキップ
                continue
            for trans in block["transactions"]:
                self.all_block_transactions.append(trans)

    def save_blockchain(self):
        pd.to_pickle(self.chain, BLOCKCHAIN_FILE)

    def load_blockchain(self):
        if os.path.isfile(BLOCKCHAIN_FILE):
            blockchain_data = pd.read_pickle(BLOCKCHAIN_FILE)
            return blockchain_data
        else:
            temp_chain = {"blocks": []}
            temp_chain["blocks"].append(self.first_block)
            return temp_chain

    def verify_chain(self, chain):
        all_block_transactions = []
        current_pow_difficulty = POW_DIFFICULTY_ORIGIN
        for i in range(len(chain["blocks"])):
            block = chain["blocks"][i]
            previous_block = chain["blocks"][i-1]
            if i == 0:
                if block != self.first_block:
                    return False
            else:
                if block["hash"] != self.hash(previous_block):
                    return False
                block_without_time = {
                    "transactions": block["transactions"],
                    "hash": block["hash"],
                    "nonce": block["nonce"]
                }
                current_pow_difficulty = self.get_pow_difficulty(chain["blocks"][:i], current_pow_difficulty)
                if format(int(self.hash(block_without_time),16),"0256b")[-current_pow_difficulty:] != '0'*current_pow_difficulty:
                    return False
                reward_trans_flg = False
                for transaction in block["transactions"]:
                    if transaction["sender"] == "Blockchain":
                        if reward_trans_flg == False:
                            reward_trans_flg = True
                        else:
                            return False
                        if transaction["amount"] != self.get_reward(i):
                            return False
                    else:
                        if self.verify_transaction(transaction) == False:
                            return False
                    if transaction not in all_block_transactions:
                        all_block_transactions.append(transaction)
                    else:
                        return False
        if all_block_transactions != []:
            if min(self.account_calc(all_block_transactions).values()) < 0:
                return False
            if self.nft_calc(all_block_transactions) == False:
                return False
        self.current_pow_difficulty = current_pow_difficulty
        return True

    def replace_chain(self, chain):       
        self.chain = chain
        self.set_all_block_transactions()
        for transaction in self.all_block_transactions:
            if transaction in self.transaction_pool["transactions"]:
                self.transaction_pool["transactions"].remove(transaction)
    
    def create_new_block(self, miner):
        reward_transaction = {
            "time":datetime.now(timezone.utc).isoformat(),
            "sender":"Blockchain",
            "receiver":miner,
            "amount":self.get_reward(len(self.chain["blocks"])),
            "nft_data":"",
            "nft_origin":"",
            "signature":"none"
        }
        # トランザクションプールが存在しない場合のエラーハンドリング
        if not hasattr(self, 'transaction_pool') or self.transaction_pool is None:
            self.transaction_pool = {"transactions": []}
        
        transaction = self.transaction_pool.get("transactions", []).copy()
        transaction.append(reward_transaction)
        
        # ブロックチェーンが空の場合のエラーハンドリング
        if not self.chain or not self.chain.get("blocks") or len(self.chain["blocks"]) == 0:
            raise ValueError("ブロックチェーンが初期化されていません")
        
        last_block = self.chain["blocks"][-1]
        hash = self.hash(last_block)
        block_without_time = {
            "transactions":transaction,
            "hash":hash,
            "nonce":0,
        }
        self.current_pow_difficulty = self.get_pow_difficulty(self.chain["blocks"], self.current_pow_difficulty)
        
        # PoW計算（難易度1でも時間がかかる可能性があるため、進捗をログに記録）
        nonce_count = 0
        max_nonce = 1000000  # 安全のための上限（難易度1なら通常はすぐに見つかる）
        while not format(int(self.hash(block_without_time), 16), '0256b')[-self.current_pow_difficulty:] == '0'*self.current_pow_difficulty:
            block_without_time["nonce"] += 1
            nonce_count += 1
            if nonce_count >= max_nonce:
                raise ValueError(f"PoW計算が上限({max_nonce})に達しました。難易度が高すぎる可能性があります。")
            # 10万回ごとに進捗をログに記録
            if nonce_count % 100000 == 0:
                print(f"[MINING] PoW計算中... nonce: {nonce_count}, difficulty: {self.current_pow_difficulty}")
        
        print(f"[MINING] PoW計算完了! nonce: {nonce_count}, difficulty: {self.current_pow_difficulty}")
        
        block = {
            "time":datetime.now(timezone.utc).isoformat(),
            "transactions":block_without_time["transactions"],
            "hash":block_without_time["hash"],
            "nonce":block_without_time["nonce"],
        }
        self.chain["blocks"].append(block)


    def account_calc(self,transactions):
        accounts={}
        transactions_copy = transactions.copy()
        for transaction in transactions_copy:
            # sender側の計算（Blockchainの場合はスキップ）
            if transaction["sender"] != "Blockchain":
                if transaction["sender"] not in accounts:
                    accounts[transaction["sender"]] = int(0)
                accounts[transaction["sender"]] -= int(transaction["amount"])
            
            # receiver側の計算（すべてのトランザクションで実行）
            if transaction["receiver"] not in accounts:
                accounts[transaction["receiver"]] = int(0)
            accounts[transaction["receiver"]] += int(transaction["amount"])
        return accounts
    
    def get_my_address(self):
        """GCPのメタデータサーバーからIPアドレスを取得。失敗した場合はローカル用のデフォルト値を使用"""
        try:
            headers = {'Metadata-Flavor': 'Google'}
            response = requests.get(
                "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip",
                headers=headers,
                timeout=2
            )
            self.my_address = response.text.strip()
        except (requests.exceptions.RequestException, requests.exceptions.Timeout):
            # ローカル環境またはGCP以外の環境では、デフォルト値を使用
            self.my_address = "localhost"
            print("警告: GCPメタデータサーバーに接続できませんでした。ローカル環境として動作します。")

    def broadcast_transaction(self, transaction):
        with ThreadPoolExecutor() as executor:
            for url in node_list.Node_List:
                if url != self.my_address:
                    executor.submit(requests.post, "http://"+url+":8000/receive_transaction", json.dumps(transaction))

    def get_pow_difficulty(self, blocks, current_pow_difficulty):
        ix = len(blocks) - 1
        if (ix-1) % POW_CHANGE_BLOCK_NUM == 0 and 1 < ix:
            all_time = 0
            for i in range(POW_CHANGE_BLOCK_NUM):
                all_time += (datetime.fromisoformat(blocks[ix-i]["time"]) - datetime.fromisoformat(blocks[ix-i-1]["time"])).total_seconds()
            if all_time / POW_CHANGE_BLOCK_NUM < POW_TARGET_SEC / 2:
                current_pow_difficulty += 1
            if 1 < current_pow_difficulty and POW_TARGET_SEC * 2 < all_time / POW_CHANGE_BLOCK_NUM:
                current_pow_difficulty -= 1
        return current_pow_difficulty
    
    def get_reward(self, ix):
        # 報酬を固定で25HLCに設定
        return REWARD_AMOUNT_ORIGIN
    
    def nft_calc(self, transactions):
        nft_holder = {}
        useless_nft_flg = False
        transactions_copy = transactions.copy()
        for transaction in transactions_copy:
            if transaction["amount"] == 0:
                nft_hash = self.hash(transaction)
                if transaction["nft_origin"] == "" and transaction["nft_data"] != "" and (nft_hash not in nft_holder):
                    nft_holder[nft_hash] = transaction["receiver"]
                elif nft_holder.get(transaction["nft_origin"]) == transaction["sender"] and transaction["nft_data"] == "":
                    nft_holder[transaction["nft_origin"]] = transaction["receiver"]
                else:
                    transaction.remove(transaction)
                    useless_nft_flg = True

        if useless_nft_flg:
            return False
        return nft_holder
    
    def get_nft_owner(self, nft_hash):
        """
        ブロックチェーンからNFTの現在の所有者を取得
        
        Args:
            nft_hash: NFTのトランザクションハッシュ（original_mint_hashまたはblockchain_hash）
        
        Returns:
            str: 所有者のウォレットアドレス（公開鍵）、見つからない場合はNone
        """
        self.set_all_block_transactions()
        nft_holders = self.nft_calc(self.all_block_transactions)
        if nft_holders == False:
            return None
        return nft_holders.get(nft_hash)
    
    def get_nft_transfer_history(self, nft_hash):
        """
        NFTの所有権移転履歴を取得
        
        Args:
            nft_hash: NFTのトランザクションハッシュ（original_mint_hash）
        
        Returns:
            list: 所有権移転のトランザクションリスト（時系列順）
        """
        self.set_all_block_transactions()
        transfer_history = []
        
        # 最初のミントトランザクションを探す
        mint_transaction = None
        for transaction in self.all_block_transactions:
            if transaction["amount"] == 0 and transaction["nft_origin"] == "" and transaction["nft_data"] != "":
                transaction_hash = self.hash(transaction)
                if transaction_hash == nft_hash:
                    mint_transaction = transaction
                    transfer_history.append({
                        "transaction": transaction,
                        "hash": transaction_hash,
                        "from": transaction["sender"],
                        "to": transaction["receiver"],
                        "type": "mint",
                        "time": transaction["time"]
                    })
                    break
        
        if not mint_transaction:
            return transfer_history
        
        # 所有権移転トランザクションを追跡
        current_hash = self.hash(mint_transaction)
        while True:
            found_transfer = False
            for transaction in self.all_block_transactions:
                # 所有権移転トランザクション: amount=0, nft_origin=前のハッシュ
                if transaction["amount"] == 0 and transaction["nft_origin"] == current_hash:
                    transfer_history.append({
                        "transaction": transaction,
                        "hash": self.hash(transaction),
                        "from": transaction["sender"],
                        "to": transaction["receiver"],
                        "type": "transfer",
                        "time": transaction["time"]
                    })
                    current_hash = self.hash(transaction)
                    found_transfer = True
                    break
            
            if not found_transfer:
                break
        
        return transfer_history
    
    def verify_nft_ownership(self, nft_hash, wallet_address):
        """
        NFTの所有権を検証
        
        Args:
            nft_hash: NFTのトランザクションハッシュ（original_mint_hash）
            wallet_address: 検証するウォレットアドレス（公開鍵）
        
        Returns:
            bool: 所有権がある場合True、ない場合False
        """
        # ウォレットアドレスを公開鍵形式に変換（0xを削除して128文字にパディング）
        public_key = wallet_address.replace("0x", "").ljust(128, "0")[:128]
        owner = self.get_nft_owner(nft_hash)
        return owner == public_key if owner else False