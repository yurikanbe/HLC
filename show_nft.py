import blockchain
import requests
import json
import node_list

blockchain = blockchain.BlockChain()
blockchain.chain = requests.get("http://" + node_list.Node_list[0] + ":8000/chain").json()
blockchain.set_all_block_transactions()
for nft_hash,holder in blockchain.nft_calc(blockchain.all_block_transactions).items():
    print("\nNFT hash = " + nft_hash)
    print("Holder = " + holder)
    for transaction in blockchain.all_block_transactions:
        if blockchain.hash(transaction) == nft_hash:
            print("original transaction = ")
            print(transaction)
            break